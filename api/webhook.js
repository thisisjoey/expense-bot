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
  if (text !== "/start" && text !== "/help") return false;

  await sendMessage(
    chatId,
    `💰 Expense Tracker

Add: 90-grocery or 90 grocery
Multi: 50+30-ai or 100-grocery,ai

Basic:
/categories /summary /owe /settled

Advanced:
/stats - overview
/monthly - this month
/topspenders - leaderboard
/last 10 - recent expenses
/search <term> - find expenses
/alerts - budget warnings
/clearall - delete all

Manage:
/addcategory travel 5000
/setbudget grocery 300
/addmember John
/revert - reply to expense`
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

export default async function handler(req, res) {
  try {
    // Handle Vercel's serverless function format
    if (req.method !== "POST") {
      return res.status(405).send("Method not allowed");
    }

    // Vercel automatically parses JSON into req.body
    const update = req.body;
    const message = update?.message;

    if (!message || !message.text) {
      return res.status(200).send("OK");
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
      return res.status(200).send("OK");
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
          `❌ No categories yet. Add one with:\n/addcategory name budget`
        );
        return res.status(200).send("OK");
      }

      const lines = categories.map(([cat, budget]) => `${cat}: ₹${budget}`);
      await sendMessage(chatId, `📂 Categories\n\n${lines.join("\n")}`);
      return res.status(200).send("OK");
    }

    /* ================= ADD CATEGORY ================= */

    if (text.startsWith("/addcategory")) {
      const parts = text.split(" ").filter((p) => p);
      if (parts.length < 3) {
        await sendMessage(
          chatId,
          `❌ Usage

Usage: /addcategory <name> <budget>
Example: /addcategory travel 2000`
        );
        return res.status(200).send("OK");
      }

      const [, cat, budget] = parts;
      if (data.budgets[cat]) {
        await sendMessage(
          chatId,
          `❌ Already exists

"${cat}" already exists with budget ₹${data.budgets[cat]}.
Use /setbudget to update it.`
        );
        return res.status(200).send("OK");
      }

      data.budgets[cat] = Number(budget);
      await saveBudgets(data.budgets);

      await sendMessage(
        chatId,
        `✅ Added

${cat}: ₹${budget}`
      );
      return res.status(200).send("OK");
    }

    /* ================= SET BUDGET ================= */

    if (text.startsWith("/setbudget")) {
      const parts = text.split(" ").filter((p) => p);
      if (parts.length < 3) {
        await sendMessage(
          chatId,
          `❌ Usage

Usage: /setbudget <name> <budget>
Example: /setbudget grocery 300`
        );
        return res.status(200).send("OK");
      }

      const [, cat, budget] = parts;
      if (!data.budgets[cat]) {
        await sendMessage(
          chatId,
          `❌ Not found

"${cat}" doesn't exist.
Use /categories to see available categories.`
        );
        return res.status(200).send("OK");
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
      return res.status(200).send("OK");
    }

    /* ================= DELETE CATEGORY ================= */

    if (text.startsWith("/deletecategory")) {
      const parts = text.split(" ").filter((p) => p);
      if (parts.length < 2) {
        await sendMessage(
          chatId,
          `❌ Usage

Usage: /deletecategory <name>
Example: /deletecategory ai`
        );
        return res.status(200).send("OK");
      }

      const cat = parts[1];
      if (!data.budgets[cat]) {
        await sendMessage(
          chatId,
          `❌ Not found

"${cat}" doesn't exist.
Use /categories to see available categories.`
        );
        return res.status(200).send("OK");
      }

      delete data.budgets[cat];
      await saveBudgets(data.budgets);

      await sendMessage(
        chatId,
        `🗑️ Deleted

${cat} has been removed.`
      );
      return res.status(200).send("OK");
    }

    /* ================= MEMBERS COMMAND ================= */

    if (text === "/members") {
      if (!data.members.length) {
        await sendMessage(
          chatId,
          `👥 No Members

Members are added automatically when they interact with the bot.`
        );
        return res.status(200).send("OK");
      }

      const lines = data.members.map((m) => {
        const name = m.displayName || m.username || m.userName;
        return `• ${name}`;
      });

      await sendMessage(
        chatId,
        `👥 Registered Members\n\n${lines.join("\n")}\n\nTotal: ${data.members.length}`
      );
      return res.status(200).send("OK");
    }

    /* ================= ADD MEMBER ================= */

    if (text.startsWith("/addmember")) {
      const parts = text.split(" ").filter((p) => p);
      if (parts.length < 2) {
        await sendMessage(
          chatId,
          `❌ Usage

Usage: /addmember <name>
Example: /addmember John`
        );
        return res.status(200).send("OK");
      }

      const name = parts.slice(1).join(" ");
      const newUserName = name.toLowerCase().replace(/\s+/g, "_");

      if (data.members.some((m) => m.userName === newUserName)) {
        await sendMessage(
          chatId,
          `❌ Already added

"${name}" is already registered.`
        );
        return res.status(200).send("OK");
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
        `✅ Added

${name} has been added to the group.`
      );
      return res.status(200).send("OK");
    }

    /* ================= REMOVE MEMBER ================= */

    if (text.startsWith("/removemember")) {
      const parts = text.split(" ").filter((p) => p);
      if (parts.length < 2) {
        await sendMessage(
          chatId,
          `❌ Usage

Usage: /removemember <name>
Example: /removemember John`
        );
        return res.status(200).send("OK");
      }

      const name = parts.slice(1).join(" ");
      const targetUserName = name.toLowerCase().replace(/\s+/g, "_");

      const member = data.members.find((m) => m.userName === targetUserName);
      if (!member) {
        await sendMessage(
          chatId,
          `❌ Not found

"${name}" is not registered.
Use /members to see all members.`
        );
        return res.status(200).send("OK");
      }

      await deleteMember(targetUserName);

      await sendMessage(
        chatId,
        `🗑️ Removed

${name} has been removed from the group.
All their expenses will also be deleted.`
      );
      return res.status(200).send("OK");
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
        return res.status(200).send("OK");
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
          `${status} ${cat}: ₹${spent}/₹${budget} (${percent}%) • Left: ₹${remaining}`
        );
      }

      await sendMessage(
        chatId,
        `📊 Summary\n\n${lines.join("\n")}`
      );
      return res.status(200).send("OK");
    }

    /* ================= OWE COMMAND ================= */

    if (text === "/owe") {
      if (data.members.length === 0) {
        await sendMessage(
          chatId,
          `💸 No Members

No members registered yet.`
        );
        return res.status(200).send("OK");
      }

      const activeExpenses = data.expenses.filter((e) => !e.discarded);
      if (!activeExpenses.length) {
        await sendMessage(
          chatId,
          `💸 No Expenses

No expenses recorded yet.`
        );
        return res.status(200).send("OK");
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

Total: ₹${totalSpent.toFixed(2)} • Per person: ₹${perPerson.toFixed(2)}`
        );
        return res.status(200).send("OK");
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
        `Total: ₹${totalSpent.toFixed(2)} • Per person: ₹${perPerson.toFixed(2)}`,
        "",
        ...settlements,
      ];

      await sendMessage(chatId, `💸 Settlements\n\n${lines.join("\n")}`);
      return res.status(200).send("OK");
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
        return res.status(200).send("OK");
      }

      if (userSettlement.settled) {
        await sendMessage(
          chatId,
          `✅ Already Settled

You're already marked as settled.
Last settled: ${formatDate(userSettlement.lastSettledDate)}`
        );
        return res.status(200).send("OK");
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

All settled!
Ledger reset.

Previous expenses archived.
Start fresh!`
        );
      } else {
        const settledCount = updatedSettlements.filter((s) => s.settled).length;
        const totalCount = updatedSettlements.length;

        await sendMessage(
          chatId,
          `✅ Marked as Settled

Marked as settled

Status: ${settledCount}/${totalCount} members settled
Waiting for others to settle...`
        );
      }

      return res.status(200).send("OK");
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
        return res.status(200).send("OK");
      }

      const targetMessageId = replyTo.message_id;
      const expense = data.expenses.find(
        (e) => e.telegramMessageId === targetMessageId && !e.discarded
      );

      if (!expense) {
        await sendMessage(
          chatId,
          `❌ Expense Not Found

Expense not found or already reverted.
It may have already been reverted.`
        );
        return res.status(200).send("OK");
      }

      // Mark as discarded
      await updateExpense(expense.id, { discarded: true });

      await sendMessage(
        chatId,
        `♻️ Expense Reverted

₹${expense.amount} - ${expense.category}
removed`,
        messageId
      );
      return res.status(200).send("OK");
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
        return res.status(200).send("OK");
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

      // Calculate budget progress for each category
      const budgetLines = [];
      const uniqueCategories = [...new Set(validExpenses.map(e => e.category))];
      
      for (const category of uniqueCategories) {
        const monthlyBudget = data.budgets[category];
        const dailyBudget = monthlyBudget / 30;
        const weeklyBudget = (monthlyBudget * 7) / 30;

        // Get current date info
        const nowDate = new Date();
        const currentDay = nowDate.getDate();
        const currentMonth = nowDate.getMonth();
        const currentYear = nowDate.getFullYear();
        
        // Get start of today
        const startOfToday = new Date(currentYear, currentMonth, currentDay);
        
        // Get start of this week (Monday)
        const dayOfWeek = nowDate.getDay();
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const startOfWeek = new Date(currentYear, currentMonth, currentDay - daysToMonday);
        
        // Get start of this month
        const startOfMonth = new Date(currentYear, currentMonth, 1);

        // Filter expenses by category and time period
        const categoryExpenses = data.expenses.filter(e => 
          e.category === category && !e.discarded
        );

        // Calculate spent amounts
        const spentToday = categoryExpenses
          .filter(e => new Date(e.ts) >= startOfToday)
          .reduce((sum, e) => sum + e.amount, 0);

        const spentThisWeek = categoryExpenses
          .filter(e => new Date(e.ts) >= startOfWeek)
          .reduce((sum, e) => sum + e.amount, 0);

        const spentThisMonth = categoryExpenses
          .filter(e => new Date(e.ts) >= startOfMonth)
          .reduce((sum, e) => sum + e.amount, 0);

        // Calculate percentages
        const dailyPercent = ((spentToday / dailyBudget) * 100).toFixed(0);
        const weeklyPercent = ((spentThisWeek / weeklyBudget) * 100).toFixed(0);
        const monthlyPercent = ((spentThisMonth / monthlyBudget) * 100).toFixed(0);

        // Format amounts
        const todayStr = `₹${spentToday.toFixed(0)}/₹${dailyBudget.toFixed(0)}`;
        const weekStr = `₹${spentThisWeek.toFixed(0)}/₹${weeklyBudget.toFixed(0)}`;
        const monthStr = `₹${spentThisMonth.toFixed(0)}/₹${monthlyBudget.toFixed(0)}`;

        budgetLines.push(
          `${category}:`,
          `Today: ${todayStr} (${dailyPercent}%)`,
          `Week: ${weekStr} (${weeklyPercent}%)`,
          `Month: ${monthStr} (${monthlyPercent}%)`
        );
      }

      // Send confirmation
      const lines = validExpenses.map(
        (exp) => `₹${exp.amount} - ${exp.category}`
      );

      let response = `✅ ${lines.join("\n")}`;
      
      if (budgetLines.length > 0) {
        response += `\n\n${budgetLines.join("\n")}`;
      }

      if (errors.length > 0) {
        response += "\n\n" + errors.join("\n\n");
      }

      await sendMessage(chatId, response, messageId);
      return res.status(200).send("OK");
    }

    /* ================= ADVANCED FEATURES ================= */

    /* ================= STATS COMMAND ================= */
    if (text === "/stats") {
      const activeExpenses = data.expenses.filter((e) => !e.discarded);
      
      if (!activeExpenses.length) {
        await sendMessage(chatId, `📊 No expenses yet`);
        return res.status(200).send("OK");
      }

      const total = activeExpenses.reduce((sum, e) => sum + e.amount, 0);
      const avgPerExpense = total / activeExpenses.length;
      
      // Group by user
      const byUser = {};
      activeExpenses.forEach((e) => {
        if (!byUser[e.userName]) byUser[e.userName] = 0;
        byUser[e.userName] += e.amount;
      });

      // Top spender
      const topSpender = Object.entries(byUser).sort((a, b) => b[1] - a[1])[0];
      const topSpenderName = data.members.find(m => m.userName === topSpender[0])?.displayName || topSpender[0];

      // Group by category
      const byCategory = {};
      activeExpenses.forEach((e) => {
        if (!byCategory[e.category]) byCategory[e.category] = 0;
        byCategory[e.category] += e.amount;
      });

      const topCategory = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];

      await sendMessage(
        chatId,
        `📊 Stats

Total: ₹${total.toFixed(2)}
Expenses: ${activeExpenses.length}
Avg: ₹${avgPerExpense.toFixed(2)}

Top spender: ${topSpenderName} (₹${topSpender[1]})
Top category: ${topCategory[0]} (₹${topCategory[1]})`
      );
      return res.status(200).send("OK");
    }

    /* ================= TOP SPENDERS ================= */
    if (text === "/topspenders") {
      const activeExpenses = data.expenses.filter((e) => !e.discarded);
      
      if (!activeExpenses.length) {
        await sendMessage(chatId, `🏆 No expenses yet`);
        return res.status(200).send("OK");
      }

      const byUser = {};
      activeExpenses.forEach((e) => {
        if (!byUser[e.userName]) byUser[e.userName] = 0;
        byUser[e.userName] += e.amount;
      });

      const sorted = Object.entries(byUser)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      const lines = sorted.map(([userName, amount], idx) => {
        const name = data.members.find(m => m.userName === userName)?.displayName || userName;
        const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "  ";
        return `${medal} ${name}: ₹${amount.toFixed(2)}`;
      });

      await sendMessage(chatId, `🏆 Top Spenders\n\n${lines.join("\n")}`);
      return res.status(200).send("OK");
    }

    /* ================= MONTHLY REPORT ================= */
    if (text === "/monthly") {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      const monthlyExpenses = data.expenses.filter((e) => {
        if (e.discarded) return false;
        const expenseDate = new Date(e.ts);
        return expenseDate.getMonth() === currentMonth && expenseDate.getFullYear() === currentYear;
      });

      if (!monthlyExpenses.length) {
        await sendMessage(chatId, `📅 No expenses this month`);
        return res.status(200).send("OK");
      }

      const total = monthlyExpenses.reduce((sum, e) => sum + e.amount, 0);
      const byCategory = {};
      
      monthlyExpenses.forEach((e) => {
        if (!byCategory[e.category]) byCategory[e.category] = 0;
        byCategory[e.category] += e.amount;
      });

      const monthName = now.toLocaleString('default', { month: 'long' });
      const lines = Object.entries(byCategory)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, amount]) => `${cat}: ₹${amount.toFixed(2)}`);

      await sendMessage(
        chatId,
        `📅 ${monthName} ${currentYear}

Total: ₹${total.toFixed(2)}
Expenses: ${monthlyExpenses.length}

${lines.join("\n")}`
      );
      return res.status(200).send("OK");
    }

    /* ================= SEARCH EXPENSES ================= */
    if (text.startsWith("/search ")) {
      const query = text.substring(8).toLowerCase().trim();
      
      if (!query) {
        await sendMessage(chatId, `❌ Usage: /search <term>\nExample: /search grocery`);
        return res.status(200).send("OK");
      }

      const results = data.expenses.filter((e) => {
        if (e.discarded) return false;
        return e.category.toLowerCase().includes(query) || 
               (e.comment && e.comment.toLowerCase().includes(query));
      });

      if (!results.length) {
        await sendMessage(chatId, `🔍 No results for "${query}"`);
        return res.status(200).send("OK");
      }

      const lines = results.slice(0, 10).map((e) => {
        const date = new Date(e.ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        const name = data.members.find(m => m.userName === e.userName)?.displayName || e.userName;
        return `${date} • ${name} • ₹${e.amount} - ${e.category}`;
      });

      const more = results.length > 10 ? `\n\n+${results.length - 10} more` : "";
      await sendMessage(chatId, `🔍 Results (${results.length})\n\n${lines.join("\n")}${more}`);
      return res.status(200).send("OK");
    }

    /* ================= LAST N EXPENSES ================= */
    if (text.startsWith("/last")) {
      const parts = text.split(" ");
      const count = parseInt(parts[1]) || 10;
      
      const recent = data.expenses
        .filter((e) => !e.discarded)
        .sort((a, b) => new Date(b.ts) - new Date(a.ts))
        .slice(0, Math.min(count, 20));

      if (!recent.length) {
        await sendMessage(chatId, `📝 No expenses yet`);
        return res.status(200).send("OK");
      }

      const lines = recent.map((e) => {
        const date = new Date(e.ts).toLocaleDateString('en-IN', { 
          day: 'numeric', 
          month: 'short',
          hour: '2-digit',
          minute: '2-digit'
        });
        const name = data.members.find(m => m.userName === e.userName)?.displayName || e.userName;
        return `${date} • ${name}\n₹${e.amount} - ${e.category}`;
      });

      await sendMessage(chatId, `📝 Last ${recent.length}\n\n${lines.join("\n\n")}`);
      return res.status(200).send("OK");
    }

    /* ================= DELETE ALL EXPENSES (ADMIN) ================= */
    if (text === "/clearall") {
      const activeCount = data.expenses.filter((e) => !e.discarded).length;
      
      if (activeCount === 0) {
        await sendMessage(chatId, `🗑️ No active expenses`);
        return res.status(200).send("OK");
      }

      // Mark all as discarded
      for (const expense of data.expenses) {
        if (!expense.discarded) {
          await updateExpense(expense.id, { discarded: true });
        }
      }

      await sendMessage(chatId, `🗑️ Cleared ${activeCount} expenses`);
      return res.status(200).send("OK");
    }

    /* ================= BUDGET ALERTS ================= */
    if (text === "/alerts") {
      const categories = Object.keys(data.budgets);
      const activeExpenses = data.expenses.filter((e) => !e.discarded);
      const alerts = [];

      for (const cat of categories) {
        const spent = activeExpenses
          .filter((e) => e.category === cat)
          .reduce((sum, e) => sum + e.amount, 0);
        const budget = data.budgets[cat];
        const percent = (spent / budget) * 100;

        if (percent >= 90) {
          alerts.push(`⚠️ ${cat}: ${percent.toFixed(0)}% (₹${spent}/₹${budget})`);
        } else if (percent >= 75) {
          alerts.push(`⚡ ${cat}: ${percent.toFixed(0)}% (₹${spent}/₹${budget})`);
        }
      }

      if (!alerts.length) {
        await sendMessage(chatId, `✅ All budgets healthy`);
        return res.status(200).send("OK");
      }

      await sendMessage(chatId, `⚠️ Budget Alerts\n\n${alerts.join("\n")}`);
      return res.status(200).send("OK");
    }

    // If no command matched and not an expense, ignore
    return res.status(200).send("OK");
  } catch (err) {
    // Never throw — only log
    console.error("Webhook error:", err);
    return res.status(200).send("OK");
  }
}
