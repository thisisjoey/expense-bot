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

// Helper to create monospace table
function createTable(headers, rows) {
  // Calculate column widths
  const colWidths = headers.map((h, i) => {
    const maxRowWidth = Math.max(...rows.map(r => String(r[i] || '').length));
    return Math.max(h.length, maxRowWidth);
  });
  
  // Create separator
  const separator = colWidths.map(w => '─'.repeat(w)).join('┼');
  
  // Format header
  const headerRow = headers.map((h, i) => h.padEnd(colWidths[i])).join('│');
  
  // Format rows
  const dataRows = rows.map(row =>
    row.map((cell, i) => String(cell || '').padEnd(colWidths[i])).join('│')
  );
  
  return `<pre>${headerRow}\n${separator}\n${dataRows.join('\n')}</pre>`;
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

  const activeExpenses = expenses.filter((e) => !e.discarded);
  
  // Get date boundaries based on timeframe
  const now = new Date();
  const currentDay = now.getDate();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  let startDate;
  let budgetMultiplier = 1;
  let periodName = "";
  
  if (timeframe === "daily") {
    startDate = new Date(currentYear, currentMonth, currentDay);
    budgetMultiplier = 1 / 30;
    periodName = "Today";
  } else if (timeframe === "weekly") {
    const dayOfWeek = now.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    startDate = new Date(currentYear, currentMonth, currentDay - daysToMonday);
    budgetMultiplier = 7 / 30;
    periodName = "This Week";
  } else {
    startDate = new Date(currentYear, currentMonth, 1);
    budgetMultiplier = 1;
    periodName = "This Month";
  }

  const tableData = [];

  for (const cat of categories) {
    const monthlyBudget = budgets[cat];
    const periodBudget = monthlyBudget * budgetMultiplier;
    
    const spent = activeExpenses
      .filter((e) => e.category === cat && new Date(e.ts) >= startDate)
      .reduce((sum, e) => sum + e.amount, 0);
    
    const percent = periodBudget > 0 ? (spent / periodBudget) * 100 : 0;
    const remaining = periodBudget - spent;

    let status;
    if (percent >= 90) status = "🚨";
    else if (percent >= 75) status = "⚠️";
    else if (percent >= 50) status = "📊";
    else status = "✅";

    tableData.push([
      status,
      cat.substring(0, 10),
      `${percent.toFixed(0)}%`,
      `₹${remaining.toFixed(0)}`
    ]);
  }

  // Sort by percentage descending
  tableData.sort((a, b) => {
    const aPercent = parseFloat(a[2]);
    const bPercent = parseFloat(b[2]);
    return bPercent - aPercent;
  });

  const table = createTable(
    ['', 'Category', 'Used', 'Left'],
    tableData
  );

  const hasAlerts = tableData.some(row => row[0] === '🚨' || row[0] === '⚠️');
  const critical = tableData.filter(row => row[0] === '🚨').length;
  const warning = tableData.filter(row => row[0] === '⚠️').length;

  let emoji = "✅";
  if (critical > 0) emoji = "🚨";
  else if (warning > 0) emoji = "⚠️";

  const message = `${emoji} <b>Budget Alert - ${periodName}</b>\n\n${table}`;

  return {
    hasAlerts,
    critical,
    warning,
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
• 6777,90,9,91 grocery (multiple entries)
• 6777,90+9+91 grocery (mixed)
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
  
  if (!budgets["uncategorized"]) {
    budgets["uncategorized"] = 0;
  }
  
  return budgets;
}

async function saveBudgets(budgets) {
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
    const needsUpdate =
      existing.displayName !== displayName || existing.username !== username;
    if (needsUpdate) {
      await updateMember(telegramUserId, { displayName, username });
    }
    return existing.userName;
  }

  const baseUserName = displayName || username || `user${telegramUserId}`;
  let userName = baseUserName.toLowerCase().replace(/\s+/g, "_");

  let counter = 1;
  while (members.some((m) => m.userName === userName)) {
    userName = `${baseUserName.toLowerCase().replace(/\s+/g, "_")}_${counter}`;
    counter++;
  }

  await saveMembers([{ userName, telegramUserId, displayName, username }]);

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
  const cleaned = text
    .toLowerCase()
    .replace(/\b(spent|paid|expense|for|on|the|a|an|in|at|to)\b/g, "")
    .trim();

  const results = [];
  const seen = new Set();
  const usedRanges = [];

  function isRangeUsed(start, end) {
    return usedRanges.some(range => 
      (start >= range.start && start < range.end) ||
      (end > range.start && end <= range.end) ||
      (start <= range.start && end >= range.end)
    );
  }

  // Pattern 1: Comma and/or plus separated amounts with category - for VALID categories only
  // This will be validated later, so we just extract the pattern
  const pattern1 = /([\d+,\s.]+)\s+([a-z]+)/g;
  let match;
  while ((match = pattern1.exec(cleaned)) !== null) {
    const amountsStr = match[1];
    const category = match[2];
    
    if (/[\d,+]/.test(amountsStr)) {
      const commaParts = amountsStr.split(',').map(p => p.trim()).filter(p => p);
      
      commaParts.forEach(part => {
        if (part.includes('+')) {
          const amount = part
            .split('+')
            .map(n => n.trim())
            .filter(n => n)
            .reduce((sum, num) => sum + parseFloat(num), 0);
          
          if (!isNaN(amount) && amount > 0) {
            const key = `${amount}-${category}-${results.length}`;
            if (!seen.has(key)) {
              results.push({ amount, category });
              seen.add(key);
            }
          }
        } else {
          const amount = parseFloat(part.trim());
          if (!isNaN(amount) && amount > 0) {
            const key = `${amount}-${category}-${results.length}`;
            if (!seen.has(key)) {
              results.push({ amount, category });
              seen.add(key);
            }
          }
        }
      });
      
      usedRanges.push({ start: match.index, end: match.index + match[0].length });
    }
  }

  // Pattern 2: Amounts with dash and category - for formats like 90-grocery, 50+30-ai
  const pattern2 = /([\d+,\s.]+)\s*-\s*([a-z]+)/g;
  while ((match = pattern2.exec(cleaned)) !== null) {
    if (!isRangeUsed(match.index, match.index + match[0].length)) {
      const amountsStr = match[1];
      const category = match[2];
      
      const commaParts = amountsStr.split(',').map(p => p.trim()).filter(p => p);
      
      commaParts.forEach(part => {
        if (part.includes('+')) {
          const amount = part
            .split('+')
            .map(n => n.trim())
            .filter(n => n)
            .reduce((sum, num) => sum + parseFloat(num), 0);
          
          if (!isNaN(amount) && amount > 0) {
            const key = `${amount}-${category}-${results.length}`;
            if (!seen.has(key)) {
              results.push({ amount, category });
              seen.add(key);
            }
          }
        } else {
          const amount = parseFloat(part.trim());
          if (!isNaN(amount) && amount > 0) {
            const key = `${amount}-${category}-${results.length}`;
            if (!seen.has(key)) {
              results.push({ amount, category });
              seen.add(key);
            }
          }
        }
      });
      
      usedRanges.push({ start: match.index, end: match.index + match[0].length });
    }
  }

  // Pattern 3: Amount with multiple categories (90-grocery,ai)
  const pattern3 = /(\d+(?:\.\d+)?)\s*-\s*([a-z,\s]+)/g;
  while ((match = pattern3.exec(cleaned)) !== null) {
    if (!isRangeUsed(match.index, match.index + match[0].length)) {
      const amount = parseFloat(match[1]);
      const categoriesStr = match[2];
      
      if (categoriesStr.includes(',')) {
        const categories = categoriesStr
          .split(',')
          .map(c => c.trim())
          .filter(c => c && /^[a-z]+$/.test(c));

        categories.forEach(category => {
          const key = `${amount}-${category}-${results.length}`;
          if (!seen.has(key)) {
            results.push({ amount, category });
            seen.add(key);
          }
        });
        
        usedRanges.push({ start: match.index, end: match.index + match[0].length });
      }
    }
  }

  // Pattern 4: Standalone numbers (any number without category OR with invalid category)
  // This catches numbers anywhere in the text
  const pattern4 = /\b(\d+(?:\.\d+)?)\b/g;
  while ((match = pattern4.exec(cleaned)) !== null) {
    const amount = parseFloat(match[1]);
    if (amount >= 1 && amount <= 100000) {
      if (!isRangeUsed(match.index, match.index + match[0].length)) {
        const key = `${amount}-uncategorized-${results.length}`;
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

  const nowDate = new Date();
  const currentDay = nowDate.getDate();
  const currentMonth = nowDate.getMonth();
  const currentYear = nowDate.getFullYear();

  const startOfToday = new Date(currentYear, currentMonth, currentDay);

  const dayOfWeek = nowDate.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const startOfWeek = new Date(
    currentYear,
    currentMonth,
    currentDay - daysToMonday
  );

  const startOfMonth = new Date(currentYear, currentMonth, 1);

  const categoryExpenses = expenses.filter(
    (e) => e.category === category && !e.discarded
  );

  const spentToday = categoryExpenses
    .filter((e) => new Date(e.ts) >= startOfToday)
    .reduce((sum, e) => sum + e.amount, 0);

  const spentThisWeek = categoryExpenses
    .filter((e) => new Date(e.ts) >= startOfWeek)
    .reduce((sum, e) => sum + e.amount, 0);

  const spentThisMonth = categoryExpenses
    .filter((e) => new Date(e.ts) >= startOfMonth)
    .reduce((sum, e) => sum + e.amount, 0);

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
    if (req.method !== "POST") {
      return res.status(405).send("Method not allowed");
    }

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

    const userName = await ensureUserExists(
      telegramUserId,
      displayName,
      username
    );

    if (await handleFastCommands(text, chatId)) {
      return res.status(200).send("OK");
    }

    const data = await loadAllData();
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

      const tableRows = categories.map(([cat, budget]) => [cat, `₹${budget}`]);
      const table = createTable(['Category', 'Budget'], tableRows);

      await sendMessage(
        chatId,
        `📂 <b>Categories</b>\n\n${table}\n\n<i>Note: "uncategorized" is a default category for expenses without a category.</i>`
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

      const tableRows = data.members.map((m, idx) => [
        String(idx + 1),
        m.displayName || m.username || m.userName
      ]);
      
      const table = createTable(['#', 'Name'], tableRows);

      await sendMessage(
        chatId,
        `👥 <b>Registered Members</b>\n\n${table}\n\n<i>Total: ${data.members.length}</i>`
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

      await saveMembers([
        {
          userName: newUserName,
          telegramUserId: null,
          displayName: name,
          username: null,
        },
      ]);

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

      const activeExpenses = data.expenses.filter((e) => !e.discarded);
      const tableRows = [];

      for (const cat of categories) {
        const spent = activeExpenses
          .filter((e) => e.category === cat)
          .reduce((sum, e) => sum + e.amount, 0);
        const budget = data.budgets[cat];
        const remaining = budget - spent;
        const percent = budget > 0 ? ((spent / budget) * 100).toFixed(0) : 0;

        const status = remaining >= 0 ? "✅" : "⚠️";
        tableRows.push([
          status,
          cat.substring(0, 10),
          `${percent}%`,
          `₹${remaining.toFixed(0)}`
        ]);
      }

      const table = createTable(
        ['', 'Category', 'Used', 'Left'],
        tableRows
      );

      await sendMessage(chatId, `📊 <b>Summary</b>\n\n${table}`);
      return res.status(200).send("OK");
    }

    /* ================= OWE COMMAND ================= */

    if (text === "/owe") {
      if (data.members.length === 0) {
        await sendMessage(
          chatId,
          `💸 <b>No Members</b>

No members registered yet.`
        );
        return res.status(200).send("OK");
      }

      const activeExpenses = data.expenses.filter((e) => !e.discarded);
      if (!activeExpenses.length) {
        await sendMessage(
          chatId,
          `💸 <b>No Expenses</b>

No expenses recorded yet.`
        );
        return res.status(200).send("OK");
      }

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

      const balances = {};
      data.members.forEach((m) => {
        balances[m.userName] = userTotals[m.userName] - perPerson;
      });

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

        settlements.push([
          debtorName.substring(0, 12),
          '→',
          creditorName.substring(0, 12),
          `₹${amount.toFixed(0)}`
        ]);

        creditor.amount -= amount;
        debtor.amount -= amount;

        if (creditor.amount < 0.01) i++;
        if (debtor.amount < 0.01) j++;
      }

      const table = createTable(
        ['From', '', 'To', 'Amount'],
        settlements
      );

      await sendMessage(
        chatId,
        `💸 <b>Settlements</b>

<b>Total:</b> ₹${totalSpent.toFixed(2)} • <b>Per person:</b> ₹${perPerson.toFixed(2)}

${table}`
      );
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

      await updateSettlement(userName, {
        settled: true,
        lastSettledDate: now(),
        telegramUserId,
      });

      const updatedSettlements = await loadSettlements();
      const allSettled = updatedSettlements.every((s) => s.settled);

      if (allSettled) {
        await resetSettlements();

        const activeExpenses = data.expenses.filter((e) => !e.discarded);
        for (const expense of activeExpenses) {
          await updateExpense(expense.id, { discarded: true });
        }

        await sendMessage(
          chatId,
          `🎉 <b>All Settled!</b>

Everyone has settled up!
Ledger has been reset.

<i>Previous expenses archived.
Start fresh!</i>`
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

    const parsedExpenses = parseExpense(text);

    if (parsedExpenses.length > 0) {
      const validExpenses = [];

      for (const exp of parsedExpenses) {
        // If category exists in budgets, use it; otherwise convert to uncategorized
        if (exp.category === "uncategorized" || data.budgets[exp.category]) {
          validExpenses.push(exp);
        } else {
          // Convert invalid category to uncategorized
          validExpenses.push({
            amount: exp.amount,
            category: "uncategorized"
          });
        }
      }

      if (validExpenses.length === 0) {
        return res.status(200).send("OK");
      }

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

      const uniqueCategories = [
        ...new Set(validExpenses.map((e) => e.category)),
      ];

      const updatedExpenses = await loadExpenses();

      // Calculate total monthly budget and spent across all categories
      const totalMonthlyBudget = Object.values(data.budgets).reduce((sum, b) => sum + b, 0);
      const nowDate = new Date();
      const startOfMonth = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1);
      const totalMonthlySpent = updatedExpenses
        .filter((e) => !e.discarded && new Date(e.ts) >= startOfMonth)
        .reduce((sum, e) => sum + e.amount, 0);
      const totalMonthlyPercent = totalMonthlyBudget > 0 
        ? ((totalMonthlySpent / totalMonthlyBudget) * 100).toFixed(0) 
        : 0;

      const lines = validExpenses.map(
        (exp) => `₹${exp.amount} - ${exp.category}`
      );

      let response = `✅ <b>${lines.join("\n")}</b>\n\n`;

      // Show category-specific progress
      for (const category of uniqueCategories) {
        const progress = calculateBudgetProgress(
          category,
          data.budgets,
          updatedExpenses
        );

        const tableRows = [
          ['Today', `₹${progress.spentToday.toFixed(0)}`, `₹${progress.dailyBudget.toFixed(0)}`, `${progress.dailyPercent}%`],
          ['Week', `₹${progress.spentThisWeek.toFixed(0)}`, `₹${progress.weeklyBudget.toFixed(0)}`, `${progress.weeklyPercent}%`],
          ['Month', `₹${progress.spentThisMonth.toFixed(0)}`, `₹${progress.monthlyBudget.toFixed(0)}`, `${progress.monthlyPercent}%`]
        ];

        const table = createTable(['', 'Spent', 'Budget', '%'], tableRows);
        response += `<b>${category}</b>\n${table}\n\n`;
      }

      // Show overall progress
      const overallTableRows = [
        ['Month', `₹${totalMonthlySpent.toFixed(0)}`, `₹${totalMonthlyBudget.toFixed(0)}`, `${totalMonthlyPercent}%`]
      ];
      const overallTable = createTable(['', 'Spent', 'Budget', '%'], overallTableRows);
      response += `<b>Overall</b>\n${overallTable}`;

      await sendMessage(chatId, response, messageId);
      return res.status(200).send("OK");
    }

    /* ================= ADVANCED FEATURES ================= */

    /* ================= STATS COMMAND ================= */
    if (text === "/stats") {
      const activeExpenses = data.expenses.filter((e) => !e.discarded);

      if (!activeExpenses.length) {
        await sendMessage(chatId, `📊 <b>No expenses yet</b>`);
        return res.status(200).send("OK");
      }

      const total = activeExpenses.reduce((sum, e) => sum + e.amount, 0);
      const avgPerExpense = total / activeExpenses.length;

      const byUser = {};
      activeExpenses.forEach((e) => {
        if (!byUser[e.userName]) byUser[e.userName] = 0;
        byUser[e.userName] += e.amount;
      });

      const topSpender = Object.entries(byUser).sort((a, b) => b[1] - a[1])[0];
      const topSpenderName =
        data.members.find((m) => m.userName === topSpender[0])?.displayName ||
        topSpender[0];

      const byCategory = {};
      activeExpenses.forEach((e) => {
        if (!byCategory[e.category]) byCategory[e.category] = 0;
        byCategory[e.category] += e.amount;
      });

      const topCategory = Object.entries(byCategory).sort(
        (a, b) => b[1] - a[1]
      )[0];

      await sendMessage(
        chatId,
        `📊 <b>Stats</b>

<b>Total:</b> ₹${total.toFixed(2)}
<b>Expenses:</b> ${activeExpenses.length}
<b>Average:</b> ₹${avgPerExpense.toFixed(2)}

<b>Top spender:</b> ${escapeHtml(topSpenderName)} (₹${topSpender[1].toFixed(2)})
<b>Top category:</b> ${topCategory[0]} (₹${topCategory[1].toFixed(2)})`
      );
      return res.status(200).send("OK");
    }

    /* ================= TOP SPENDERS ================= */
    if (text === "/topspenders") {
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

      const tableRows = sorted.map(([userName, amount], idx) => {
        const name =
          data.members.find((m) => m.userName === userName)?.displayName ||
          userName;
        const medal =
          idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}`;
        return [medal, name.substring(0, 15), `₹${amount.toFixed(0)}`];
      });

      const table = createTable(['', 'Name', 'Amount'], tableRows);

      await sendMessage(chatId, `🏆 <b>Top Spenders</b>\n\n${table}`);
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
      
      const tableRows = Object.entries(byCategory)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, amount]) => [cat.substring(0, 12), `₹${amount.toFixed(0)}`]);

      const table = createTable(['Category', 'Amount'], tableRows);

      await sendMessage(
        chatId,
        `📅 <b>${monthName} ${currentYear}</b>

<b>Total:</b> ₹${total.toFixed(2)} • <b>Expenses:</b> ${monthlyExpenses.length}

${table}`
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

      const tableRows = results.slice(0, 10).map((e) => {
        const date = new Date(e.ts).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          timeZone: "Asia/Kolkata",
        });
        const name =
          data.members.find((m) => m.userName === e.userName)?.displayName ||
          e.userName;
        return [date, name.substring(0, 10), `₹${e.amount}`, e.category.substring(0, 10)];
      });

      const table = createTable(['Date', 'User', 'Amount', 'Category'], tableRows);

      const more =
        results.length > 10 ? `\n\n<i>+${results.length - 10} more results</i>` : "";
      await sendMessage(
        chatId,
        `🔍 <b>Search Results (${results.length})</b>\n\n${table}${more}`
      );
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
        await sendMessage(chatId, `📝 <b>No expenses yet</b>`);
        return res.status(200).send("OK");
      }

      const tableRows = recent.map((e) => {
        const date = new Date(e.ts).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Kolkata",
        });
        const name =
          data.members.find((m) => m.userName === e.userName)?.displayName ||
          e.userName;
        return [date, name.substring(0, 10), `₹${e.amount}`, e.category.substring(0, 10)];
      });

      const table = createTable(['Date', 'User', 'Amount', 'Category'], tableRows);

      await sendMessage(
        chatId,
        `📝 <b>Last ${recent.length} Expenses</b>\n\n${table}`
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

    return res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(200).send("OK");
  }
}
