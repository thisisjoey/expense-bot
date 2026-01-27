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
    const payload = {
      chat_id: chatId,
      text,
      parse_mode: "HTML", // Enable HTML formatting
    };
    
    if (replyTo) {
      payload.reply_to_message_id = replyTo;
    }

    await fetch(`${BOT_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error("Failed to send message:", error);
    // Fallback without reply
    try {
      await fetch(`${BOT_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
    } catch (fallbackError) {
      console.error("Fallback message also failed:", fallbackError);
    }
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
    timeZone: "Asia/Kolkata",
  });
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ================= ALERTS HELPER ================= */

async function generateAlerts(budgets, expenses, timeframe = "monthly") {
  const categories = Object.keys(budgets);
  if (!categories.length) {
    return {
      hasAlerts: false,
      message: `📊 <b>No Categories</b>\n\nUse /addcategory to create categories first.`,
    };
  }

  // For alerts/budgets: include ALL non-discarded expenses (both settled and unsettled)
  const activeExpenses = expenses.filter((e) => !e.discarded);
  
  // Get date boundaries based on timeframe
  const now = new Date();
  const currentDay = now.getDate();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  let startDate;
  let budgetMultiplier = 1; // For calculating period budget
  let periodName = "";
  
  if (timeframe === "daily") {
    startDate = new Date(currentYear, currentMonth, currentDay);
    budgetMultiplier = 1 / 30; // daily budget = monthly / 30
    periodName = "Today";
  } else if (timeframe === "weekly") {
    const dayOfWeek = now.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    startDate = new Date(currentYear, currentMonth, currentDay - daysToMonday);
    budgetMultiplier = 7 / 30; // weekly budget = monthly * 7 / 30
    periodName = "This Week";
  } else {
    // monthly
    startDate = new Date(currentYear, currentMonth, 1);
    budgetMultiplier = 1;
    periodName = "This Month";
  }

  const critical = []; // >= 90%
  const warning = [];  // >= 75%
  const watch = [];    // >= 50%
  const healthy = [];  // < 50%

  for (const cat of categories) {
    const monthlyBudget = budgets[cat];
    const periodBudget = monthlyBudget * budgetMultiplier;
    
    const spent = activeExpenses
      .filter((e) => e.category === cat && new Date(e.ts) >= startDate)
      .reduce((sum, e) => sum + e.amount, 0);
    
    const percent = periodBudget > 0 ? (spent / periodBudget) * 100 : 0;
    const remaining = periodBudget - spent;

    const catStr = cat.padEnd(16);
    const spentStr = `₹${spent.toFixed(0)}`.padStart(10);
    const budgetStr = `₹${periodBudget.toFixed(0)}`.padStart(10);
    const percentStr = `${percent.toFixed(0)}%`.padStart(5);
    const leftStr = `₹${remaining.toFixed(0)}`.padStart(10);
    const line = `${catStr} │ ${spentStr}/${budgetStr} │ ${percentStr} │ Left: ${leftStr}`;

    if (percent >= 90) {
      critical.push(`🚨 ${line}`);
    } else if (percent >= 75) {
      warning.push(`⚠️ ${line}`);
    } else if (percent >= 50) {
      watch.push(`📊 ${line}`);
    } else {
      healthy.push(`✅ ${line}`);
    }
  }

  // Build message
  const sections = [];
  const divider = `${\"─\".repeat(70)}`;
  
  if (critical.length > 0) {
    sections.push(`<b>🚨 CRITICAL (≥90%)</b>\n${divider}\n${critical.join("\n")}`);
  }
  
  if (warning.length > 0) {
    sections.push(`<b>⚠️ WARNING (≥75%)</b>\n${divider}\n${warning.join("\n")}`);
  }
  
  if (watch.length > 0) {
    sections.push(`<b>📊 WATCH (≥50%)</b>\n${divider}\n${watch.join("\n")}`);
  }
  
  if (healthy.length > 0) {
    sections.push(`<b>✅ HEALTHY (&lt;50%)</b>\n${divider}\n${healthy.join("\n")}`);
  }

  const hasAlerts = critical.length > 0 || warning.length > 0;
  
  let emoji = "✅";
  if (critical.length > 0) emoji = "🚨";
  else if (warning.length > 0) emoji = "⚠️";
  else if (watch.length > 0) emoji = "📊";

  const message = `${emoji} <b>Budget Alert - ${periodName}</b>\n\n<pre>${sections.join("\n\n")}</pre>`;

  return {
    hasAlerts,
    critical: critical.length,
    warning: warning.length,
    watch: watch.length,
    healthy: healthy.length,
    message,
  };
}

/* ================= FAST COMMANDS (NO DB) ================= */

async function handleFastCommands(text, chatId) {
  if (text !== "/start" && text !== "/help") return false;

  await sendMessage(
    chatId,
    `💰 <b>Expense Tracker</b>

<b>Add Expenses:</b>
• 90-grocery or 90 grocery
• 50+30-ai or 100-grocery,ai
• Just type any number (e.g., 150) → goes to "uncategorized"

<b>Basic Commands:</b>
/categories - View all categories
/summary - Budget overview
/owe - Settlement calculations
/settled - Mark yourself as settled

<b>Advanced Commands:</b>
/stats - Spending statistics
/monthly - This month's report
/topspenders - Leaderboard
/last 10 - Recent expenses
/search &lt;term&gt; - Find expenses
/alerts - Budget warnings
/clearall - Delete all expenses

<b>Manage:</b>
/addcategory travel 5000
/setbudget grocery 300
/deletecategory ai
/addmember John
/removemember John
/members - View all members
/revert - Reply to expense to undo`
  );

  return true;
}

