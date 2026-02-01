import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";

/* ================= VERSION ================= */
const WEBHOOK_VERSION = "2.2.0-EXPORT-FEATURE";

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


async function sendDocument(chatId, fileBuffer, fileName, replyTo = null) {
  try {
    const formData = new FormData();
    formData.append("chat_id", chatId);
    formData.append("document", new Blob([fileBuffer]), fileName);
    
    if (replyTo) {
      formData.append("reply_to_message_id", replyTo);
    }

    await fetch(`${BOT_API}/sendDocument`, {
      method: "POST",
      body: formData,
    });
  } catch (error) {
    console.error("Failed to send document:", error);
    throw error;
  }
}


async function generateExcelReport() {
  const workbook = new ExcelJS.Workbook();
  
  // Fetch all data from tables with individual error handling
  console.log("Starting data fetch for export...");
  
  // Fetch expenses
  const { data: expenses, error: expensesError } = await supabase
    .from("expenses")
    .select("*")
    .order("ts", { ascending: false });
  
  if (expensesError) {
    console.error("Error fetching expenses:", expensesError);
  }
  
  // Fetch budgets
  const { data: budgets, error: budgetsError } = await supabase
    .from("budgets")
    .select("*");
  
  if (budgetsError) {
    console.error("Error fetching budgets:", budgetsError);
  }
  
  // Fetch members
  const { data: members, error: membersError } = await supabase
    .from("members")
    .select("*");
  
  if (membersError) {
    console.error("Error fetching members:", membersError);
  }
  
  // Fetch settlements
  const { data: settlements, error: settlementsError } = await supabase
    .from("settlements")
    .select("*");
  
  if (settlementsError) {
    console.error("Error fetching settlements:", settlementsError);
  }
  
  // Try to fetch views - these might not exist, so handle gracefully
  let activeExpenses = null;
  let budgetStatus = null;
  let userExpensePending = null;
  
  try {
    const { data, error } = await supabase
      .from("active_expenses")
      .select("*");
    
    if (error) {
      console.log("Note: active_expenses view not available:", error.message);
    } else {
      activeExpenses = data;
    }
  } catch (e) {
    console.log("Note: active_expenses view does not exist");
  }
  
  try {
    const { data, error } = await supabase
      .from("budget_status")
      .select("*");
    
    if (error) {
      console.log("Note: budget_status view not available:", error.message);
    } else {
      budgetStatus = data;
    }
  } catch (e) {
    console.log("Note: budget_status view does not exist");
  }
  
  try {
    const { data, error } = await supabase
      .from("user_expense_pending")
      .select("*");
    
    if (error) {
      console.log("Note: user_expense_pending view not available:", error.message);
    } else {
      userExpensePending = data;
    }
  } catch (e) {
    console.log("Note: user_expense_pending view does not exist");
  }

  // Check if at least the core tables loaded
  if (!expenses && !budgets && !members) {
    throw new Error("Failed to fetch core data from database. Please check database permissions and table names.");
  }

  console.log("Data fetched successfully, generating Excel...");

  // Helper function to create styled sheet
  const createSheet = (name, data, columns) => {
    const sheet = workbook.addWorksheet(name);
    
    // Set column definitions
    sheet.columns = columns;
    
    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 20;
    
    // Add data
    if (data && data.length > 0) {
      data.forEach(row => {
        sheet.addRow(row);
      });
    } else {
      // Add a "No data" row if empty
      sheet.addRow({ [columns[0].key]: 'No data available' });
    }
    
    // Auto-fit columns
    sheet.columns.forEach(column => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, cell => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) {
          maxLength = columnLength;
        }
      });
      column.width = Math.min(Math.max(maxLength + 2, 12), 50);
    });
    
    // Add borders
    sheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
        };
      });
    });
  };

  // 1. Expenses Sheet (Core table - always create)
  if (expenses) {
    createSheet('Expenses', expenses, [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'User Name', key: 'user_name', width: 20 },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Comment', key: 'comment', width: 30 },
      { header: 'Timestamp', key: 'ts', width: 25 },
      { header: 'Discarded', key: 'discarded', width: 12 },
      { header: 'Telegram User ID', key: 'telegram_user_id', width: 18 },
      { header: 'Telegram Message ID', key: 'telegram_message_id', width: 22 },
      { header: 'Settled', key: 'settled', width: 12 },
      { header: 'Spent By', key: 'spent_by', width: 20 },
      { header: 'Expense Type', key: 'expense_type', width: 20 }
    ]);
  }

  // 2. Budgets Sheet (Core table - always create)
  if (budgets) {
    createSheet('Budgets', budgets, [
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Budget', key: 'budget', width: 15 }
    ]);
  }

  // 3. Members Sheet (Core table - always create)
  if (members) {
    createSheet('Members', members, [
      { header: 'User Name', key: 'user_name', width: 20 },
      { header: 'Telegram User ID', key: 'telegram_user_id', width: 18 },
      { header: 'Display Name', key: 'display_name', width: 20 },
      { header: 'Username', key: 'username', width: 20 }
    ]);
  }

  // 4. Settlements Sheet (Core table - always create)
  if (settlements) {
    createSheet('Settlements', settlements, [
      { header: 'User Name', key: 'user_name', width: 20 },
      { header: 'Settled', key: 'settled', width: 12 },
      { header: 'Last Settled Date', key: 'last_settled_date', width: 25 },
      { header: 'Telegram User ID', key: 'telegram_user_id', width: 18 }
    ]);
  }

  // 5. Active Expenses Sheet (Optional view)
  if (activeExpenses) {
    createSheet('Active Expenses', activeExpenses, [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'User Name', key: 'user_name', width: 20 },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Comment', key: 'comment', width: 30 },
      { header: 'Timestamp', key: 'ts', width: 25 },
      { header: 'Discarded', key: 'discarded', width: 12 },
      { header: 'Telegram User ID', key: 'telegram_user_id', width: 18 },
      { header: 'Telegram Message ID', key: 'telegram_message_id', width: 22 },
      { header: 'Display Name', key: 'display_name', width: 20 },
      { header: 'Username', key: 'username', width: 20 },
      { header: 'Category Budget', key: 'category_budget', width: 18 }
    ]);
  }

  // 6. Budget Status Sheet (Optional view)
  if (budgetStatus) {
    createSheet('Budget Status', budgetStatus, [
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Budget', key: 'budget', width: 15 },
      { header: 'Spent', key: 'spent', width: 15 },
      { header: 'Remaining', key: 'remaining', width: 15 },
      { header: 'Percent Used', key: 'percent_used', width: 18 }
    ]);
  }

  // 7. User Expense Pending Sheet (Optional view)
  if (userExpensePending) {
    createSheet('User Expense Pending', userExpensePending, [
      { header: 'User Name', key: 'user_name', width: 20 },
      { header: 'Display Name', key: 'display_name', width: 20 },
      { header: 'Username', key: 'username', width: 20 },
      { header: 'Total Spent', key: 'total_spent', width: 15 },
      { header: 'Expense Count', key: 'expense_count', width: 18 }
    ]);
  }

  console.log("Excel generation complete, creating buffer...");
  
  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  
  console.log("Export successful!");
  return buffer;
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
  
  // Get date boundaries based on timeframe - use IST
  const nowUTC = new Date();
  const nowIST = new Date(nowUTC.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const currentDay = nowIST.getDate();
  const currentMonth = nowIST.getMonth();
  const currentYear = nowIST.getFullYear();
  
  let startDate;
  let budgetMultiplier = 1; // For calculating period budget
  let periodName = "";
  
  if (timeframe === "daily") {
    startDate = new Date(currentYear, currentMonth, currentDay);
    budgetMultiplier = 1 / 30; // daily budget = monthly / 30
    periodName = "Today";
  } else if (timeframe === "weekly") {
    const dayOfWeek = nowIST.getDay();
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

    const line = `<b>${cat}</b>\n   ₹${spent.toFixed(0)}/₹${periodBudget.toFixed(0)} (${percent.toFixed(0)}%)\n   Left: ₹${remaining.toFixed(0)}`;

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
  
  if (critical.length > 0) {
    sections.push(`<b>🚨 CRITICAL (≥90%)</b>\n${critical.join("\n\n")}`);
  }
  
  if (warning.length > 0) {
    sections.push(`<b>⚠️ WARNING (≥75%)</b>\n${warning.join("\n\n")}`);
  }
  
  if (watch.length > 0) {
    sections.push(`<b>📊 WATCH (≥50%)</b>\n${watch.join("\n\n")}`);
  }
  
  if (healthy.length > 0) {
    sections.push(`<b>✅ HEALTHY (&lt;50%)</b>\n${healthy.join("\n\n")}`);
  }

  const hasAlerts = critical.length > 0 || warning.length > 0;
  
  let emoji = "✅";
  if (critical.length > 0) emoji = "🚨";
  else if (warning.length > 0) emoji = "⚠️";
  else if (watch.length > 0) emoji = "📊";

  const totalBudget = Object.values(budgets).reduce((sum, b) => sum + b, 0);
  const totalSpent = activeExpenses
    .filter((e) => new Date(e.ts) >= startDate)
    .reduce((sum, e) => sum + e.amount, 0);
  const totalRemaining = totalBudget - totalSpent;
  const totalPercent = totalBudget > 0 ? ((totalSpent / totalBudget) * 100).toFixed(1) : 0;

  const message = `${emoji} <b>Budget Alert - ${periodName}</b>\n\n💼 <b>Overall Budget</b>\n   Spent: ₹${totalSpent.toFixed(0)} / ₹${totalBudget}\n   Left: ₹${totalRemaining.toFixed(0)} (${totalPercent}%)\n\n${sections.join("\n\n")}`;

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
  if (text !== "/start" && text !== "/help" && text !== "/version") return false;

  if (text === "/version") {
    await sendMessage(
      chatId,
      `🤖 <b>Webhook Version</b>\n\nVersion: ${WEBHOOK_VERSION}\n\nThis confirms the correct code is deployed.`
    );
    return true;
  }

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
/export - Download complete data report

<b>Advanced Commands:</b>
/stats - Spending statistics
/monthly - This month's report
/topspenders - Leaderboard
/last 10 - Recent expenses
/search &lt;term&gt; - Find expenses
/budget - Budget breakdown (today, week, month + last month)
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
    spentBy: e.spent_by,           // For tagged expenses - who paid
    expenseType: e.expense_type,   // For tagged expenses - 'for', 'by', 'split'
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
      spent_by: e.spentBy || null,        // For tagged expenses - who paid
      expense_type: e.expenseType || null, // For tagged expenses - 'for', 'by', 'split'
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

/* ================= TAGGED EXPENSE PARSER ================= */

/**
 * Parse tagged expenses with special syntax:
 * - "100-food for @john" - Expense belongs to John, you paid
 * - "100-food by @john" - Your expense, John paid
 * - "100-food split @john" - Split expense, John paid
 * 
 * Supports all expense formats:
 * - 100-food, 100 food, 100, food 100
 * - Multiple amounts: 50+30-food, 50+30 food
 * - Text with numbers: "bought 100 groceries"
 */
function parseTaggedExpense(text, message, members) {
  // Extract mentions from message entities
  const entities = message.entities || [];
  const mentions = entities
    .filter(e => e.type === 'mention' || e.type === 'text_mention')
    .map(e => {
      if (e.type === 'text_mention') {
        return {
          username: e.user.username || e.user.first_name,
          userId: e.user.id,
          displayName: e.user.first_name,
        };
      } else {
        // Extract @username from text
        const mentionText = text.substring(e.offset, e.offset + e.length);
        const username = mentionText.replace('@', '');
        return { username, userId: null, displayName: username };
      }
    });
  
  if (mentions.length === 0) {
    return null; // No mentions found
  }
  
  const mention = mentions[0]; // Use first mention
  
  // Find the member in database
  const taggedMember = members.find(m => 
    m.username === mention.username || 
    m.telegramUserId === mention.userId ||
    m.displayName === mention.displayName
  );
  
  if (!taggedMember) {
    // Member not found, ignore tagging
    return null;
  }
  
  // Check for expense type keywords
  let expenseType = null;
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes(' for @') || lowerText.includes(' for@')) {
    expenseType = 'for'; // Belongs to tagged person
  } else if (lowerText.includes(' by @') || lowerText.includes(' by@')) {
    expenseType = 'by'; // Belongs to you, paid by tagged person
  } else if (lowerText.includes(' split @') || lowerText.includes(' split@')) {
    expenseType = 'split'; // Split expense
  }
  
  if (!expenseType) {
    return null; // No valid expense type keyword
  }
  
  // Remove the tagging part to get clean expense text
  const cleanText = text
    .replace(/ for @\w+/gi, '')
    .replace(/ by @\w+/gi, '')
    .replace(/ split @\w+/gi, '')
    .trim();
  
  // Parse expense using comprehensive patterns
  const parsed = parseExpenseText(cleanText);
  
  if (!parsed || parsed.amount === 0) {
    return null; // No valid amount found
  }
  
  return {
    amount: parsed.amount,
    category: parsed.category || 'uncategorized',
    taggedUser: taggedMember,
    expenseType,
    comment: cleanText,
  };
}

/**
 * Comprehensive expense text parser
 * Handles all formats:
 * - 100-food, 100 food, 100
 * - food 100, grocery 100
 * - 50+30-food, 50+30 food
 * - "bought 100 groceries", "spent 100 on food"
 */
function parseExpenseText(text) {
  const cleaned = text
    .toLowerCase()
    .replace(/\b(spent|paid|expense|for|on|the|a|an|in|at|to|bought|purchase|purchased)\b/g, '')
    .trim();
  
  let amount = 0;
  let category = null;
  
  // Pattern 1: Multi-amount with dash (50+30-food)
  const pattern1 = /(\d+(?:\.\d+)?(?:\s*[+]\s*\d+(?:\.\d+)?)+)\s*-\s*([a-z]+)/;
  let match = cleaned.match(pattern1);
  if (match) {
    const amountStr = match[1].replace(/\s+/g, '');
    amount = amountStr.split('+').reduce((sum, num) => sum + parseFloat(num), 0);
    category = match[2];
    return { amount, category };
  }
  
  // Pattern 2: Multi-amount with space (50+30 food)
  const pattern2 = /(\d+(?:\.\d+)?(?:\s*[+]\s*\d+(?:\.\d+)?)+)\s+([a-z]+)/;
  match = cleaned.match(pattern2);
  if (match) {
    const amountStr = match[1].replace(/\s+/g, '');
    amount = amountStr.split('+').reduce((sum, num) => sum + parseFloat(num), 0);
    category = match[2];
    return { amount, category };
  }
  
  // Pattern 3: Amount-category with dash (100-food)
  const pattern3 = /(\d+(?:\.\d+)?)\s*-\s*([a-z]+)/;
  match = cleaned.match(pattern3);
  if (match) {
    amount = parseFloat(match[1]);
    category = match[2];
    return { amount, category };
  }
  
  // Pattern 4: Amount category with space (100 food)
  const pattern4 = /^(\d+(?:\.\d+)?)\s+([a-z]+)/;
  match = cleaned.match(pattern4);
  if (match) {
    amount = parseFloat(match[1]);
    category = match[2];
    return { amount, category };
  }
  
  // Pattern 5: Category amount (food 100, grocery 100)
  const pattern5 = /^([a-z]+)\s+(\d+(?:\.\d+)?)/;
  match = cleaned.match(pattern5);
  if (match) {
    category = match[1];
    amount = parseFloat(match[2]);
    return { amount, category };
  }
  
  // Pattern 6: Amount in middle of text ("bought 100 groceries")
  const pattern6 = /\b(\d+(?:\.\d+)?)\b/;
  match = cleaned.match(pattern6);
  if (match) {
    amount = parseFloat(match[1]);
    
    // Try to find category word before or after the amount
    const words = cleaned.split(/\s+/);
    const amountIndex = words.findIndex(w => w.includes(match[1]));
    
    // Check word before amount
    if (amountIndex > 0 && /^[a-z]+$/.test(words[amountIndex - 1])) {
      category = words[amountIndex - 1];
    }
    // Check word after amount
    else if (amountIndex < words.length - 1 && /^[a-z]+$/.test(words[amountIndex + 1])) {
      category = words[amountIndex + 1];
    }
    
    return { amount, category };
  }
  
  // Pattern 7: Just amount (100)
  const pattern7 = /^\d+(?:\.\d+)?$/;
  if (pattern7.test(cleaned)) {
    amount = parseFloat(cleaned);
    return { amount, category: null };
  }
  
  return null; // No amount found
}


function parseExpense(text) {
  // Defensive check: Never parse commands (anything starting with /)
  if (text.trim().startsWith("/")) {
    return [];
  }
  
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

  // Get current date info - use IST
  const nowUTC = new Date();
  const nowIST = new Date(nowUTC.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const currentDay = nowIST.getDate();
  const currentMonth = nowIST.getMonth();
  const currentYear = nowIST.getFullYear();

  // Get start of today
  const startOfToday = new Date(currentYear, currentMonth, currentDay);

  // Get start of this week (Monday)
  const dayOfWeek = nowIST.getDay();
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
    // Remove bot username from commands (e.g., /start@botname -> /start)
    let text = message.text.trim();
    if (text.includes('@')) {
      text = text.split('@')[0].trim();
    }
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

      const totalBudget = categories.reduce((sum, [_, budget]) => sum + budget, 0);
      const lines = categories.map(
        ([cat, budget]) => `📂 <b>${cat}</b>\n   Budget: ₹${budget}`
      );
      const header = `📂 <b>Categories</b>\n\n💰 <b>Overall Budget:</b> ₹${totalBudget}`;
      await sendMessage(
        chatId,
        `${header}\n\n${lines.join("\n\n")}\n\n<i>Note: "uncategorized" is a default category for expenses without a category.</i>`
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
        return `${idx + 1}. ${escapeHtml(name)}`;
      });
      const header = `Rank  Name                 │ Username`;
      const divider = `${"─".repeat(50)}`;

      await sendMessage(
        chatId,
        `👥 <b>Registered Members (${data.members.length})</b>\n\n${lines.join("\n\n")}`
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
      const totalBudget = Object.values(data.budgets).reduce((sum, b) => sum + b, 0);
      const totalSpent = activeExpenses.reduce((sum, e) => sum + e.amount, 0);
      const totalRemaining = totalBudget - totalSpent;

      for (const cat of categories) {
        const spent = activeExpenses
          .filter((e) => e.category === cat)
          .reduce((sum, e) => sum + e.amount, 0);
        const budget = data.budgets[cat];
        const remaining = budget - spent;
        const percent = budget > 0 ? ((spent / budget) * 100).toFixed(1) : 0;

        const status = remaining >= 0 ? "✅" : "⚠️";
        lines.push(`${status} <b>${cat}</b>\n   Spent: ₹${spent.toFixed(0)} / ₹${budget}\n   Left: ₹${remaining.toFixed(0)} (${percent}%)`);
      }

      const overallStatus = totalRemaining >= 0 ? "✅" : "⚠️";
      const header = `📊 <b>Summary</b>\n\n${overallStatus} <b>Overall Budget</b>\n   Spent: ₹${totalSpent.toFixed(0)} / ₹${totalBudget}\n   Left: ₹${totalRemaining.toFixed(0)}`;
      await sendMessage(chatId, `${header}\n\n${lines.join("\n\n")}`);
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
          `${escapeHtml(debtorName)} → ${escapeHtml(creditorName)}: ₹${amount.toFixed(2)}`
        );

        creditor.amount -= amount;
        debtor.amount -= amount;

        if (creditor.amount < 0.01) i++;
        if (debtor.amount < 0.01) j++;
      }

      const lines = [
        `<b>Total:</b> ₹${totalSpent.toFixed(2)}`,
        `<b>Per person:</b> ₹${perPerson.toFixed(2)}`,
        "",
        ...settlements,
      ];

      await sendMessage(chatId, `💸 <b>Settlements</b>\n\n${lines.join("\n")}`);
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
          (e.comment && e.comment.toLowerCase().includes(query)) ||
          e.amount.toString().includes(query) ||
          e.userName.toLowerCase().includes(query)
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
        return `${date} • ${escapeHtml(name)} • ₹${e.amount}\n   ${e.category} ${settled}`;
      });
      const header = `Date     │ User            │ Amount  │ Category`;
      const divider = `${"─".repeat(60)}`;

      const more =
        results.length > 10 ? `\n\n<i>+${results.length - 10} more</i>` : "";
      await sendMessage(
        chatId,
        `🔍 <b>Results (${results.length})</b>\n\n${lines.join("\n\n")}${more}`
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
        return `${date} • ${escapeHtml(name)}\n   ₹${e.amount} - ${e.category} ${settled}`;
      });
      const header = `Date/Time       │ User            │ Amount  │ Category`;
      const divider = `${"─".repeat(65)}`;

      await sendMessage(
        chatId,
        `📝 <b>Last ${recent.length}</b>\n\n${lines.join("\n\n")}`
      );
      return res.status(200).send("OK");
    }

    /* ================= EXPENSE PARSER WITH TAGGING ================= */

    // Skip expense parsing if this is a command (starts with /)
    if (!text.startsWith("/")) {
      // Check for tagged expenses first
      const taggedExpense = parseTaggedExpense(text, message, data.members);
      
      if (taggedExpense) {
        // Handle tagged expense
        let { amount, category, taggedUser, expenseType, comment } = taggedExpense;
        
        // Validate category - if doesn't exist, default to uncategorized
        if (category !== "uncategorized" && !data.budgets[category]) {
          category = "uncategorized";
        }
        
        // Determine who the expense belongs to based on type
        let expenseOwner = userName;
        let spentBy = userName;
        
        if (expenseType === 'for') {
          // Type A: Belongs fully to tagged person, you paid
          expenseOwner = taggedUser.userName;
          spentBy = userName;
        } else if (expenseType === 'by') {
          // Type B: Belongs fully to you, tagged person paid
          expenseOwner = userName;
          spentBy = taggedUser.userName;
        } else if (expenseType === 'split') {
          // Type C: Split expense, tagged person paid
          expenseOwner = userName; // Will be split in settlement
          spentBy = taggedUser.userName;
        }
        
        // Save the expense
        const newExpense = {
          telegramUserId: expenseType === 'for' ? taggedUser.telegramUserId : telegramUserId,
          userName: expenseOwner,
          amount: amount,
          category: category,
          comment: comment || text.substring(0, 200),
          ts: now(),
          discarded: false,
          settled: false,
          telegramMessageId: messageId,
          spentBy: spentBy, // Track who actually paid
          expenseType: expenseType, // Track the type for reporting
        };
        
        await saveExpenses([newExpense]);
        
        // Reload expenses for budget calculation
        const updatedExpenses = await loadExpenses();
        
        // Calculate budget progress
        const progress = calculateBudgetProgress(
          category,
          data.budgets,
          updatedExpenses
        );
        
        // Build response message
        let responseMsg = '';
        if (expenseType === 'for') {
          responseMsg = `✅ <b>Expense for @${taggedUser.displayName || taggedUser.userName}</b>\n\n`;
          responseMsg += `💰 ₹${amount} - ${category}\n`;
          responseMsg += `💳 Paid by: You\n`;
          responseMsg += `👤 Belongs to: @${taggedUser.displayName || taggedUser.userName}`;
        } else if (expenseType === 'by') {
          responseMsg = `✅ <b>Your Expense</b>\n\n`;
          responseMsg += `💰 ₹${amount} - ${category}\n`;
          responseMsg += `💳 Paid by: @${taggedUser.displayName || taggedUser.userName}\n`;
          responseMsg += `👤 Belongs to: You`;
        } else if (expenseType === 'split') {
          responseMsg = `✅ <b>Split Expense</b>\n\n`;
          responseMsg += `💰 ₹${amount} - ${category}\n`;
          responseMsg += `💳 Paid by: @${taggedUser.displayName || taggedUser.userName}\n`;
          responseMsg += `📊 Will be split in settlement`;
        }
        
        responseMsg += `\n\n<b>${category}:</b>\n`;
        responseMsg += `Today: ₹${progress.spentToday.toFixed(0)}/₹${progress.dailyBudget.toFixed(0)} (${progress.dailyPercent}%)\n`;
        responseMsg += `Month: ₹${progress.spentThisMonth.toFixed(0)}/₹${progress.monthlyBudget.toFixed(0)} (${progress.monthlyPercent}%)`;
        
        await sendMessage(chatId, responseMsg, messageId);
        return res.status(200).send("OK");
      }
      
      // Try to parse as regular expense
      const parsedExpenses = parseExpense(text);

    if (parsedExpenses.length > 0) {
      const validExpenses = [];
      const errors = [];

      for (const exp of parsedExpenses) {
        // If category doesn't exist and is not "uncategorized", change it to "uncategorized"
        if (exp.category && exp.category !== "uncategorized" && !data.budgets[exp.category]) {
          exp.category = "uncategorized";
        }
        validExpenses.push(exp);
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

      // Calculate overall budget progress
      const totalMonthlyBudget = Object.values(data.budgets).reduce((sum, b) => sum + b, 0);
      const totalDailyBudget = totalMonthlyBudget / 30;
      const totalWeeklyBudget = (totalMonthlyBudget * 7) / 30;

      const currentUTC = new Date();
      const currentIST = new Date(currentUTC.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      const currentDay = currentIST.getDate();
      const currentMonth = currentIST.getMonth();
      const currentYear = currentIST.getFullYear();
      
      const todayStart = new Date(currentYear, currentMonth, currentDay);
      const weekStart = new Date(currentYear, currentMonth, currentDay - (currentIST.getDay() === 0 ? 6 : currentIST.getDay() - 1));
      const monthStart = new Date(currentYear, currentMonth, 1);

      const todaySpent = updatedExpenses
        .filter((e) => !e.discarded && new Date(e.ts) >= todayStart)
        .reduce((sum, e) => sum + e.amount, 0);
      const weekSpent = updatedExpenses
        .filter((e) => !e.discarded && new Date(e.ts) >= weekStart)
        .reduce((sum, e) => sum + e.amount, 0);
      const monthSpent = updatedExpenses
        .filter((e) => !e.discarded && new Date(e.ts) >= monthStart)
        .reduce((sum, e) => sum + e.amount, 0);

      const todayPercent = totalDailyBudget > 0 ? ((todaySpent / totalDailyBudget) * 100).toFixed(0) : 0;
      const weekPercent = totalWeeklyBudget > 0 ? ((weekSpent / totalWeeklyBudget) * 100).toFixed(0) : 0;
      const monthPercent = totalMonthlyBudget > 0 ? ((monthSpent / totalMonthlyBudget) * 100).toFixed(0) : 0;

      budgetLines.push(
        `<b>💼 Overall Budget:</b>`,
        `Today: ₹${todaySpent.toFixed(0)}/₹${totalDailyBudget.toFixed(0)} (${todayPercent}%)`,
        `Week: ₹${weekSpent.toFixed(0)}/₹${totalWeeklyBudget.toFixed(0)} (${weekPercent}%)`,
        `Month: ₹${monthSpent.toFixed(0)}/₹${totalMonthlyBudget.toFixed(0)} (${monthPercent}%)`
      );

      for (const category of uniqueCategories) {
        const progress = calculateBudgetProgress(
          category,
          data.budgets,
          updatedExpenses
        );

        budgetLines.push(
          ``,
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
    } // End of expense parsing (skip if command)

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

      const totalBudget = Object.values(data.budgets).reduce((sum, b) => sum + b, 0);
      const remaining = totalBudget - total;
      const overallPercent = totalBudget > 0 ? ((total / totalBudget) * 100).toFixed(1) : 0;
      
      await sendMessage(
        chatId,
        `📊 <b>Stats</b>\n\n💰 Total: ₹${total.toFixed(2)}\n📝 Expenses: ${activeExpenses.length}\n📊 Average: ₹${avgPerExpense.toFixed(2)}\n\n💼 <b>Overall Budget</b>\n   Spent: ₹${total.toFixed(2)} / ₹${totalBudget}\n   Left: ₹${remaining.toFixed(2)} (${overallPercent}%)\n\n🥇 Top Spender: ${escapeHtml(topSpenderName)}\n   ₹${topSpender[1].toFixed(2)}\n\n📌 Top Category: ${topCategory[0]}\n   ₹${topCategory[1].toFixed(2)}`
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
          idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}.`;
        return `${medal} ${escapeHtml(name)}\n   ₹${amount.toFixed(2)}`;
      });

      await sendMessage(chatId, `🏆 <b>Top Spenders</b>\n\n${lines.join("\n\n")}`);
      return res.status(200).send("OK");
    }

    /* ================= MONTHLY REPORT ================= */
    if (text === "/monthly") {
      const nowUTC = new Date();
      const nowIST = new Date(nowUTC.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      const currentMonth = nowIST.getMonth();
      const currentYear = nowIST.getFullYear();

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

      const monthName = nowIST.toLocaleString("default", { month: "long" });
      const lines = Object.entries(byCategory)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, amount]) => `• <b>${cat}</b>\n   ₹${amount.toFixed(2)}`);

      await sendMessage(
        chatId,
        `📅 <b>${monthName} ${currentYear}</b>\n\n💰 Total: ₹${total.toFixed(2)}\n📝 Expenses: ${monthlyExpenses.length}\n\n${lines.join("\n\n")}`
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

      // Get IDs of all active expenses
      const activeExpenseIds = data.expenses
        .filter((e) => !e.discarded)
        .map((e) => e.id);

      // Actually delete from database
      if (activeExpenseIds.length > 0) {
        const { error } = await supabase
          .from("expenses")
          .delete()
          .in("id", activeExpenseIds);

        if (error) {
          console.error("Error deleting expenses:", error);
          await sendMessage(
            chatId,
            `❌ <b>Error</b>\n\nFailed to delete expenses: ${error.message}`
          );
          return res.status(200).send("OK");
        }
      }

      await sendMessage(
        chatId,
        `🗑️ <b>Deleted ${activeCount} expenses</b>\n\n<i>All rows have been permanently removed from the database.</i>`
      );
      return res.status(200).send("OK");
    }

    /* ================= BUDGET BREAKDOWN ================= */
    if (text === "/budget") {
      const categories = Object.keys(data.budgets);
      if (!categories.length) {
        await sendMessage(
          chatId,
          `💼 <b>No Categories</b>\n\nUse /addcategory to create categories first.`
        );
        return res.status(200).send("OK");
      }

      const activeExpenses = data.expenses.filter((e) => !e.discarded);
      const currentUTC = new Date();
      const currentIST = new Date(currentUTC.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      const currentDay = currentIST.getDate();
      const currentMonth = currentIST.getMonth();
      const currentYear = currentIST.getFullYear();

      // Date boundaries for current period
      const todayStart = new Date(currentYear, currentMonth, currentDay);
      const weekStart = new Date(currentYear, currentMonth, currentDay - (currentIST.getDay() === 0 ? 6 : currentIST.getDay() - 1));
      const monthStart = new Date(currentYear, currentMonth, 1);

      // Date boundaries for last month
      const lastMonthStart = new Date(currentYear, currentMonth - 1, 1);
      const lastMonthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59);

      // Calculate overall budgets
      const totalMonthlyBudget = Object.values(data.budgets).reduce((sum, b) => sum + b, 0);
      const totalDailyBudget = totalMonthlyBudget / 30;
      const totalWeeklyBudget = (totalMonthlyBudget * 7) / 30;

      // Overall current period spending
      const todaySpent = activeExpenses
        .filter((e) => new Date(e.ts) >= todayStart)
        .reduce((sum, e) => sum + e.amount, 0);
      const weekSpent = activeExpenses
        .filter((e) => new Date(e.ts) >= weekStart)
        .reduce((sum, e) => sum + e.amount, 0);
      const monthSpent = activeExpenses
        .filter((e) => new Date(e.ts) >= monthStart)
        .reduce((sum, e) => sum + e.amount, 0);

      // Last month spending
      const lastMonthSpent = activeExpenses
        .filter((e) => {
          const expDate = new Date(e.ts);
          return expDate >= lastMonthStart && expDate <= lastMonthEnd;
        })
        .reduce((sum, e) => sum + e.amount, 0);

      const todayPercent = totalDailyBudget > 0 ? ((todaySpent / totalDailyBudget) * 100).toFixed(1) : 0;
      const weekPercent = totalWeeklyBudget > 0 ? ((weekSpent / totalWeeklyBudget) * 100).toFixed(1) : 0;
      const monthPercent = totalMonthlyBudget > 0 ? ((monthSpent / totalMonthlyBudget) * 100).toFixed(1) : 0;
      const lastMonthPercent = totalMonthlyBudget > 0 ? ((lastMonthSpent / totalMonthlyBudget) * 100).toFixed(1) : 0;

      // Build overall budget section
      const overallLines = [
        `💼 <b>Overall Budget</b>`,
        ``,
        `📅 Today:`,
        `   Spent: ₹${todaySpent.toFixed(0)} / ₹${totalDailyBudget.toFixed(0)} (${todayPercent}%)`,
        ``,
        `📊 This Week:`,
        `   Spent: ₹${weekSpent.toFixed(0)} / ₹${totalWeeklyBudget.toFixed(0)} (${weekPercent}%)`,
        ``,
        `📆 This Month:`,
        `   Spent: ₹${monthSpent.toFixed(0)} / ₹${totalMonthlyBudget} (${monthPercent}%)`,
        ``,
        `📈 Last Month (Planned vs Consumed):`,
        `   ₹${lastMonthSpent.toFixed(0)} / ₹${totalMonthlyBudget} (${lastMonthPercent}%)`,
      ];
      // Build category-wise sections
      const categoryLines = [];
      for (const cat of categories) {
        const budget = data.budgets[cat];
        const dailyBudget = budget / 30;
        const weeklyBudget = (budget * 7) / 30;

        const catTodaySpent = activeExpenses
          .filter((e) => e.category === cat && new Date(e.ts) >= todayStart)
          .reduce((sum, e) => sum + e.amount, 0);
        const catWeekSpent = activeExpenses
          .filter((e) => e.category === cat && new Date(e.ts) >= weekStart)
          .reduce((sum, e) => sum + e.amount, 0);
        const catMonthSpent = activeExpenses
          .filter((e) => e.category === cat && new Date(e.ts) >= monthStart)
          .reduce((sum, e) => sum + e.amount, 0);
        const catLastMonthSpent = activeExpenses
          .filter((e) => {
            const expDate = new Date(e.ts);
            return e.category === cat && expDate >= lastMonthStart && expDate <= lastMonthEnd;
          })
          .reduce((sum, e) => sum + e.amount, 0);

        const catTodayPercent = dailyBudget > 0 ? ((catTodaySpent / dailyBudget) * 100).toFixed(1) : 0;
        const catWeekPercent = weeklyBudget > 0 ? ((catWeekSpent / weeklyBudget) * 100).toFixed(1) : 0;
        const catMonthPercent = budget > 0 ? ((catMonthSpent / budget) * 100).toFixed(1) : 0;
        const catLastMonthPercent = budget > 0 ? ((catLastMonthSpent / budget) * 100).toFixed(1) : 0;

        categoryLines.push(
          ``,
          `📂 <b>${cat}</b>`,
          `   Today: ₹${catTodaySpent.toFixed(0)} / ₹${dailyBudget.toFixed(0)} (${catTodayPercent}%)`,
          `   Week: ₹${catWeekSpent.toFixed(0)} / ₹${weeklyBudget.toFixed(0)} (${catWeekPercent}%)`,
          `   Month: ₹${catMonthSpent.toFixed(0)} / ₹${budget} (${catMonthPercent}%)`,
          `   <b>Last Month:</b> ₹${catLastMonthSpent.toFixed(0)} / ₹${budget} (${catLastMonthPercent}%)`
        );
      }

      const message = `💼 <b>Budget Breakdown</b>\n\n${overallLines.join("\n")}\n\n${"─".repeat(30)}\n${categoryLines.join("\n")}`;
      await sendMessage(chatId, message);
      return res.status(200).send("OK");
    }

    /* ================= BUDGET ALERTS ================= */
    if (text === "/alerts") {
      const alertData = await generateAlerts(data.budgets, data.expenses, "monthly");
      await sendMessage(chatId, alertData.message);
      return res.status(200).send("OK");
    }
    /* ================= EXPORT COMMAND ================= */
    if (text === "/export") {
      // Send immediate confirmation
      await sendMessage(
        chatId,
        `📊 <b>Generating Report</b>\n\n⏳ Your complete data export is being generated...\n\nThis may take a moment. The Excel file will be shared shortly.`,
        messageId
      );

      try {
        // Generate Excel report
        const excelBuffer = await generateExcelReport();
        
        // Get current date for filename
        const now = new Date();
        const dateStr = now.toLocaleDateString("en-IN", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          timeZone: "Asia/Kolkata"
        }).replace(/\//g, "-");
        
        const fileName = `Expense_Report_${dateStr}.xlsx`;
        
        // Send the Excel file
        await sendDocument(chatId, excelBuffer, fileName, messageId);
        
        // Send success message
        await sendMessage(
          chatId,
          `✅ <b>Report Generated Successfully</b>\n\n📁 File: ${fileName}\n\nYour complete expense data has been exported with the following sheets:\n• Expenses\n• Active Expenses\n• Budget Status\n• Budgets\n• Members\n• Settlements\n• User Expense Pending`,
          messageId
        );
        
      } catch (error) {
        console.error("Export generation failed:", error);
        await sendMessage(
          chatId,
          `❌ <b>Export Failed</b>\n\n⚠️ Something went wrong while generating your report.\n\nPlease try again later. If the issue persists, contact support.`,
          messageId
        );
      }
      
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
