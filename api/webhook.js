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

  return true;
}

/* ================= SUPABASE LOADERS ================= */

async function loadBudgets() {
  const { data } = await supabase.from("budgets").select("*");
  const budgets = {};
  (data || []).forEach(r => budgets[r.category] = Number(r.budget) || 0);
  return budgets;
}

async function saveBudgets(budgets) {
  await supabase.from("budgets").delete().neq("category", "");
  const rows = Object.entries(budgets).map(([category, budget]) => ({ category, budget }));
  if (rows.length) await supabase.from("budgets").insert(rows);
}

async function loadExpenses() {
  const { data } = await supabase.from("expenses").select("*");
  return (data || []).map(e => ({
    id: Number(e.id),
    user: e.user_name,
    amount: Number(e.amount) || 0,
    category: e.category,
    comment: e.comment,
    ts: e.ts,
    discarded: !!e.discarded,
  }));
}

async function saveExpenses(expenses) {
  await supabase.from("expenses").delete().neq("id", 0);
  if (!expenses.length) return;
  await supabase.from("expenses").insert(expenses.map(e => ({
    id: e.id,
    user_name: e.user,
    amount: e.amount,
    category: e.category,
    comment: e.comment,
    ts: e.ts,
    discarded: e.discarded,
  })));
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
  await supabase.from("settlements").insert(all.map(u => ({
    user_name: u,
    settled: settlements[u] || false,
    last_settled_date: lastSettledDate || null,
  })));
}

/* ================= WEBHOOK ================= */

export default async function handler(req, res) {
  // 🚨 CRITICAL: ACK FIRST to stop Telegram retry loops
  res.status(200).json({ ok: true });

  // Everything below runs AFTER Telegram is acknowledged
  try {
    if (req.method !== "POST") return;

    const msg = req.body.message || req.body.edited_message;
    if (!msg?.text) return;

    const chatId = msg.chat.id;
    const user = msg.from.first_name;
    const text = msg.text.trim();
    const messageId = msg.message_id;

    /* ================= FAST COMMANDS (NO DB) ================= */

    if (text === "/commands") {
      // fire-and-forget (DO NOT await)
      sendMessage(chatId,
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

    /* ================= SLOW PATH (DB REQUIRED) ================= */

    const budgets = await loadBudgets();
    const expenses = await loadExpenses();
    const { settlements, lastSettledDate, members } = await loadSettlements();
    const data = { budgets, expenses, settlements, lastSettledDate, members };

    // (All other commands + expense parser remain unchanged and will be placed here)

  } catch (err) {
    // Never throw — only log
    console.error("Webhook error:", err);
  }
}