/* ================= OPTIMIZED SUPABASE LOADERS ================= */

// Load all data in parallel for better performance
async function loadAllData() {
  const [budgets, expenses, members, settlements] = await Promise.all([
    loadBudgets(),
    loadExpenses(),
    loadMembers(),
    loadSettlements(),
  ]);

  return { budgets, expenses, members, settlements };
}

async function loadBudgets() {
  const { data, error } = await supabase
    .from("budgets")
    .select("*")
    .order("category");

  if (error) {
    console.error("Error loading budgets:", error);
    return {};
  }

  const budgets = {};
  (data || []).forEach((r) => (budgets[r.category] = Number(r.budget) || 0));
  
  // Ensure "uncategorized" exists with a default budget of 0
  if (!budgets["uncategorized"]) {
    budgets["uncategorized"] = 0;
  }
  
  return budgets;
}

async function saveBudgets(budgets) {
  // Use UPSERT to update existing or insert new budgets
  const rows = Object.entries(budgets).map(([category, budget]) => ({
    category,
    budget,
  }));

  if (rows.length) {
    const { error } = await supabase
      .from("budgets")
      .upsert(rows, { onConflict: "category" });

    if (error) {
      console.error("Error upserting budgets:", error);
      throw error;
    }
  }
}

async function ensureUncategorizedExists(budgets) {
  if (!budgets["uncategorized"]) {
    budgets["uncategorized"] = 0;
    await saveBudgets({ uncategorized: 0 });
  }
  return budgets;
}

async function loadExpenses() {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .order("ts", { ascending: false });

  if (error) {
    console.error("Error loading expenses:", error);
    return [];
  }

  return (data || []).map((e) => ({
    id: Number(e.id),
    telegramUserId: e.telegram_user_id,
    userName: e.user_name,
    amount: Number(e.amount) || 0,
    category: e.category,
    comment: e.comment,
    ts: e.ts,
    discarded: !!e.discarded,
    settled: !!e.settled, // NEW: Track if expense has been settled
    telegramMessageId: e.telegram_message_id,
  }));
}

async function saveExpenses(expenses) {
  if (!expenses.length) return;

  const { error } = await supabase.from("expenses").insert(
    expenses.map((e) => ({
      telegram_user_id: e.telegramUserId,
      user_name: e.userName,
      amount: e.amount,
      category: e.category,
      comment: e.comment,
      ts: e.ts,
      discarded: e.discarded || false,
      settled: e.settled || false, // NEW: Default to unsettled
      telegram_message_id: e.telegramMessageId,
    }))
  );

  if (error) {
    console.error("Error saving expenses:", error);
    throw error;
  }
}

async function updateExpense(id, updates) {
  const dbUpdates = {};
  if ("discarded" in updates) dbUpdates.discarded = updates.discarded;
  if ("settled" in updates) dbUpdates.settled = updates.settled; // NEW
  if ("amount" in updates) dbUpdates.amount = updates.amount;
  if ("category" in updates) dbUpdates.category = updates.category;
  if ("comment" in updates) dbUpdates.comment = updates.comment;

  const { error } = await supabase
    .from("expenses")
    .update(dbUpdates)
    .eq("id", id);

  if (error) {
    console.error("Error updating expense:", error);
    throw error;
  }
}

// NEW: Batch settle all unsettled expenses
async function settleAllExpenses() {
  const { error } = await supabase
    .from("expenses")
    .update({ settled: true })
    .eq("settled", false)
    .eq("discarded", false);

  if (error) {
    console.error("Error settling expenses:", error);
    throw error;
  }
}

async function loadMembers() {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .order("user_name");

  if (error) {
    console.error("Error loading members:", error);
    return [];
  }

  return (data || []).map((m) => ({
    userName: m.user_name,
    telegramUserId: m.telegram_user_id,
    displayName: m.display_name,
    username: m.username,
  }));
}

async function saveMembers(members) {
  if (!members.length) return;

  const { error } = await supabase.from("members").insert(
    members.map((m) => ({
      user_name: m.userName,
      telegram_user_id: m.telegramUserId,
      display_name: m.displayName,
      username: m.username,
    }))
  );

  if (error) {
    console.error("Error saving members:", error);
    throw error;
  }
}

async function updateMember(telegramUserId, updates) {
  const dbUpdates = {};
  if ("displayName" in updates) dbUpdates.display_name = updates.displayName;
  if ("username" in updates) dbUpdates.username = updates.username;
  if ("userName" in updates) dbUpdates.user_name = updates.userName;

  const { error } = await supabase
    .from("members")
    .update(dbUpdates)
    .eq("telegram_user_id", telegramUserId);

  if (error) {
    console.error("Error updating member:", error);
    throw error;
  }
}

async function deleteMember(userName) {
  // Foreign key CASCADE will handle related records
  const { error } = await supabase
    .from("members")
    .delete()
    .eq("user_name", userName);

  if (error) {
    console.error("Error deleting member:", error);
    throw error;
  }
}

