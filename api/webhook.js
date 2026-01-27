import { createClient } from "@supabase/supabase-js";

/* ================= CONFIG ================= */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const BOT_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

/* ================= HELPERS ================= */

async function sendMessage(chatId, text, replyTo = null) {
  try {
    await fetch(`${BOT_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_to_message_id: replyTo || undefined,
      }),
    });
  } catch {
    await fetch(`${BOT_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  }
}

function now() {
  return new Date().toISOString();
}

function formatDate(ts) {
  if (!ts) return "Never";
  const d = new Date(ts);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ================= SUPABASE LOADERS ================= */

async function loadBudgets() {
  const { data } = await supabase.from("budgets").select("*");
  const budgets = {};
  (data || []).forEach(r => {
    if (r.category) budgets[r.category] = Number(r.budget) || 0;
  });
  return budgets;
}

async function saveBudgets(budgets) {
  await supabase.from("budgets").delete().neq("category", "");
  const rows = Object.entries(budgets).map(([category, budget]) => ({
    category,
    budget,
  }));
  if (rows.length) await supabase.from("budgets").insert(rows);
}

async function loadExpenses() {
  const { data } = await supabase.from("expenses").select("*");
  return (data || []).map(e => ({
    id: Number(e.id),
    user: e.user_name,
    amount: Number(e.amount) || 0,
    category: e.category || "",
    comment: e.comment || "",
    ts: e.ts || "",
    discarded: !!e.discarded,
  }));
}

async function saveExpenses(expenses) {
  await supabase.from("expenses").delete().neq("id", 0);
  if (!expenses.length) return;
  const rows = expenses.map(e => ({
    id: e.id,
    user_name: e.user,
    amount: e.amount,
    category: e.category,
    comment: e.comment,
    ts: e.ts,
    discarded: e.discarded,
  }));
  await supabase.from("expenses").insert(rows);
}

async function loadSettlements() {
  const { data } = await supabase.from("settlements").select("*");
  const settlements = {};
  let lastSettledDate = null;
  const members = [];
  (data || []).forEach(r => {
    settlements[r.user_name] = r.settled;
    if (r.last_settled_date) lastSettledDate = r.last_settled_date;
    members.push(r.user_name);
  });
  return { settlements, lastSettledDate, members };
}

async function saveSettlements(settlements, lastSettledDate, members = []) {
  await supabase.from("settlements").delete().neq("user_name", "");
  const all = [...new Set([...Object.keys(settlements), ...members])];
  if (!all.length) return;
  const rows = all.map(u => ({
    user_name: u,
    settled: settlements[u] || false,
    last_settled_date: lastSettledDate || null,
  }));
  await supabase.from("settlements").insert(rows);
}

/* ================= WEBHOOK ================= */

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ ok: true });

  const msg = req.body.message || req.body.edited_message;
  if (!msg?.text) return res.status(200).json({ ok: true });

  const chatId = msg.chat.id;
  const user = msg.from.first_name;
  const text = msg.text.trim();
  const messageId = msg.message_id;

  try {
    const budgets = await loadBudgets();
    const expenses = await loadExpenses();
    const { settlements, lastSettledDate, members } = await loadSettlements();
    const data = { budgets, expenses, settlements, lastSettledDate, members };

    /* ================= COMMANDS ================= */

    if (text === "/commands") {
      await sendMessage(chatId,
`📘 Expense Bot Commands Guide

🧾 Add Expenses
Format: <number>-<category>
Free text allowed. Bot understands context.

Examples:
- 90-grocery
- random text 90 grocery
- 90+10 - grocery
- 90+10 - grocery, ai

📂 View Categories
/categories
Shows all categories and budgets

➕ Add Category
/addcategory <n> <budget>
Example: /addcategory travel 2000

✏️ Update Budget
/setbudget <n> <budget>
Example: /setbudget grocery 300

🗑️ Delete Category
/deletecategory <n>
Example: /deletecategory ai

📊 Budget Summary
/summary
Shows spending vs budget for each category

👥 Manage Members
/members
Show all registered members

/addmember <name>
Add a member to expense split
Example: /addmember John

/removemember <name>
Remove a member from split
Example: /removemember John

💸 Who Owes Whom
/owe
Shows payment breakdown for equal split

✅ Settle Expenses
/settled
Mark yourself as settled
When everyone settles → ledger resets

♻️ Revert (Undo)
Reply to an expense message and type:
/revert
Removes that expense from records

ℹ️ Help
/commands
Shows this guide`);
      return;
    }

    /* ---------- /categories ---------- */
    if (text === "/categories") {
      if (!Object.keys(data.budgets).length) {
        await sendMessage(chatId,
`📂 Categories & Budgets

No categories configured yet.

Use /addcategory <n> <budget> to add one.`);
        return;
      }
      const out = Object.entries(data.budgets)
        .map(([c, b]) => `  • ${c}: ₹${b}`)
        .join("\n");
      await sendMessage(chatId,
`📂 Categories & Budgets

${out}

Use /addcategory to add more`);
      return;
    }

    /* ---------- /addcategory ---------- */
    if (text.startsWith("/addcategory")) {
      const [, cat, budget] = text.split(" ");
      if (!cat || isNaN(budget)) {
        await sendMessage(chatId,
`❌ Invalid Format

Usage: /addcategory <n> <budget>
Example: /addcategory travel 2000`);
        return;
      }
      data.budgets[cat] = Number(budget);
      await saveBudgets(data.budgets);
      await sendMessage(chatId,
`✅ Category Added

${cat}: ₹${budget}`);
      return;
    }

    /* ---------- /setbudget ---------- */
    if (text.startsWith("/setbudget")) {
      const [, cat, budget] = text.split(" ");
      if (!cat || isNaN(budget)) {
        await sendMessage(chatId,
`❌ Invalid Format

Usage: /setbudget <n> <budget>
Example: /setbudget grocery 300`);
        return;
      }
      if (!data.budgets[cat]) {
        await sendMessage(chatId,
`❌ Category Not Found

"${cat}" doesn't exist.
Use /categories to see available categories.`);
        return;
      }
      const old = data.budgets[cat];
      data.budgets[cat] = Number(budget);
      await saveBudgets(data.budgets);
      await sendMessage(chatId,
`💰 Budget Updated

${cat}
₹${old} → ₹${budget}`);
      return;
    }

    /* ---------- /deletecategory ---------- */
    if (text.startsWith("/deletecategory")) {
      const [, cat] = text.split(" ");
      if (!cat) {
        await sendMessage(chatId,
`❌ Invalid Format

Usage: /deletecategory <n>
Example: /deletecategory ai`);
        return;
      }
      if (!data.budgets[cat]) {
        await sendMessage(chatId,
`❌ Category Not Found

"${cat}" doesn't exist.
Use /categories to see available categories.`);
        return;
      }
      delete data.budgets[cat];
      await saveBudgets(data.budgets);
      await sendMessage(chatId,
`🗑️ Category Deleted

${cat} has been removed.`);
      return;
    }

    /* ---------- MEMBERS ---------- */
    if (text === "/members") {
      if (!data.members.length) {
        await sendMessage(chatId,
`👥 Registered Members

No members registered yet.

Use /addmember <name> to add members.
All registered members will be included in expense splits.`);
        return;
      }
      await sendMessage(chatId,
`👥 Registered Members

${data.members.map(m => `  • ${m}`).join("\n")}

These members will be included in /owe calculations.

Use /addmember or /removemember to manage.`);
      return;
    }

    if (text.startsWith("/addmember")) {
      const [, name] = text.split(" ");
      if (!name) {
        await sendMessage(chatId,
`❌ Invalid Format

Usage: /addmember <name>
Example: /addmember John`);
        return;
      }
      if (data.members.includes(name)) {
        await sendMessage(chatId,
`⚠️ Already Registered

${name} is already a registered member.`);
        return;
      }
      data.members.push(name);
      await saveSettlements(data.settlements, data.lastSettledDate, data.members);
      await sendMessage(chatId,
`✅ Member Added

${name} is now registered.
They will be included in expense splits.

Total members: ${data.members.length}`);
      return;
    }

    if (text.startsWith("/removemember")) {
      const [, name] = text.split(" ");
      if (!name) {
        await sendMessage(chatId,
`❌ Invalid Format

Usage: /removemember <name>
Example: /removemember John`);
        return;
      }
      if (!data.members.includes(name)) {
        await sendMessage(chatId,
`❌ Not Found

${name} is not a registered member.
Use /members to see all members.`);
        return;
      }
      data.members.splice(data.members.indexOf(name), 1);
      delete data.settlements[name];
      await saveSettlements(data.settlements, data.lastSettledDate, data.members);
      await sendMessage(chatId,
`🗑️ Member Removed

${name} has been removed.

Remaining members: ${data.members.length}`);
      return;
    }

    /* ---------- /revert ---------- */
    if (text === "/revert") {
      if (!msg.reply_to_message) {
        await sendMessage(chatId,
`❌ No Message Selected

Reply to the expense message you want to revert, then type /revert`);
        return;
      }
      const targetId = msg.reply_to_message.message_id;
      const matches = data.expenses.filter(e => e.id === targetId && !e.discarded);
      if (!matches.length) {
        await sendMessage(chatId,
`⚠️ Nothing to Revert

No active expenses found for this message.`);
        return;
      }
      const details = [];
      matches.forEach(e => {
        e.discarded = true;
        details.push(`₹${e.amount} (${e.category})`);
      });
      await saveExpenses(data.expenses);
      await sendMessage(chatId,
`♻️ Reverted ${matches.length} Expense${matches.length > 1 ? "s" : ""}

${details.join("\n")}

These expenses are now removed from calculations.`,
      targetId);
      return;
    }

    /* ---------- /summary ---------- */
    if (text === "/summary") {
      if (!Object.keys(data.budgets).length) {
        await sendMessage(chatId,
`📊 Budget Summary

No categories configured yet.
Use /addcategory to get started.`);
        return;
      }
      let reply = "📊 Budget Summary\n\n";
      let totalSpent = 0, totalBudget = 0;
      for (const [cat, limit] of Object.entries(data.budgets)) {
        const spent = data.expenses
          .filter(e => e.category === cat && !e.discarded)
          .reduce((s, e) => s + e.amount, 0);
        const pct = limit ? Math.round((spent / limit) * 100) : 0;
        totalSpent += spent;
        totalBudget += limit;
        const emoji = pct >= 100 ? "🔴" : pct >= 80 ? "🟡" : "🟢";
        reply += `${emoji} ${cat}\n   ₹${spent} / ₹${limit} (${pct}%)\n\n`;
      }
      reply += `Overall: ₹${totalSpent} / ₹${totalBudget} (${Math.round((totalSpent / totalBudget) * 100)}%)`;
      await sendMessage(chatId, reply);
      return;
    }

    /* ---------- /owe ---------- */
    if (text === "/owe") {
      const valid = data.expenses.filter(e => {
        if (e.discarded) return false;
        if (!data.lastSettledDate) return true;
        return new Date(e.ts) > new Date(data.lastSettledDate);
      });

      const spenders = [...new Set(valid.map(e => e.user))];
      const users = data.members.length ? data.members : spenders;

      if (!users.length) {
        await sendMessage(chatId,
`✨ All Clear! ✨

No members registered and no expenses recorded.

Use /addmember to register members for expense splitting.

📅 Last settled: ${formatDate(data.lastSettledDate)}`);
        return;
      }

      if (!valid.length) {
        await sendMessage(chatId,
`✨ All Clear! ✨

No unsettled expenses.
Everyone's balance is zero.

📅 Last settled: ${formatDate(data.lastSettledDate)}`);
        return;
      }

      const total = valid.reduce((s, e) => s + e.amount, 0);
      const share = total / users.length;
      const spent = {};
      users.forEach(u => spent[u] = 0);
      valid.forEach(e => spent[e.user] += e.amount);

      const balances = {};
      users.forEach(u => balances[u] = spent[u] - share);

      const debtors = Object.entries(balances)
        .filter(([, b]) => b < 0)
        .map(([u, b]) => ({ user: u, amount: -b }))
        .sort((a, b) => b.amount - a.amount);

      const creditors = Object.entries(balances)
        .filter(([, b]) => b > 0)
        .map(([u, b]) => ({ user: u, amount: b }))
        .sort((a, b) => b.amount - a.amount);

      if (!debtors.length) {
        await sendMessage(chatId,
`✨ All Clear! ✨

Everyone has paid their fair share.
No outstanding balances!

📅 Last settled: ${formatDate(data.lastSettledDate)}`);
        return;
      }

      let reply = `💸 Settlement Summary\n\nTotal Expenses: ₹${total.toFixed(2)}\nPer Person Share: ₹${share.toFixed(2)}\n\nIndividual Spending:\n`;
      users.forEach(u => {
        const diff = spent[u] - share;
        reply += diff > 0
          ? `  • ${u}: ₹${spent[u].toFixed(2)} (+₹${diff.toFixed(2)})\n`
          : diff < 0
            ? `  • ${u}: ₹${spent[u].toFixed(2)} (-₹${(-diff).toFixed(2)})\n`
            : `  • ${u}: ₹${spent[u].toFixed(2)} ✅\n`;
      });

      reply += "\nPayment Instructions:\n";
      while (debtors.length && creditors.length) {
        const d = debtors[0], c = creditors[0];
        const pay = Math.min(d.amount, c.amount);
        reply += `  → ${d.user} pays ₹${pay.toFixed(2)} to ${c.user}\n`;
        d.amount -= pay;
        c.amount -= pay;
        if (d.amount < 0.01) debtors.shift();
        if (c.amount < 0.01) creditors.shift();
      }

      reply += `\n📅 Last settled: ${formatDate(data.lastSettledDate)}`;
      await sendMessage(chatId, reply);
      return;
    }

    /* ---------- /settled ---------- */
    if (text === "/settled") {
      const valid = data.expenses.filter(e => !e.discarded);
      const users = [...new Set(valid.map(e => e.user))];
      if (!users.length) {
        await sendMessage(chatId,
`⚠️ No Active Expenses

There are no expenses to settle.`);
        return;
      }

      data.settlements[user] = true;
      const allSettled = users.every(u => data.settlements[u]);

      if (allSettled) {
        data.settlements = {};
        data.lastSettledDate = now();
        await saveSettlements(data.settlements, data.lastSettledDate, data.members);
        await sendMessage(chatId,
`🎉 Everyone Settled! 🎉

All balances cleared.
Expense history preserved.
Ready for new expenses!

📅 Settled on: ${formatDate(data.lastSettledDate)}`);
      } else {
        await saveSettlements(data.settlements, data.lastSettledDate, data.members);
        const settledUsers = Object.keys(data.settlements);
        const pendingUsers = users.filter(u => !data.settlements[u]);
        await sendMessage(chatId,
`☑️ Marked as Settled

${user} is now settled.

✅ Settled: ${settledUsers.join(", ")}
⏳ Pending: ${pendingUsers.length ? pendingUsers.join(", ") : "None"}

Waiting for everyone to confirm settlement...`);
      }
      return;
    }

    /* ================= FLEXIBLE EXPENSE PARSER ================= */

    const amounts = text.match(/\d+/g)?.map(Number) || [];
    const words = text.toLowerCase().match(/\b[a-z]+\b/g) || [];
    const categories = words.filter(w => data.budgets[w]);
    if (!amounts.length || !categories.length) return;

    if (!data.members.includes(user)) {
      data.members.push(user);
      await saveSettlements(data.settlements, data.lastSettledDate, data.members);
    }

    let pairs = [];
    if (amounts.length > 1 && categories.length === 1) {
      amounts.forEach(a => pairs.push({ amount: a, category: categories[0] }));
    } else if (amounts.length === 1 && categories.length > 1) {
      pairs.push({ amount: amounts[0], category: categories[0] });
    } else {
      for (let i = 0; i < Math.min(amounts.length, categories.length); i++) {
        pairs.push({ amount: amounts[i], category: categories[i] });
      }
    }

    let totalAdded = 0;
    let confirm = [];
    const newExpenses = [];

    for (const p of pairs) {
      totalAdded += p.amount;
      newExpenses.push({
        id: messageId,
        user,
        amount: p.amount,
        category: p.category,
        comment: text,
        ts: now(),
        discarded: false,
      });

      const futureSpent =
        data.expenses
          .filter(e => e.category === p.category && !e.discarded)
          .reduce((s, e) => s + e.amount, 0) + p.amount;

      const budget = data.budgets[p.category];
      const pct = Math.round((futureSpent / budget) * 100);
      const emoji = pct >= 100 ? "🔴" : pct >= 80 ? "🟡" : "🟢";

      confirm.push(`${emoji} ${p.category}: ₹${p.amount}\n   ${pct}% of ₹${budget} budget used`);
    }

    data.expenses.push(...newExpenses);
    await saveExpenses(data.expenses);

    await sendMessage(chatId,
`✅ Expense Recorded

👤 ${user}
💰 Total: ₹${totalAdded}

${confirm.join("\n\n")}

Reply with /revert to undo`,
    messageId);

  } catch (err) {
    await sendMessage(chatId, `❌ Error: ${err.message}`);
  }

  return res.status(200).json({ ok: true });
}
