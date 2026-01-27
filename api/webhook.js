import { createClient } from '@supabase/supabase-js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // works, but anon is safer long-term

const BOT_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing env vars');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// --------------------------------------------------
// TELEGRAM HELPERS
// --------------------------------------------------
async function sendMessage(chatId, text, replyTo) {
  try {
    const res = await fetch(`${BOT_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_to_message_id: replyTo,
      }),
    });
    const json = await res.json();
    if (!json.ok) console.error('Telegram error:', json);
  } catch (err) {
    console.error('sendMessage failed:', err);
  }
}

async function sendDocument(chatId, csv, filename) {
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('document', new Blob([csv], { type: 'text/csv' }), filename);

  await fetch(`${BOT_API}/sendDocument`, {
    method: 'POST',
    body: form,
  });
}

// --------------------------------------------------
// UTILS
// --------------------------------------------------
const now = () => new Date().toISOString();

const normalize = (v) => v.toLowerCase().trim();

const formatDate = (ts) =>
  ts
    ? new Date(ts).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Never';

// --------------------------------------------------
// SUPABASE HELPERS
// --------------------------------------------------
async function must(query, label) {
  const { data, error } = await query;
  if (error) {
    console.error(`Supabase ${label} error:`, error);
    throw error;
  }
  return data;
}

async function getBudgets() {
  const rows = await must(
    supabase.from('budgets').select('*'),
    'getBudgets'
  );

  const map = {};
  rows.forEach((r) => (map[normalize(r.category)] = Number(r.budget)));
  return map;
}

async function setBudget(category, budget) {
  await must(
    supabase.from('budgets').upsert({
      category: normalize(category),
      budget,
    }),
    'setBudget'
  );
}

async function deleteBudget(category) {
  await must(
    supabase.from('budgets').delete().eq('category', normalize(category)),
    'deleteBudget'
  );
}

async function getExpenses() {
  const rows = await must(
    supabase.from('expenses').select('*').order('created_at', { ascending: false }),
    'getExpenses'
  );

  return rows.map((r) => ({
    user: r.user_name,
    amount: Number(r.amount),
    category: normalize(r.category),
    ts: r.created_at,
    discarded: r.discarded,
  }));
}

async function addExpense(messageId, user, amount, category, comment) {
  await must(
    supabase.from('expenses').insert({
      message_id: messageId,
      user_name: user,
      amount,
      category: normalize(category),
      comment,
      created_at: now(),
      discarded: false,
    }),
    'addExpense'
  );
}

async function getMembers() {
  const rows = await must(
    supabase.from('members').select('user_name'),
    'getMembers'
  );
  return rows.map((r) => r.user_name);
}

async function addMember(name) {
  await must(
    supabase.from('members').upsert({ user_name: name }),
    'addMember'
  );
}

// --------------------------------------------------
// CSV EXPORT
// --------------------------------------------------
async function generateCSV() {
  const budgets = await getBudgets();
  const expenses = await getExpenses();
  const members = await getMembers();

  let csv = 'BUDGETS\nCategory,Budget\n';
  Object.entries(budgets).forEach(([c, b]) => (csv += `${c},${b}\n`));

  csv += '\nEXPENSES\nUser,Amount,Category,Timestamp\n';
  expenses.forEach(
    (e) => (csv += `${e.user},${e.amount},${e.category},${e.ts}\n`)
  );

  csv += '\nMEMBERS\nUser\n';
  members.forEach((m) => (csv += `${m}\n`));

  return csv;
}

// --------------------------------------------------
// MAIN HANDLER
// --------------------------------------------------
async function handleMessage(chatId, user, text, messageId) {
  try {
    // ---------- COMMANDS ----------
    if (text === '/commands') {
      return sendMessage(
        chatId,
        `📘 Expense Bot

Add expense:
• 90-grocery
• 90 grocery

/category
/addcategory <name> <budget>
/setbudget <name> <budget>
/deletecategory <name>

/summary
/export`
      );
    }

    if (text === '/export') {
      const csv = await generateCSV();
      await sendDocument(chatId, csv, `expenses_${Date.now()}.csv`);
      return sendMessage(chatId, '✅ Export ready');
    }

    if (text === '/categories') {
      const budgets = await getBudgets();
      if (!Object.keys(budgets).length)
        return sendMessage(chatId, 'No categories yet');

      return sendMessage(
        chatId,
        '📂 Categories\n\n' +
          Object.entries(budgets)
            .map(([c, b]) => `• ${c}: ₹${b}`)
            .join('\n')
      );
    }

    if (text.startsWith('/addcategory')) {
      const [, c, b] = text.split(' ');
      if (!c || isNaN(b))
        return sendMessage(chatId, 'Usage: /addcategory food 1000');
      await setBudget(c, Number(b));
      return sendMessage(chatId, `✅ ${c} added`);
    }

    if (text.startsWith('/deletecategory')) {
      const [, c] = text.split(' ');
      if (!c) return sendMessage(chatId, 'Usage: /deletecategory food');
      await deleteBudget(c);
      return sendMessage(chatId, `🗑️ ${c} removed`);
    }

    // ---------- EXPENSE PARSING ----------
    const budgets = await getBudgets();
    if (!Object.keys(budgets).length)
      return sendMessage(chatId, '❌ No categories configured');

    const amounts = text.match(/\d+/g)?.map(Number) || [];
    const words = text.toLowerCase().match(/[a-z]+/g) || [];
    const categories = words.filter((w) => budgets[w]);

    if (!amounts.length || !categories.length) {
      return sendMessage(
        chatId,
        `❌ Couldn't understand this.

Format:
• 90-grocery
• 90 grocery

Available categories:
${Object.keys(budgets).join(', ')}`
      );
    }

    const amount = amounts[0];
    const category = categories[0];

    const members = await getMembers();
    if (!members.includes(user)) await addMember(user);

    await addExpense(messageId, user, amount, category, text);

    return sendMessage(
      chatId,
      `✅ Expense Added

👤 ${user}
💰 ₹${amount}
📂 ${category}`
    );
  } catch (err) {
    console.error('handleMessage error:', err);
    return sendMessage(
      chatId,
      '❌ Something broke. Check logs or Supabase config.'
    );
  }
}

// --------------------------------------------------
// WEBHOOK ENTRY
// --------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  try {
    const update = req.body;
    const msg = update.message || update.edited_message;
    if (!msg?.text) return res.status(200).json({ ok: true });

    await handleMessage(
      msg.chat.id,
      msg.from.first_name,
      msg.text.trim(),
      msg.message_id
    );
  } catch (err) {
    console.error('Webhook error:', err);
  }

  return res.status(200).json({ ok: true });
}