async function loadSettlements() {
  const { data, error } = await supabase
    .from("settlements")
    .select("*")
    .order("user_name");

  if (error) {
    console.error("Error loading settlements:", error);
    return [];
  }

  return (data || []).map((s) => ({
    userName: s.user_name,
    telegramUserId: s.telegram_user_id,
    settled: !!s.settled,
    lastSettledDate: s.last_settled_date,
  }));
}

async function saveSettlements(settlements) {
  if (!settlements.length) return;

  const { error } = await supabase.from("settlements").upsert(
    settlements.map((s) => ({
      user_name: s.userName,
      telegram_user_id: s.telegramUserId,
      settled: s.settled,
      last_settled_date: s.lastSettledDate,
    })),
    { onConflict: "user_name" }
  );

  if (error) {
    console.error("Error saving settlements:", error);
    throw error;
  }
}

async function updateSettlement(userName, updates) {
  const dbUpdates = {};
  if ("settled" in updates) dbUpdates.settled = updates.settled;
  if ("lastSettledDate" in updates)
    dbUpdates.last_settled_date = updates.lastSettledDate;
  if ("telegramUserId" in updates)
    dbUpdates.telegram_user_id = updates.telegramUserId;

  const { error } = await supabase
    .from("settlements")
    .upsert({ user_name: userName, ...dbUpdates }, { onConflict: "user_name" });

  if (error) {
    console.error("Error updating settlement:", error);
    throw error;
  }
}

async function resetSettlements() {
  const { error } = await supabase
    .from("settlements")
    .update({ settled: false, last_settled_date: null })
    .neq("user_name", "");

  if (error) {
    console.error("Error resetting settlements:", error);
    throw error;
  }
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

  await saveMembers([{ userName, telegramUserId, displayName, username }]);

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
  const seen = new Set(); // Prevent duplicates
  const usedRanges = []; // Track character ranges already matched

  // Helper to check if a range overlaps with already used ranges
  function isRangeUsed(start, end) {
    return usedRanges.some(range => 
      (start >= range.start && start < range.end) ||
      (end > range.start && end <= range.end) ||
      (start <= range.start && end >= range.end)
    );
  }

  // Pattern 1: number + number - category (90+10-grocery) - CHECK FIRST!
  const pattern1 =
    /(\d+(?:\.\d+)?(?:\s*[+]\s*\d+(?:\.\d+)?)*)\s*-\s*([a-z]+)/g;
  let match;
  while ((match = pattern1.exec(cleaned)) !== null) {
    const amountStr = match[1].replace(/\s+/g, "");
    const amount = amountStr
      .split("+")
      .reduce((sum, num) => sum + parseFloat(num), 0);
    const key = `${amount}-${match[2]}`;
    if (!seen.has(key)) {
      results.push({
        amount,
        category: match[2],
      });
      seen.add(key);
      // Mark this entire match range as used
      usedRanges.push({ start: match.index, end: match.index + match[0].length });
    }
  }

  // Pattern 2: number-category (90-grocery)
  const pattern2 = /(\d+(?:\.\d+)?)\s*-\s*([a-z]+)/g;
  while ((match = pattern2.exec(cleaned)) !== null) {
    if (!isRangeUsed(match.index, match.index + match[0].length)) {
      const key = `${match[1]}-${match[2]}`;
      if (!seen.has(key)) {
        results.push({
          amount: parseFloat(match[1]),
          category: match[2],
        });
        seen.add(key);
        usedRanges.push({ start: match.index, end: match.index + match[0].length });
      }
    }
  }

  // Pattern 3: number + number category (90+10 grocery) - space instead of dash
  const pattern3 = /(\d+(?:\.\d+)?(?:\s*[+]\s*\d+(?:\.\d+)?)*)\s+([a-z]+)/g;
  while ((match = pattern3.exec(cleaned)) !== null) {
    if (!isRangeUsed(match.index, match.index + match[0].length)) {
      const amountStr = match[1].replace(/\s+/g, "");
      const amount = amountStr
        .split("+")
        .reduce((sum, num) => sum + parseFloat(num), 0);
      const key = `${amount}-${match[2]}`;
      if (!seen.has(key)) {
        results.push({
          amount,
          category: match[2],
        });
        seen.add(key);
        usedRanges.push({ start: match.index, end: match.index + match[0].length });
      }
    }
  }

  // Pattern 4: number category (90 grocery) - single number
  const pattern4 = /(\d+(?:\.\d+)?)\s+([a-z]+)/g;
  while ((match = pattern4.exec(cleaned)) !== null) {
    if (!isRangeUsed(match.index, match.index + match[0].length)) {
      const key = `${match[1]}-${match[2]}`;
      if (!seen.has(key)) {
        results.push({
          amount: parseFloat(match[1]),
          category: match[2],
        });
        seen.add(key);
        usedRanges.push({ start: match.index, end: match.index + match[0].length });
      }
    }
  }

  // Pattern 5: Multiple categories (90-grocery,ai)
  const pattern5 = /(\d+(?:\.\d+)?)\s*-\s*([a-z\s,]+)/g;
  while ((match = pattern5.exec(cleaned)) !== null) {
    if (!isRangeUsed(match.index, match.index + match[0].length)) {
      const amount = parseFloat(match[1]);
      const categories = match[2]
        .split(",")
        .map((c) => c.trim())
        .filter((c) => c);

      categories.forEach((category) => {
        const key = `${amount}-${category}`;
        if (!seen.has(key)) {
          results.push({ amount, category });
          seen.add(key);
        }
      });
      usedRanges.push({ start: match.index, end: match.index + match[0].length });
    }
  }

  // Pattern 6: Standalone numbers (any number without category)
  // This will catch numbers that weren't already matched by previous patterns
  const pattern6 = /\b(\d+(?:\.\d+)?)\b/g;
  const originalText = text.toLowerCase();
  while ((match = pattern6.exec(originalText)) !== null) {
    const amount = parseFloat(match[1]);
    // Skip very small numbers (likely not expenses) and very large numbers (likely phone numbers, etc)
    if (amount >= 1 && amount <= 100000) {
      if (!isRangeUsed(match.index, match.index + match[0].length)) {
        const key = `${amount}-uncategorized`;
        // Only add if this exact amount hasn't been categorized already
        const alreadyCategorized = results.some(r => r.amount === amount);
        
        if (!seen.has(key) && !alreadyCategorized) {
          results.push({
            amount: amount,
            category: "uncategorized",
          });
          seen.add(key);
        }
      }
    }
  }

  return results;
}

