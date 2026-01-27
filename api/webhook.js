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

/* ================= FAST COMMANDS (NO DB) ================= */

async function handleFastCommands(text, chatId) {
  if (text !== "/commands") return false;

  await sendMessage(
    chatId,
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
Shows this guide`
  );

  return true;
}

/* ================= SUPABASE LOADERS ================= */

async function loadBudgets() {
  const { data } = await supabase.from("budgets").select("*");
  const budgets = {};
  (data || []).forEach((r) => (budgets[r.category] = Number(r.budget) || 0));
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
  return (data || []).map((e) => ({
    id: Number(e.id),
    telegramUserId: e.telegram_user_id,
    userName: e.user_name,
    amount: Number(e.amount) || 0,
    category: e.category,
    comment: e.comment,
    ts: e.ts,
    discarded: !!e.discarded,
    telegramMessageId: e.telegram_message_id,
  }));
}

async function saveExpenses(expenses) {
  if (!expenses.length) return;
  await supabase.from("expenses").insert(
    expenses.map((e) => ({
      telegram_user_id: e.telegramUserId,
      user_name: e.userName,
      amount: e.amount,
      category: e.category,
      comment: e.comment,
      ts: e.ts,
      discarded: e.discarded || false,
      telegram_message_id: e.telegramMessageId,
    }))
  );
}

async function updateExpense(id, updates) {
  const dbUpdates = {};
  if ("discarded" in updates) dbUpdates.discarded = updates.discarded;
  if ("amount" in updates) dbUpdates.amount = updates.amount;
  if ("category" in updates) dbUpdates.category = updates.category;
  if ("comment" in updates) dbUpdates.comment = updates.comment;

  await supabase.from("expenses").update(dbUpdates).eq("id", id);
}

async function loadMembers() {
  const { data } = await supabase.from("members").select("*");
  return (data || []).map((m) => ({
    userName: m.user_name,
    telegramUserId: m.telegram_user_id,
    displayName: m.display_name,
    username: m.username,
  }));
}

async function saveMembers(members) {
  if (!members.length) return;
  await supabase.from("members").insert(
    members.map((m) => ({
      user_name: m.userName,
      telegram_user_id: m.telegramUserId,
      display_name: m.displayName,
      username: m.username,
    }))
  );
}

async function updateMember(telegramUserId, updates) {
  const dbUpdates = {};
  if ("displayName" in updates) dbUpdates.display_name = updates.displayName;
  if ("username" in updates) dbUpdates.username = updates.username;
  if ("userName" in updates) dbUpdates.user_name = updates.userName;

  await supabase
    .from("members")
    .update(dbUpdates)
    .eq("telegram_user_id", telegramUserId);
}

async function deleteMember(userName) {
  await supabase.from("members").delete().eq("user_name", userName);
}

async function loadSettlements() {
  const { data } = await supabase.from("settlements").select("*");
  return (data || []).map((s) => ({
    userName: s.user_name,
    telegramUserId: s.telegram_user_id,
    settled: !!s.settled,
    lastSettledDate: s.last_settled_date,
  }));
}

async function saveSettlements(settlements) {
  if (!settlements.length) return;
  await supabase.from("settlements").upsert(
    settlements.map((s) => ({
      user_name: s.userName,
      telegram_user_id: s.telegramUserId,
      settled: s.settled,
      last_settled_date: s.lastSettledDate,
    })),
    { onConflict: "user_name" }
  );
}

async function updateSettlement(userName, updates) {
  const dbUpdates = {};
  if ("settled" in updates) dbUpdates.settled = updates.settled;
  if ("lastSettledDate" in updates)
    dbUpdates.last_settled_date = updates.lastSettledDate;
  if ("telegramUserId" in updates)
    dbUpdates.telegram_user_id = updates.telegramUserId;

  await supabase
    .from("settlements")
    .upsert(
      { user_name: userName, ...dbUpdates },
      { onConflict: "user_name" }
    );
}

async function resetSettlements() {
  await supabase
    .from("settlements")
    .update({ settled: false, last_settled_date: null })
    .neq("user_name", "");
}

/* ================= USER MANAGEMENT ================= */

async function ensureUserExists(telegramUserId, displayName, username) {
  const members = await loadMembers();
  const existing = members.find((m) => m.telegramUserId === telegramUserId);

  if (existing) {
    // Update display name or username if changed
    const needsUpdate =
      existing.displayName !== displayName || existing.username !== username;
    if (needsUpdate) {
      await updateMember(telegramUserId, { displayName, username });
    }
    return existing.userName;
  }

  // New user - create a unique userName
  const baseUserName = displayName || username || `user${telegramUserId}`;
  let userName = baseUserName.toLowerCase().replace(/\s+/g, "_");

  // Ensure uniqueness
  let counter = 1;
  while (members.some((m) => m.userName === userName)) {
    userName = `${baseUserName.toLowerCase().replace(/\s+/g, "_")}_${counter}`;
    counter++;
  }

  await saveMembers([
    { userName, telegramUserId, displayName, username },
  ]);

  // Also create settlement record
  await saveSettlements([
    {
      userName,
      telegramUserId,
      settled: false,
      lastSettledDate: null,
    },
  ]);

  return userName;
}

/* ================= EXPENSE PARSER ================= */

function parseExpense(text) {
  // Remove common words and normalize
  const cleaned = text
    .toLowerCase()
    .replace(/\b(spent|paid|expense|for|on|the|a|an|in|at|to)\b/g, "")
    .trim();

  // Try to find amounts and categories
  const results = [];

  // Pattern 1: number-category (90-grocery)
  const pattern1 = /(\d+(?:\.\d+)?)\s*-\s*([a-z]+)/g;
  let match;
  while ((match = pattern1.exec(cleaned)) !== null) {
    results.push({
      amount: parseFloat(match[1]),
      category: match[2],
    });
  }

  // Pattern 2: number + number - category (90+10 - grocery)
  const pattern2 = /(\d+(?:\.\d+)?(?:\s*[+]\s*\d+(?:\.\d+)?)*)\s*-\s*([a-z]+)/g;
  while ((match = pattern2.exec(cleaned)) !== null) {
    const amountStr = match[1].replace(/\s+/g, "");
    const amount = amountStr
      .split("+")
      .reduce((sum, num) => sum + parseFloat(num), 0);
    results.push({
      amount,
      category: match[2],
    });
  }

  // Pattern 3: number category (90 grocery)
  const pattern3 = /(\d+(?:\.\d+)?)\s+([a-z]+)/g;
  while ((match = pattern3.exec(cleaned)) !== null) {
    // Avoid duplicates from pattern 1 or 2
    const isDuplicate = results.some(
      (r) => r.amount === parseFloat(match[1]) && r.category === match[2]
    );
    if (!isDuplicate) {
      results.push({
        amount: parseFloat(match[1]),
        category: match[2],
      });
    }
  }

  // Pattern 4: Multiple categories (90 - grocery, ai)
  const pattern4 = /(\d+(?:\.\d+)?)\s*-\s*([a-z\s,]+)/g;
  while ((match = pattern4.exec(cleaned)) !== null) {
    const amount = parseFloat(match[1]);
    const categories = match[2]
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c);

    categories.forEach((category) => {
      const isDuplicate = results.some(
        (r) => r.amount === amount && r.category === category
      );
      if (!isDuplicate) {
        results.push({ amount, category });
      }
    });
  }

  return results;
}

/* ================= MAIN WEBHOOK HANDLER ================= */

export default async function handler(req) {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const update = await req.json();
    const message = update.message;

    if (!message || !message.text) {
      return new Response("OK", { status: 200 });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();
    const telegramUserId = message.from.id;
    const displayName = message.from.first_name || "";
    const username = message.from.username || "";
    const messageId = message.message_id;

    // Ensure user exists in database
    const userName = await ensureUserExists(
      telegramUserId,
      displayName,
      username
    );

    // Handle fast commands (no DB load needed)
    if (await handleFastCommands(text, chatId)) {
      return new Response("OK", { status: 200 });
    }

    // Load all data for other commands
    const data = {
      budgets: await loadBudgets(),
      expenses: await loadExpenses(),
      members: await loadMembers(),
      settlements: await loadSettlements(),
    };

    /* ================= CATEGORIES COMMAND ================= */

    if (text === "/categories") {
      const categories = Object.entries(data.budgets);
      if (!categories.length) {
        await sendMessage(
          chatId,
          `📂 No Categories

Use /addcategory to create one.`
        );
        return new Response("OK", { status: 200 });
      }

      const lines = categories.map(([cat, budget]) => `${cat}: ₹${budget}`);
      await sendMessage(
        chatId,
        `📂 Categories & Budgets\n\n${lines.join("\n")}`
      );
      return new Response("OK", { status: 200 });
    }

    /* ================= ADD CATEGORY ================= */

    if (text.startsWith("/addcategory")) {
      const parts = text.split(" ").filter((p) => p);
      if (parts.length < 3) {
        await sendMessage(
          chatId,
          `❌ Invalid Format

Usage: /addcategory <name> <budget>
Example: /addcategory travel 2000`
        );
        return new Response("OK", { status: 200 });
      }

      const [, cat, budget] = parts;
      if (data.budgets[cat]) {
        await sendMessage(
          chatId,
          `❌ Category Exists

"${cat}" already exists with budget ₹${data.budgets[cat]}.
Use /setbudget to update it.`
        );
        return new Response("OK", { status: 200 });
      }

      data.budgets[cat] = Number(budget);
      await saveBudgets(data.budgets);

      await sendMessage(
        chatId,
        `✅ Category Created

${cat}: ₹${budget}`
      );
      return new Response("OK", { status: 200 });
    }

    /* ================= SET BUDGET ================= */

    if (text.startsWith("/setbudget")) {
      const parts = text.split(" ").filter((p) => p);
      if (parts.length < 3) {
        await sendMessage(
          chatId,
          `❌ Invalid Format

Usage: /setbudget <name> <budget>
Example: /setbudget grocery 300`
        );
        return new Response("OK", { status: 200 });
      }

      const [, cat, budget] = parts;
      if (!data.budgets[cat]) {
        await sendMessage(
          chatId,
          `❌ Category Not Found

"${cat}" doesn't exist.
Use /categories to see available categories.`
        );
        return new Response("OK", { status: 200 });
      }

      const oldBudget = data.budgets[cat];
      data.budgets[cat] = Number(budget);
      await saveBudgets(data.budgets);

      await sendMessage(
        chatId,
        `💰 Budget Updated

${cat}
₹${oldBudget} → ₹${budget}`
      );
      return new Response("OK", { status: 200 });
    }

    /* ================= DELETE CATEGORY ================= */

    if (text.startsWith("/deletecategory")) {
      const parts = text.split(" ").filter((p) => p);
      if (parts.length < 2) {
        await sendMessage(
          chatId,
          `❌ Invalid Format

Usage: /deletecategory <name>
Example: /deletecategory ai`
        );
        return new Response("OK", { status: 200 });
      }

      const cat = parts[1];
      if (!data.budgets[cat]) {
        await sendMessage(
          chatId,
          `❌ Category Not Found

"${cat}" doesn't exist.
Use /categories to see available categories.`
        );
        return new Response("OK", { status: 200 });
      }

      delete data.budgets[cat];
      await saveBudgets(data.budgets);

      await sendMessage(
        chatId,
        `🗑️ Category Deleted

${cat} has been removed.`
      );
      return new Response("OK", { status: 200 });
    }

    /* ================= MEMBERS COMMAND ================= */

    if (text === "/members") {
      if (!data.members.length) {
        await sendMessage(
          chatId,
          `👥 No Members

Members are added automatically when they interact with the bot.`
        );
        return new Response("OK", { status: 200 });
      }

      const lines = data.members.map((m) => {
        const name = m.displayName || m.username || m.userName;
        return `• ${name}`;
      });

      await sendMessage(
        chatId,
        `👥 Registered Members\n\n${lines.join("\n")}\n\nTotal: ${data.members.length}`
      );
      return new Response("OK", { status: 200 });
    }

    /* ================= ADD MEMBER ================= */

    if (text.startsWith("/addmember")) {
      const parts = text.split(" ").filter((p) => p);
      if (parts.length < 2) {
        await sendMessage(
          chatId,
          `❌ Invalid Format

Usage: /addmember <name>
Example: /addmember John`
        );
        return new Response("OK", { status: 200 });
      }

      const name = parts.slice(1).join(" ");
      const newUserName = name.toLowerCase().replace(/\s+/g, "_");

      if (data.members.some((m) => m.userName === newUserName)) {
        await sendMessage(
          chatId,
          `❌ Member Exists

"${name}" is already registered.`
        );
        return new Response("OK", { status: 200 });
      }

      // Create member without telegram_user_id (manual addition)
      await saveMembers([
        {
          userName: newUserName,
          telegramUserId: null,
          displayName: name,
          username: null,
        },
      ]);

      // Create settlement record
      await saveSettlements([
        {
          userName: newUserName,
          telegramUserId: null,
          settled: false,
          lastSettledDate: null,
        },
      ]);

      await sendMessage(
        chatId,
        `✅ Member Added

${name} has been added to the group.`
      );
      return new Response("OK", { status: 200 });
    }

    /* ================= REMOVE MEMBER ================= */

    if (text.startsWith("/removemember")) {
      const parts = text.split(" ").filter((p) => p);
      if (parts.length < 2) {
        await sendMessage(
          chatId,
          `❌ Invalid Format

Usage: /removemember <name>
Example: /removemember John`
        );
        return new Response("OK", { status: 200 });
      }

      const name = parts.slice(1).join(" ");
      const targetUserName = name.toLowerCase().replace(/\s+/g, "_");

      const member = data.members.find((m) => m.userName === targetUserName);
      if (!member) {
        await sendMessage(
          chatId,
          `❌ Member Not Found

"${name}" is not registered.
Use /members to see all members.`
        );
        return new Response("OK", { status: 200 });
      }

      await deleteMember(targetUserName);

      await sendMessage(
        chatId,
        `🗑️ Member Removed

${name} has been removed from the group.
All their expenses will also be deleted.`
      );
      return new Response("OK", { status: 200 });
    }

    /* ================= SUMMARY COMMAND ================= */

    if (text === "/summary") {
      const categories = Object.keys(data.budgets);
      if (!categories.length) {
        await sendMessage(
          chatId,
          `📊 No Categories

Use /addcategory to create categories first.`
        );
        return new Response("OK", { status: 200 });
      }

      const activeExpenses = data.expenses.filter((e) => !e.discarded);
      const lines = [];

      for (const cat of categories) {
        const spent = activeExpenses
          .filter((e) => e.category === cat)
          .reduce((sum, e) => sum + e.amount, 0);
        const budget = data.budgets[cat];
        const remaining = budget - spent;
        const percent = budget > 0 ? ((spent / budget) * 100).toFixed(1) : 0;

        const status = remaining >= 0 ? "✅" : "⚠️";
        lines.push(
          `${status} ${cat}\n   Spent: ₹${spent} / ₹${budget} (${percent}%)\n   Remaining: ₹${remaining}`
        );
      }

      await sendMessage(
        chatId,
        `📊 Budget Summary\n\n${lines.join("\n\n")}`
      );
      return new Response("OK", { status: 200 });
    }

    /* ================= OWE COMMAND ================= */

    if (text === "/owe") {
      if (data.members.length === 0) {
        await sendMessage(
          chatId,
          `💸 No Members

No members registered yet.`
        );
        return new Response("OK", { status: 200 });
      }

      const activeExpenses = data.expenses.filter((e) => !e.discarded);
      if (!activeExpenses.length) {
        await sendMessage(
          chatId,
          `💸 No Expenses

No expenses recorded yet.`
        );
        return new Response("OK", { status: 200 });
      }

      // Calculate total spent by each user
      const userTotals = {};
      data.members.forEach((m) => {
        userTotals[m.userName] = 0;
      });

      activeExpenses.forEach((e) => {
        if (userTotals[e.userName] !== undefined) {
          userTotals[e.userName] += e.amount;
        }
      });

      const totalSpent = Object.values(userTotals).reduce(
        (sum, amt) => sum + amt,
        0
      );
      const perPerson = totalSpent / data.members.length;

      // Calculate balances
      const balances = {};
      data.members.forEach((m) => {
        balances[m.userName] = userTotals[m.userName] - perPerson;
      });

      // Separate creditors and debtors
      const creditors = [];
      const debtors = [];

      Object.entries(balances).forEach(([userName, balance]) => {
        if (balance > 0.01) {
          creditors.push({ userName, amount: balance });
        } else if (balance < -0.01) {
          debtors.push({ userName, amount: -balance });
        }
      });

      if (creditors.length === 0 && debtors.length === 0) {
        await sendMessage(
          chatId,
          `💸 All Settled!

Everyone has paid their fair share.
Total spent: ₹${totalSpent.toFixed(2)}
Per person: ₹${perPerson.toFixed(2)}`
        );
        return new Response("OK", { status: 200 });
      }

      // Calculate settlements
      const settlements = [];
      creditors.sort((a, b) => b.amount - a.amount);
      debtors.sort((a, b) => b.amount - a.amount);

      let i = 0;
      let j = 0;
      while (i < creditors.length && j < debtors.length) {
        const creditor = creditors[i];
        const debtor = debtors[j];
        const amount = Math.min(creditor.amount, debtor.amount);

        const creditorName =
          data.members.find((m) => m.userName === creditor.userName)
            ?.displayName || creditor.userName;
        const debtorName =
          data.members.find((m) => m.userName === debtor.userName)
            ?.displayName || debtor.userName;

        settlements.push(
          `${debtorName} → ${creditorName}: ₹${amount.toFixed(2)}`
        );

        creditor.amount -= amount;
        debtor.amount -= amount;

        if (creditor.amount < 0.01) i++;
        if (debtor.amount < 0.01) j++;
      }

      const lines = [
        `Total spent: ₹${totalSpent.toFixed(2)}`,
        `Per person: ₹${perPerson.toFixed(2)}`,
        "",
        "💰 Settlement Plan:",
        ...settlements,
      ];

      await sendMessage(chatId, `💸 Who Owes Whom\n\n${lines.join("\n")}`);
      return new Response("OK", { status: 200 });
    }

    /* ================= SETTLED COMMAND ================= */

    if (text === "/settled") {
      const userSettlement = data.settlements.find(
        (s) => s.userName === userName
      );

      if (!userSettlement) {
        await sendMessage(
          chatId,
          `❌ Error

Could not find your settlement record.`
        );
        return new Response("OK", { status: 200 });
      }

      if (userSettlement.settled) {
        await sendMessage(
          chatId,
          `✅ Already Settled

You're already marked as settled.
Last settled: ${formatDate(userSettlement.lastSettledDate)}`
        );
        return new Response("OK", { status: 200 });
      }

      // Mark user as settled
      await updateSettlement(userName, {
        settled: true,
        lastSettledDate: now(),
        telegramUserId,
      });

      // Refresh settlements
      const updatedSettlements = await loadSettlements();
      const allSettled = updatedSettlements.every((s) => s.settled);

      if (allSettled) {
        // Reset everything
        await resetSettlements();

        // Mark all expenses as discarded
        const activeExpenses = data.expenses.filter((e) => !e.discarded);
        for (const expense of activeExpenses) {
          await updateExpense(expense.id, { discarded: true });
        }

        await sendMessage(
          chatId,
          `🎉 All Settled!

Everyone has marked themselves as settled.
The ledger has been reset.

Previous expenses have been archived.
Start fresh with new expenses!`
        );
      } else {
        const settledCount = updatedSettlements.filter((s) => s.settled).length;
        const totalCount = updatedSettlements.length;

        await sendMessage(
          chatId,
          `✅ Marked as Settled

You've been marked as settled.

Status: ${settledCount}/${totalCount} members settled
Waiting for others to settle...`
        );
      }

      return new Response("OK", { status: 200 });
    }

    /* ================= REVERT COMMAND ================= */

    if (text === "/revert") {
      const replyTo = message.reply_to_message;
      if (!replyTo || !replyTo.message_id) {
        await sendMessage(
          chatId,
          `❌ Invalid Usage

Reply to an expense message and type /revert to undo it.`
        );
        return new Response("OK", { status: 200 });
      }

      const targetMessageId = replyTo.message_id;
      const expense = data.expenses.find(
        (e) => e.telegramMessageId === targetMessageId && !e.discarded
      );

      if (!expense) {
        await sendMessage(
          chatId,
          `❌ Expense Not Found

Could not find an active expense for that message.
It may have already been reverted.`
        );
        return new Response("OK", { status: 200 });
      }

      // Mark as discarded
      await updateExpense(expense.id, { discarded: true });

      await sendMessage(
        chatId,
        `♻️ Expense Reverted

₹${expense.amount} - ${expense.category}
has been removed from records.`,
        messageId
      );
      return new Response("OK", { status: 200 });
    }

    /* ================= EXPENSE PARSER ================= */

    // Try to parse as expense
    const parsedExpenses = parseExpense(text);

    if (parsedExpenses.length > 0) {
      const validExpenses = [];
      const errors = [];

      for (const exp of parsedExpenses) {
        if (!data.budgets[exp.category]) {
          errors.push(
            `❌ "${exp.category}" - category doesn't exist. Use /categories to see available categories.`
          );
        } else {
          validExpenses.push(exp);
        }
      }

      if (validExpenses.length === 0) {
        await sendMessage(chatId, errors.join("\n\n"));
        return new Response("OK", { status: 200 });
      }

      // Save valid expenses
      const newExpenses = validExpenses.map((exp) => ({
        telegramUserId,
        userName,
        amount: exp.amount,
        category: exp.category,
        comment: text.substring(0, 200),
        ts: now(),
        discarded: false,
        telegramMessageId: messageId,
      }));

      await saveExpenses(newExpenses);

      // Send confirmation
      const lines = validExpenses.map(
        (exp) => `₹${exp.amount} - ${exp.category}`
      );

      let response = `✅ Expense${validExpenses.length > 1 ? "s" : ""} Added\n\n${lines.join("\n")}`;

      if (errors.length > 0) {
        response += "\n\n" + errors.join("\n\n");
      }

      await sendMessage(chatId, response, messageId);
      return new Response("OK", { status: 200 });
    }

    // If no command matched and not an expense, ignore
    return new Response("OK", { status: 200 });
  } catch (err) {
    // Never throw — only log
    console.error("Webhook error:", err);
    return new Response("OK", { status: 200 });
  }
}
