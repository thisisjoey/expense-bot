import { createClient } from "@supabase/supabase-js";

/* ================= CONFIG ================= */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID; // Add your group chat ID here

const BOT_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

/* ================= HELPERS ================= */

async function sendMessage(chatId, text) {
  try {
    await fetch(`${BOT_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });
  } catch (error) {
    console.error("Failed to send message:", error);
  }
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
    amount: Number(e.amount) || 0,
    category: e.category,
    ts: e.ts,
    discarded: !!e.discarded,
    settled: !!e.settled,
  }));
}

function getStatusEmoji(percent) {
  if (percent <= 80) return "✅"; // Green - On Track
  if (percent <= 100) return "⚠️"; // Yellow - Close to limit
  return "🚨"; // Red - Off Track
}

function getStatusText(percent) {
  if (percent <= 80) return "On Track";
  if (percent <= 100) return "Close to Limit";
  return "Off Track";
}

/* ================= GENERATE DAILY SUMMARY ================= */

async function generateDailySummary() {
  const budgets = await loadBudgets();
  const expenses = await loadExpenses();

  // Filter active expenses only
  const activeExpenses = expenses.filter((e) => !e.discarded);

  // Calculate total monthly budget
  const totalMonthlyBudget = Object.values(budgets).reduce((sum, b) => sum + b, 0);
  const totalDailyBudget = totalMonthlyBudget / 30;
  const totalWeeklyBudget = (totalMonthlyBudget * 7) / 30;

  // Get date boundaries
  const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const currentDay = nowIST.getDate();
  const currentMonth = nowIST.getMonth();
  const currentYear = nowIST.getFullYear();

  // Today (current day in IST)
  const todayStart = new Date(currentYear, currentMonth, currentDay);
  const todayEnd = new Date(currentYear, currentMonth, currentDay, 23, 59, 59);

  // Yesterday
  const yesterdayStart = new Date(currentYear, currentMonth, currentDay - 1);
  const yesterdayEnd = new Date(currentYear, currentMonth, currentDay - 1, 23, 59, 59);

  // This week (Monday to now)
  const dayOfWeek = nowIST.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(currentYear, currentMonth, currentDay - daysToMonday);

  // This month
  const monthStart = new Date(currentYear, currentMonth, 1);

  // Calculate spending
  const todaySpent = activeExpenses
    .filter((e) => {
      const expDate = new Date(e.ts);
      return expDate >= todayStart && expDate <= todayEnd;
    })
    .reduce((sum, e) => sum + e.amount, 0);

  const yesterdaySpent = activeExpenses
    .filter((e) => {
      const expDate = new Date(e.ts);
      return expDate >= yesterdayStart && expDate <= yesterdayEnd;
    })
    .reduce((sum, e) => sum + e.amount, 0);

  const weekSpent = activeExpenses
    .filter((e) => new Date(e.ts) >= weekStart && new Date(e.ts) <= todayEnd)
    .reduce((sum, e) => sum + e.amount, 0);

  const monthSpent = activeExpenses
    .filter((e) => new Date(e.ts) >= monthStart && new Date(e.ts) <= todayEnd)
    .reduce((sum, e) => sum + e.amount, 0);

  // Calculate daily average for this month
  const daysPassedThisMonth = currentDay;
  const dailyAverage = daysPassedThisMonth > 0 ? monthSpent / daysPassedThisMonth : 0;

  // Calculate percentages
  const todayPercent = totalDailyBudget > 0 ? (todaySpent / totalDailyBudget) * 100 : 0;
  const yesterdayPercent = totalDailyBudget > 0 ? (yesterdaySpent / totalDailyBudget) * 100 : 0;
  const dailyAvgPercent = totalDailyBudget > 0 ? (dailyAverage / totalDailyBudget) * 100 : 0;
  const weekPercent = totalWeeklyBudget > 0 ? (weekSpent / totalWeeklyBudget) * 100 : 0;
  const monthPercent = totalMonthlyBudget > 0 ? (monthSpent / totalMonthlyBudget) * 100 : 0;

  // Get status emojis and text
  const todayStatus = getStatusEmoji(todayPercent);
  const todayStatusText = getStatusText(todayPercent);
  
  const yesterdayStatus = getStatusEmoji(yesterdayPercent);
  const yesterdayStatusText = getStatusText(yesterdayPercent);
  
  const dailyAvgStatus = getStatusEmoji(dailyAvgPercent);
  const dailyAvgStatusText = getStatusText(dailyAvgPercent);
  
  const weekStatus = getStatusEmoji(weekPercent);
  const weekStatusText = getStatusText(weekPercent);
  
  const monthStatus = getStatusEmoji(monthPercent);
  const monthStatusText = getStatusText(monthPercent);

  // Build the message with two beautiful sections
  const message = `🌙 <b>Daily Summary</b>
${nowIST.toLocaleDateString("en-IN", { 
    day: "numeric", 
    month: "long", 
    year: "numeric",
    timeZone: "Asia/Kolkata"
  })}

┏━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃   <b>📊 CURRENT TRACKING</b>    ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━┛

📅 <b>Today</b>
₹${todaySpent.toFixed(0)} / ₹${totalDailyBudget.toFixed(0)} • ${todayPercent.toFixed(1)}%
${todayStatus} <i>${todayStatusText}</i>

📊 <b>Daily Average</b> <i>(${daysPassedThisMonth} days)</i>
₹${dailyAverage.toFixed(0)} / ₹${totalDailyBudget.toFixed(0)} • ${dailyAvgPercent.toFixed(1)}%
${dailyAvgStatus} <i>${dailyAvgStatusText}</i>

📈 <b>This Week</b>
₹${weekSpent.toFixed(0)} / ₹${totalWeeklyBudget.toFixed(0)} • ${weekPercent.toFixed(1)}%
${weekStatus} <i>${weekStatusText}</i>

📆 <b>This Month</b>
₹${monthSpent.toFixed(0)} / ₹${totalMonthlyBudget} • ${monthPercent.toFixed(1)}%
${monthStatus} <i>${monthStatusText}</i>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┏━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃   <b>📜 RETROSPECTIVE</b>       ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━┛

🔙 <b>Yesterday</b>
₹${yesterdaySpent.toFixed(0)} / ₹${totalDailyBudget.toFixed(0)} • ${yesterdayPercent.toFixed(1)}%
${yesterdayStatus} <i>${yesterdayStatusText}</i>

💡 <i>Keep tracking your expenses!</i>`;

  return message;
}

/* ================= MAIN CRON HANDLER ================= */

export default async function handler(req, res) {
  try {
    // Verify this is called by Vercel Cron (security check)
    if (req.headers["authorization"] !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!CHAT_ID) {
      console.error("TELEGRAM_CHAT_ID not configured");
      return res.status(500).json({ error: "Chat ID not configured" });
    }

    // Generate and send the summary
    const summary = await generateDailySummary();
    await sendMessage(CHAT_ID, summary);

    return res.status(200).json({ 
      success: true, 
      message: "Daily summary sent",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Cron job error:", error);
    return res.status(500).json({ 
      error: "Failed to send daily summary",
      details: error.message 
    });
  }
}