/* ================= BUDGET TRACKING HELPER ================= */

function calculateBudgetProgress(category, budgets, expenses) {
  const monthlyBudget = budgets[category] || 0;
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
  const startOfWeek = new Date(
    currentYear,
    currentMonth,
    currentDay - daysToMonday
  );

  // Get start of this month
  const startOfMonth = new Date(currentYear, currentMonth, 1);

  // IMPORTANT: For budgets, include ALL non-discarded expenses (both settled and unsettled)
  const categoryExpenses = expenses.filter(
    (e) => e.category === category && !e.discarded
  );

  // Calculate spent amounts
  const spentToday = categoryExpenses
    .filter((e) => new Date(e.ts) >= startOfToday)
    .reduce((sum, e) => sum + e.amount, 0);

  const spentThisWeek = categoryExpenses
    .filter((e) => new Date(e.ts) >= startOfWeek)
    .reduce((sum, e) => sum + e.amount, 0);

  const spentThisMonth = categoryExpenses
    .filter((e) => new Date(e.ts) >= startOfMonth)
    .reduce((sum, e) => sum + e.amount, 0);

  // Calculate percentages
  const dailyPercent = dailyBudget > 0 ? ((spentToday / dailyBudget) * 100).toFixed(0) : 0;
  const weeklyPercent = weeklyBudget > 0 ? ((spentThisWeek / weeklyBudget) * 100).toFixed(0) : 0;
  const monthlyPercent = monthlyBudget > 0 ? ((spentThisMonth / monthlyBudget) * 100).toFixed(0) : 0;

  return {
    dailyBudget,
    weeklyBudget,
    monthlyBudget,
    spentToday,
    spentThisWeek,
    spentThisMonth,
    dailyPercent,
    weeklyPercent,
    monthlyPercent,
  };
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

    // Load all data for other commands (optimized with Promise.all)
    const data = await loadAllData();
    
    // Ensure uncategorized category exists
    data.budgets = await ensureUncategorizedExists(data.budgets);

    /* ================= CATEGORIES COMMAND ================= */

    if (text === "/categories") {
      const categories = Object.entries(data.budgets);
      if (!categories.length) {
        await sendMessage(
          chatId,
          `❌ <b>No categories yet</b>

Add one with:
/addcategory name budget`
        );
        return res.status(200).send("OK");
      }

      const lines = categories.map(
        ([cat, budget]) => `${cat.padEnd(20)} │ ₹${budget.toString().padStart(8)}`
      );
      const header = `${'Category'.padEnd(20)} │ Budget`;
      const divider = `${\"─\".repeat(20)}┼${\"─\".repeat(10)}`;
      await sendMessage(
        chatId,
        `📂 <b>Categories</b>\n\n<pre>${header}\n${divider}\n${lines.join("\n")}</pre>\n\n<i>Note: "uncategorized" is a default category for expenses without a category.</i>`
      );
      return res.status(200).send("OK");
    }

    /* ================= ADD CATEGORY ================= */

    if (text.startsWith("/addcategory")) {
      const parts = text.split(" ").filter((p) => p);
      if (parts.length < 3) {
        await sendMessage(
          chatId,
          `❌ <b>Usage</b>

/addcategory &lt;name&gt; &lt;budget&gt;
Example: /addcategory travel 2000`
        );
        return res.status(200).send("OK");
      }

      const [, cat, budget] = parts;
      const budgetNum = Number(budget);

      if (isNaN(budgetNum) || budgetNum < 0) {
        await sendMessage(
          chatId,
          `❌ <b>Invalid budget</b>

Budget must be a positive number.`
        );
        return res.status(200).send("OK");
      }

      if (data.budgets[cat]) {
        await sendMessage(
          chatId,
          `❌ <b>Already exists</b>

"${cat}" already exists with budget ₹${data.budgets[cat]}.
Use /setbudget to update it.`
        );
        return res.status(200).send("OK");
      }

      data.budgets[cat] = budgetNum;
      await saveBudgets(data.budgets);

      await sendMessage(chatId, `✅ <b>Added</b>\n\n${cat}: ₹${budgetNum}`);
      return res.status(200).send("OK");
    }

    /* ================= SET BUDGET ================= */

    if (text.startsWith("/setbudget")) {
      const parts = text.split(" ").filter((p) => p);
      if (parts.length < 3) {
        await sendMessage(
          chatId,
          `❌ <b>Usage</b>

/setbudget &lt;name&gt; &lt;budget&gt;
Example: /setbudget grocery 300`
        );
        return res.status(200).send("OK");
      }

      const [, cat, budget] = parts;
      const budgetNum = Number(budget);

      if (isNaN(budgetNum) || budgetNum < 0) {
        await sendMessage(
          chatId,
          `❌ <b>Invalid budget</b>

Budget must be a positive number.`
        );
        return res.status(200).send("OK");
      }

      if (!data.budgets[cat]) {
        await sendMessage(
          chatId,
          `❌ <b>Not found</b>

"${cat}" doesn't exist.
Use /categories to see available categories.`
        );
        return res.status(200).send("OK");
      }

      const oldBudget = data.budgets[cat];
      data.budgets[cat] = budgetNum;
      await saveBudgets(data.budgets);

      await sendMessage(
        chatId,
        `💰 <b>Budget Updated</b>

${cat}
₹${oldBudget} → ₹${budgetNum}`
      );
      return res.status(200).send("OK");
    }

    /* ================= DELETE CATEGORY ================= */

    if (text.startsWith("/deletecategory")) {
      const parts = text.split(" ").filter((p) => p);
      if (parts.length < 2) {
        await sendMessage(
          chatId,
          `❌ <b>Usage</b>

/deletecategory &lt;name&gt;
Example: /deletecategory ai`
        );
        return res.status(200).send("OK");
      }

      const cat = parts[1];
      
      // Prevent deletion of uncategorized
      if (cat === "uncategorized") {
        await sendMessage(
          chatId,
          `❌ <b>Cannot delete</b>

"uncategorized" is a default category and cannot be deleted.`
        );
        return res.status(200).send("OK");
      }
      
      if (!data.budgets[cat]) {
        await sendMessage(
          chatId,
          `❌ <b>Not found</b>

"${cat}" doesn't exist.
Use /categories to see available categories.`
        );
        return res.status(200).send("OK");
      }

      // Check if category has expenses (including discarded ones due to FK constraint)
      const hasExpenses = data.expenses.some((e) => e.category === cat);

      if (hasExpenses) {
        await sendMessage(
          chatId,
          `⚠️ <b>Cannot delete</b>

"${cat}" has expenses (active or archived).
Foreign key constraint prevents deletion.

To delete this category:
1. First delete all its expenses using /clearall
2. Then try deleting the category again`
        );
        return res.status(200).send("OK");
      }

      // Delete from database directly
      const { error } = await supabase
        .from("budgets")
        .delete()
        .eq("category", cat);

      if (error) {
        console.error("Error deleting category:", error);
        await sendMessage(
          chatId,
          `❌ <b>Error</b>

Failed to delete category: ${error.message}`
        );
        return res.status(200).send("OK");
      }

      await sendMessage(chatId, `🗑️ <b>Deleted</b>\n\n${cat} has been removed.`);
      return res.status(200).send("OK");
    }

    /* ================= MEMBERS COMMAND ================= */

    if (text === "/members") {
      if (!data.members.length) {
        await sendMessage(
          chatId,
          `👥 <b>No Members</b>

Members are added automatically when they interact with the bot.`
        );
        return res.status(200).send("OK");
      }

      const lines = data.members.map((m, idx) => {
        const name = m.displayName || m.username || m.userName;
        const numStr = `${idx + 1}`.padStart(2);
        const nameStr = escapeHtml(name).padEnd(20);
        return `${numStr}. ${nameStr} │ @${m.username || "n/a"}`;
      });
      const header = `Rank  Name                 │ Username`;
      const divider = `${\"─\".repeat(50)}`;

      await sendMessage(
        chatId,
        `👥 <b>Registered Members (${data.members.length})</b>\n\n<pre>${header}\n${divider}\n${lines.join("\n")}</pre>`
      );
      return res.status(200).send("OK");
    }

    /* ================= ADD MEMBER ================= */

    if (text.startsWith("/addmember")) {
      const parts = text.split(" ").filter((p) => p);
      if (parts.length < 2) {
        await sendMessage(
          chatId,
          `❌ <b>Usage</b>

/addmember &lt;name&gt;
Example: /addmember John`
        );
        return res.status(200).send("OK");
      }

      const name = parts.slice(1).join(" ");
      const newUserName = name.toLowerCase().replace(/\s+/g, "_");

      if (data.members.some((m) => m.userName === newUserName)) {
        await sendMessage(
          chatId,
          `❌ <b>Already added</b>

"${escapeHtml(name)}" is already registered.`
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
        `✅ <b>Added</b>\n\n${escapeHtml(name)} has been added to the group.`
      );
      return res.status(200).send("OK");
    }

    /* ================= REMOVE MEMBER ================= */

    if (text.startsWith("/removemember")) {
      const parts = text.split(" ").filter((p) => p);
      if (parts.length < 2) {
        await sendMessage(
          chatId,
          `❌ <b>Usage</b>

/removemember &lt;name&gt;
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
          `❌ <b>Not found</b>

"${escapeHtml(name)}" is not registered.
Use /members to see all members.`
        );
        return res.status(200).send("OK");
      }

      await deleteMember(targetUserName);

      await sendMessage(
        chatId,
        `🗑️ <b>Removed</b>

${escapeHtml(name)} has been removed from the group.
<i>All their expenses and settlements have been deleted.</i>`
      );
      return res.status(200).send("OK");
    }

    /* ================= SUMMARY COMMAND ================= */

    if (text === "/summary") {
      const categories = Object.keys(data.budgets);
      if (!categories.length) {
        await sendMessage(
          chatId,
          `📊 <b>No Categories</b>

Use /addcategory to create categories first.`
        );
        return res.status(200).send("OK");
      }

      // IMPORTANT: For summary, show ALL non-discarded expenses (both settled and unsettled)
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
        const catName = cat.padEnd(15);
        const spentStr = `₹${spent.toFixed(0)}`.padStart(8);
        const budgetStr = `₹${budget}`.padStart(8);
        const percentStr = `${percent}%`.padStart(6);
        const leftStr = `₹${remaining.toFixed(0)}`.padStart(8);
        lines.push(`${status} ${catName} │ ${spentStr}/${budgetStr} │ ${percentStr} │ Left: ${leftStr}`);
      }
      const header = `   Category         │  Spent  /  Budget  │ Used% │ Remaining`;
      const divider = `${\"─\".repeat(65)}`;

      await sendMessage(chatId, `📊 <b>Summary</b>\n\n<pre>${header}\n${divider}\n${lines.join("\n")}</pre>`);
      return res.status(200).send("OK");
    }

    /* ================= OWE COMMAND - UPDATED ================= */

    if (text === "/owe") {
      if (data.members.length === 0) {
        await sendMessage(
          chatId,
          `💸 <b>No Members</b>

No members registered yet.`
        );
        return res.status(200).send("OK");
      }

      // CRITICAL: For /owe, only consider UNSETTLED and NON-DISCARDED expenses
      const unsettledExpenses = data.expenses.filter((e) => !e.discarded && !e.settled);
      
      if (!unsettledExpenses.length) {
        await sendMessage(
          chatId,
          `💸 <b>All Settled!</b>

No unsettled expenses. Start adding new expenses to track.`
        );
        return res.status(200).send("OK");
      }

      // Calculate total spent by each user
      const userTotals = {};
      data.members.forEach((m) => {
        userTotals[m.userName] = 0;
      });

      unsettledExpenses.forEach((e) => {
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
          `💸 <b>All Settled!</b>

Total: ₹${totalSpent.toFixed(2)}
Per person: ₹${perPerson.toFixed(2)}`
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
          `${debtorName.padEnd(18)} → ${creditorName.padEnd(18)} │ ${`₹${amount.toFixed(2)}`.padStart(10)}`
        );

        creditor.amount -= amount;
        debtor.amount -= amount;

        if (creditor.amount < 0.01) i++;
        if (debtor.amount < 0.01) j++;
      }

      const lines = [
        `<b>Total:</b> ₹${totalSpent.toFixed(2)}
<b>Per person:</b> ₹${perPerson.toFixed(2)}`,
      ];

      const summaryText = `Total to settle    ₹${totalSpent.toFixed(2)}\nPer person share   ₹${perPerson.toFixed(2)}`;
      const header = `Debtor             → Creditor          │ Amount`;
      const divider = `${\"─\".repeat(65)}`;

      await sendMessage(chatId, `💸 <b>Settlements</b>\n\n<pre>${summaryText}\n${divider}\n${header}\n${divider}\n${settlements.join("\n")}</pre>`);
      return res.status(200).send("OK");
    }

    /* ================= SETTLED COMMAND - UPDATED ================= */

    if (text === "/settled") {
      const userSettlement = data.settlements.find(
        (s) => s.userName === userName
      );

      if (!userSettlement) {
        await sendMessage(
          chatId,
          `❌ <b>Error</b>

Could not find your settlement record.`
        );
        return res.status(200).send("OK");
      }

      if (userSettlement.settled) {
        await sendMessage(
          chatId,
          `✅ <b>Already Settled</b>

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

      // Refresh settlements to check if all are settled
      const updatedSettlements = await loadSettlements();
      const allSettled = updatedSettlements.every((s) => s.settled);

      if (allSettled) {
        // NEW APPROACH: Mark all unsettled expenses as settled using batch update
        await settleAllExpenses();

        // Then reset settlement flags
        await resetSettlements();

        await sendMessage(
          chatId,
          `🎉 <b>All Settled!</b>

Everyone has settled up!
All expenses marked as settled.

<i>Start fresh! New expenses will be tracked separately.</i>`
        );
      } else {
        const settledCount = updatedSettlements.filter((s) => s.settled).length;
        const totalCount = updatedSettlements.length;

        await sendMessage(
          chatId,
          `✅ <b>Marked as Settled</b>

Status: ${settledCount}/${totalCount} members settled
<i>Waiting for others to settle...</i>`
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
          `❌ <b>Invalid Usage</b>

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
          `❌ <b>Expense Not Found</b>

Expense not found or already reverted.`
        );
        return res.status(200).send("OK");
      }

      // Mark as discarded
      await updateExpense(expense.id, { discarded: true });

      await sendMessage(
        chatId,
        `♻️ <b>Expense Reverted</b>

₹${expense.amount} - ${expense.category}
<i>removed</i>`,
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
        // Allow "uncategorized" category to pass through
        if (exp.category === "uncategorized" || data.budgets[exp.category]) {
          validExpenses.push(exp);
        } else {
          errors.push(
            `❌ "${exp.category}" - category doesn't exist. Use /categories to see available categories.`
          );
        }
      }

      if (validExpenses.length === 0) {
        await sendMessage(chatId, errors.join("\n\n"));
        return res.status(200).send("OK");
      }

      // Save valid expenses (they start as unsettled by default)
      const newExpenses = validExpenses.map((exp) => ({
        telegramUserId,
        userName,
        amount: exp.amount,
        category: exp.category,
        comment: text.substring(0, 200),
        ts: now(),
        discarded: false,
        settled: false, // NEW: Default to unsettled
        telegramMessageId: messageId,
      }));

      await saveExpenses(newExpenses);

      // Calculate budget progress for each category
      const budgetLines = [];
      const uniqueCategories = [
        ...new Set(validExpenses.map((e) => e.category)),
      ];

      // Reload expenses to include the new ones
      const updatedExpenses = await loadExpenses();

      for (const category of uniqueCategories) {
        const progress = calculateBudgetProgress(
          category,
          data.budgets,
          updatedExpenses
        );

        budgetLines.push(
          `<b>${category}:</b>`,
          `Today: ₹${progress.spentToday.toFixed(0)}/₹${progress.dailyBudget.toFixed(0)} (${progress.dailyPercent}%)`,
          `Week: ₹${progress.spentThisWeek.toFixed(0)}/₹${progress.weeklyBudget.toFixed(0)} (${progress.weeklyPercent}%)`,
          `Month: ₹${progress.spentThisMonth.toFixed(0)}/₹${progress.monthlyBudget.toFixed(0)} (${progress.monthlyPercent}%)`
        );
      }

      // Send confirmation
      const lines = validExpenses.map(
        (exp) => `₹${exp.amount} - ${exp.category}`
      );

      let response = `✅ <b>${lines.join("\n")}</b>`;

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
      // Stats shows ALL non-discarded expenses (both settled and unsettled)
      const activeExpenses = data.expenses.filter((e) => !e.discarded);

      if (!activeExpenses.length) {
        await sendMessage(chatId, `📊 <b>No expenses yet</b>`);
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
      const topSpenderName =
        data.members.find((m) => m.userName === topSpender[0])?.displayName ||
        topSpender[0];

      // Group by category
      const byCategory = {};
      activeExpenses.forEach((e) => {
        if (!byCategory[e.category]) byCategory[e.category] = 0;
        byCategory[e.category] += e.amount;
      });

      const topCategory = Object.entries(byCategory).sort(
        (a, b) => b[1] - a[1]
      )[0];

      const statsText = `\nMetric              Value\n${\"─\".repeat(35)}\nTotal Spent        ₹${total.toFixed(2).padStart(12)}\nTotal Expenses     ${activeExpenses.length.toString().padStart(16)}\nAverage/Expense    ₹${avgPerExpense.toFixed(2).padStart(12)}\n${\"─\".repeat(35)}\nTop Spender        ${escapeHtml(topSpenderName).padEnd(12)} (₹${topSpender[1].toFixed(2)})\nTop Category       ${topCategory[0].padEnd(12)} (₹${topCategory[1].toFixed(2)})`;

      await sendMessage(
        chatId,
        `📊 <b>Stats</b>\n\n<pre>${statsText}</pre>`
      );
      return res.status(200).send("OK");
    }

    /* ================= TOP SPENDERS ================= */
    if (text === "/topspenders") {
      // Top spenders shows ALL non-discarded expenses
      const activeExpenses = data.expenses.filter((e) => !e.discarded);

      if (!activeExpenses.length) {
        await sendMessage(chatId, `🏆 <b>No expenses yet</b>`);
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
        const name =
          data.members.find((m) => m.userName === userName)?.displayName ||
          userName;
        const medal =
          idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "  ";
        const rankStr = `${idx + 1}`.padStart(2);
        const nameStr = escapeHtml(name).padEnd(20);
        const amountStr = `₹${amount.toFixed(2)}`.padStart(12);
        return `${medal} ${rankStr}. ${nameStr} │ ${amountStr}`;
      });
      const header = `   Rank  Name                 │ Amount`;
      const divider = `${\"─\".repeat(50)}`;

      await sendMessage(chatId, `🏆 <b>Top Spenders</b>\n\n<pre>${header}\n${divider}\n${lines.join("\n")}</pre>`);
      return res.status(200).send("OK");
    }

    /* ================= MONTHLY REPORT ================= */
    if (text === "/monthly") {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      // Monthly report shows ALL non-discarded expenses
      const monthlyExpenses = data.expenses.filter((e) => {
        if (e.discarded) return false;
        const expenseDate = new Date(e.ts);
        return (
          expenseDate.getMonth() === currentMonth &&
          expenseDate.getFullYear() === currentYear
        );
      });

      if (!monthlyExpenses.length) {
        await sendMessage(chatId, `📅 <b>No expenses this month</b>`);
        return res.status(200).send("OK");
      }

      const total = monthlyExpenses.reduce((sum, e) => sum + e.amount, 0);
      const byCategory = {};

      monthlyExpenses.forEach((e) => {
        if (!byCategory[e.category]) byCategory[e.category] = 0;
        byCategory[e.category] += e.amount;
      });

      const monthName = now.toLocaleString("default", { month: "long" });
      const lines = Object.entries(byCategory)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, amount]) => {
          const catStr = cat.padEnd(18);
          const amountStr = `₹${amount.toFixed(2)}`.padStart(12);
          return `${catStr} │ ${amountStr}`;
        });
      const header = `Category           │ Amount`;
      const divider = `${\"─\".repeat(42)}`;

      const summaryText = `Total Spent     ₹${total.toFixed(2)}\nExpenses Count  ${monthlyExpenses.length}`;

      await sendMessage(
        chatId,
        `📅 <b>${monthName} ${currentYear}</b>\n\n<pre>${header}\n${divider}\n${lines.join("\n")}\n${divider}\n${summaryText}</pre>`
      );
      return res.status(200).send("OK");
    }

    /* ================= SEARCH EXPENSES ================= */
    if (text.startsWith("/search ")) {
      const query = text.substring(8).toLowerCase().trim();

      if (!query) {
        await sendMessage(
          chatId,
          `❌ <b>Usage:</b> /search &lt;term&gt;\n<i>Example: /search grocery</i>`
        );
        return res.status(200).send("OK");
      }

      // Search shows ALL non-discarded expenses
      const results = data.expenses.filter((e) => {
        if (e.discarded) return false;
        return (
          e.category.toLowerCase().includes(query) ||
          (e.comment && e.comment.toLowerCase().includes(query))
        );
      });

      if (!results.length) {
        await sendMessage(chatId, `🔍 <b>No results for "${escapeHtml(query)}"</b>`);
        return res.status(200).send("OK");
      }

      const lines = results.slice(0, 10).map((e) => {
        const date = new Date(e.ts).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          timeZone: "Asia/Kolkata",
        });
        const name =
          data.members.find((m) => m.userName === e.userName)?.displayName ||
          e.userName;
        const settled = e.settled ? "✓" : "";
        const dateStr = date.padEnd(8);
        const nameStr = escapeHtml(name).padEnd(15);
        const amountStr = `₹${e.amount.toFixed(0)}`.padStart(8);
        return `${dateStr} │ ${nameStr} │ ${amountStr} │ ${e.category} ${settled}`;
      });
      const header = `Date     │ User            │ Amount  │ Category`;
      const divider = `${\"─\".repeat(60)}`;

      const more =
        results.length > 10 ? `\n\n<i>+${results.length - 10} more</i>` : "";
      await sendMessage(
        chatId,
        `🔍 <b>Results (${results.length})</b>\n\n<pre>${header}\n${divider}\n${lines.join("\n")}</pre>${more}`
      );
      return res.status(200).send("OK");
    }

    /* ================= LAST N EXPENSES ================= */
    if (text.startsWith("/last")) {
      const parts = text.split(" ");
      const count = parseInt(parts[1]) || 10;

      // Last shows ALL non-discarded expenses
      const recent = data.expenses
        .filter((e) => !e.discarded)
        .sort((a, b) => new Date(b.ts) - new Date(a.ts))
        .slice(0, Math.min(count, 20));

      if (!recent.length) {
        await sendMessage(chatId, `📝 <b>No expenses yet</b>`);
        return res.status(200).send("OK");
      }

      const lines = recent.map((e) => {
        const date = new Date(e.ts).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Kolkata",
        });
        const name =
          data.members.find((m) => m.userName === e.userName)?.displayName ||
          e.userName;
        const settled = e.settled ? "✓" : "";
        const dateStr = date.padEnd(13);
        const nameStr = escapeHtml(name).padEnd(15);
        const amountStr = `₹${e.amount.toFixed(0)}`.padStart(8);
        return `${dateStr} │ ${nameStr} │ ${amountStr} │ ${e.category} ${settled}`;
      });
      const header = `Date/Time       │ User            │ Amount  │ Category`;
      const divider = `${\"─\".repeat(65)}`;

      await sendMessage(
        chatId,
        `📝 <b>Last ${recent.length}</b>\n\n<pre>${header}\n${divider}\n${lines.join("\n")}</pre>`
      );
      return res.status(200).send("OK");
    }

    /* ================= DELETE ALL EXPENSES (ADMIN) ================= */
    if (text === "/clearall") {
      const activeCount = data.expenses.filter((e) => !e.discarded).length;

      if (activeCount === 0) {
        await sendMessage(chatId, `🗑️ <b>No active expenses</b>`);
        return res.status(200).send("OK");
      }

      // Mark all as discarded
      for (const expense of data.expenses) {
        if (!expense.discarded) {
          await updateExpense(expense.id, { discarded: true });
        }
      }

      await sendMessage(
        chatId,
        `🗑️ <b>Cleared ${activeCount} expenses</b>`
      );
      return res.status(200).send("OK");
    }

    /* ================= BUDGET ALERTS ================= */
    if (text === "/alerts") {
      const alertData = await generateAlerts(data.budgets, data.expenses, "monthly");
      await sendMessage(chatId, alertData.message);
      return res.status(200).send("OK");
    }

    // If no command matched and not an expense, ignore
    return res.status(200).send("OK");
  } catch (err) {
    // Never throw — only log
    console.error("Webhook error:", err);
    // Optionally send error to admin chat
    // await sendMessage(ADMIN_CHAT_ID, `⚠️ Error: ${err.message}`);
    return res.status(200).send("OK");
  }
}
