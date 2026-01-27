// api/webhook.js
import { kv } from '@vercel/kv';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ================= HELPERS =================
async function sendMessage(chatId, text, replyTo) {
  await fetch(`${BOT_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_to_message_id: replyTo || undefined
    })
  });
}

async function sendDocument(chatId, csvData, filename) {
  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('document', new Blob([csvData], { type: 'text/csv' }), filename);
  
  await fetch(`${BOT_API}/sendDocument`, {
    method: 'POST',
    body: formData
  });
}

function now() {
  return new Date().toISOString();
}

function formatDate(ts) {
  if (!ts) return "Never";
  const date = new Date(ts);
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short", 
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// ================= DATA ACCESS =================
async function getBudgets() {
  return await kv.get('budgets') || { grocery: 150, ai: 1000 };
}

async function setBudgets(budgets) {
  await kv.set('budgets', budgets);
}

async function getExpenses() {
  return await kv.get('expenses') || [];
}

async function setExpenses(expenses) {
  await kv.set('expenses', expenses);
}

async function getMembers() {
  return await kv.get('members') || [];
}

async function setMembers(members) {
  await kv.set('members', members);
}

async function getSettlements() {
  return await kv.get('settlements') || {};
}

async function setSettlements(settlements) {
  await kv.set('settlements', settlements);
}

async function getLastSettledDate() {
  return await kv.get('lastSettledDate') || null;
}

async function setLastSettledDate(date) {
  await kv.set('lastSettledDate', date);
}

// ================= EXCEL EXPORT =================
async function generateCSV() {
  const budgets = await getBudgets();
  const expenses = await getExpenses();
  const members = await getMembers();
  const settlements = await getSettlements();
  const lastSettledDate = await getLastSettledDate();
  
  let csv = '';
  
  // Budgets sheet
  csv += 'BUDGETS\n';
  csv += 'Category,Budget\n';
  Object.entries(budgets).forEach(([cat, budget]) => {
    csv += `${cat},${budget}\n`;
  });
  
  csv += '\n';
  
  // Expenses sheet
  csv += 'EXPENSES\n';
  csv += 'ID,User,Amount,Category,Comment,Timestamp,Discarded\n';
  expenses.forEach(e => {
    csv += `${e.id},${e.user},${e.amount},${e.category},"${e.comment}",${e.ts},${e.discarded}\n`;
  });
  
  csv += '\n';
  
  // Members sheet
  csv += 'MEMBERS\n';
  csv += 'User,Settled,Last Settled Date\n';
  members.forEach(m => {
    csv += `${m},${settlements[m] ? 'TRUE' : 'FALSE'},${lastSettledDate || ''}\n`;
  });
  
  return csv;
}

// ================= COMMAND HANDLERS =================
async function handleCommand(chatId, user, text, messageId) {
  const budgets = await getBudgets();
  const members = await getMembers();
  
  if (text === '/commands') {
    await sendMessage(chatId, `📘 Expense Bot Commands Guide

🧾 Add Expenses
Format: <number>-<category>
Examples: 90-grocery, 90 grocery

📂 Categories
/categories - View all categories
/addcategory <n> <budget> - Add category
/setbudget <n> <budget> - Update budget
/deletecategory <n> - Remove category

📊 Summary
/summary - Budget overview

👥 Members
/members - View members
/addmember <n> - Add member
/removemember <n> - Remove member

💸 Settlement
/owe - Who owes whom
/settled - Mark as settled

📥 Export Data
/export - Download all data as CSV

♻️ Revert
Reply to expense with /revert

ℹ️ Help
/commands - This guide`);
    return;
  }
  
  if (text === '/export') {
    const csv = await generateCSV();
    const filename = `expense_data_${new Date().toISOString().split('T')[0]}.csv`;
    await sendDocument(chatId, csv, filename);
    await sendMessage(chatId, '✅ Data exported successfully!');
    return;
  }
  
  if (text === '/categories') {
    if (Object.keys(budgets).length === 0) {
      await sendMessage(chatId, `📂 Categories & Budgets\n\nNo categories yet.\nUse /addcategory <n> <budget>`);
      return;
    }
    const list = Object.entries(budgets).map(([c, b]) => `  • ${c}: ₹${b}`).join('\n');
    await sendMessage(chatId, `📂 Categories & Budgets\n\n${list}`);
    return;
  }
  
  if (text.startsWith('/addcategory')) {
    const [, cat, budget] = text.split(' ');
    if (!cat || isNaN(budget)) {
      await sendMessage(chatId, '❌ Usage: /addcategory <n> <budget>\nExample: /addcategory travel 2000');
      return;
    }
    budgets[cat] = Number(budget);
    await setBudgets(budgets);
    await sendMessage(chatId, `✅ Category Added\n\n${cat}: ₹${budget}`);
    return;
  }
  
  if (text.startsWith('/setbudget')) {
    const [, cat, budget] = text.split(' ');
    if (!cat || isNaN(budget) || !budgets[cat]) {
      await sendMessage(chatId, '❌ Usage: /setbudget <n> <budget>\nExample: /setbudget grocery 300');
      return;
    }
    const old = budgets[cat];
    budgets[cat] = Number(budget);
    await setBudgets(budgets);
    await sendMessage(chatId, `💰 Budget Updated\n\n${cat}\n₹${old} → ₹${budget}`);
    return;
  }
  
  if (text.startsWith('/deletecategory')) {
    const cat = text.split(' ')[1];
    if (!cat || !budgets[cat]) {
      await sendMessage(chatId, '❌ Category not found');
      return;
    }
    delete budgets[cat];
    await setBudgets(budgets);
    await sendMessage(chatId, `🗑️ Category Deleted\n\n${cat} removed`);
    return;
  }
  
  if (text === '/members') {
    if (members.length === 0) {
      await sendMessage(chatId, '👥 No members registered.\nUse /addmember <n>');
      return;
    }
    const list = members.map(m => `  • ${m}`).join('\n');
    await sendMessage(chatId, `👥 Registered Members\n\n${list}`);
    return;
  }
  
  if (text.startsWith('/addmember')) {
    const name = text.split(' ')[1];
    if (!name) {
      await sendMessage(chatId, '❌ Usage: /addmember <n>');
      return;
    }
    if (members.includes(name)) {
      await sendMessage(chatId, `⚠️ ${name} already registered`);
      return;
    }
    members.push(name);
    await setMembers(members);
    await sendMessage(chatId, `✅ Member Added\n\n${name} registered\nTotal: ${members.length}`);
    return;
  }
  
  if (text.startsWith('/removemember')) {
    const name = text.split(' ')[1];
    const idx = members.indexOf(name);
    if (idx === -1) {
      await sendMessage(chatId, '❌ Member not found');
      return;
    }
    members.splice(idx, 1);
    await setMembers(members);
    await sendMessage(chatId, `🗑️ Member Removed\n\n${name} removed\nRemaining: ${members.length}`);
    return;
  }
  
  if (text === '/summary') {
    const expenses = await getExpenses();
    if (Object.keys(budgets).length === 0) {
      await sendMessage(chatId, '📊 No categories configured');
      return;
    }
    
    let reply = '📊 Budget Summary\n\n';
    let totalSpent = 0, totalBudget = 0;
    
    for (const [cat, limit] of Object.entries(budgets)) {
      const spent = expenses.filter(e => e.category === cat && !e.discarded).reduce((s, e) => s + e.amount, 0);
      const pct = limit ? Math.round((spent / limit) * 100) : 0;
      totalSpent += spent;
      totalBudget += limit;
      const emoji = pct >= 100 ? '🔴' : pct >= 80 ? '🟡' : '🟢';
      reply += `${emoji} ${cat}\n   ₹${spent} / ₹${limit} (${pct}%)\n\n`;
    }
    
    const overallPct = totalBudget ? Math.round((totalSpent / totalBudget) * 100) : 0;
    reply += `Overall: ₹${totalSpent} / ₹${totalBudget} (${overallPct}%)`;
    await sendMessage(chatId, reply);
    return;
  }
  
  if (text === '/owe') {
    const expenses = await getExpenses();
    const lastSettledDate = await getLastSettledDate();
    
    const valid = expenses.filter(e => {
      if (e.discarded) return false;
      if (!lastSettledDate) return true;
      return new Date(e.ts) > new Date(lastSettledDate);
    });
    
    const spenders = [...new Set(valid.map(e => e.user))];
    const users = members.length > 0 ? members : spenders;
    
    if (users.length === 0 || valid.length === 0) {
      await sendMessage(chatId, `✨ All Clear!\n\nNo unsettled expenses.\n\n📅 Last settled: ${formatDate(lastSettledDate)}`);
      return;
    }
    
    const total = valid.reduce((s, e) => s + e.amount, 0);
    const share = total / users.length;
    
    const spent = {};
    users.forEach(u => spent[u] = 0);
    valid.forEach(e => spent[e.user] = (spent[e.user] || 0) + e.amount);
    
    const balances = {};
    for (const u of users) balances[u] = spent[u] - share;
    
    const debtors = Object.entries(balances).filter(([u, bal]) => bal < 0).map(([u, bal]) => ({ user: u, amount: -bal })).sort((a, b) => b.amount - a.amount);
    const creditors = Object.entries(balances).filter(([u, bal]) => bal > 0).map(([u, bal]) => ({ user: u, amount: bal })).sort((a, b) => b.amount - a.amount);
    
    if (debtors.length === 0) {
      await sendMessage(chatId, `✨ All Clear!\n\nEveryone paid their share!\n\n📅 Last settled: ${formatDate(lastSettledDate)}`);
      return;
    }
    
    let reply = '💸 Settlement Summary\n\n';
    reply += `Total: ₹${total.toFixed(2)}\nPer Person: ₹${share.toFixed(2)}\n\n`;
    reply += 'Individual Spending:\n';
    
    for (const u of users) {
      const diff = spent[u] - share;
      if (diff > 0) reply += `  • ${u}: ₹${spent[u].toFixed(2)} (+₹${diff.toFixed(2)})\n`;
      else if (diff < 0) reply += `  • ${u}: ₹${spent[u].toFixed(2)} (-₹${(-diff).toFixed(2)})\n`;
      else reply += `  • ${u}: ₹${spent[u].toFixed(2)} ✅\n`;
    }
    
    reply += '\nPayments:\n';
    let dc = [...debtors], cc = [...creditors];
    while (dc.length > 0 && cc.length > 0) {
      const d = dc[0], c = cc[0];
      const payment = Math.min(d.amount, c.amount);
      reply += `  → ${d.user} pays ₹${payment.toFixed(2)} to ${c.user}\n`;
      d.amount -= payment;
      c.amount -= payment;
      if (d.amount < 0.01) dc.shift();
      if (c.amount < 0.01) cc.shift();
    }
    
    reply += `\n📅 Last settled: ${formatDate(lastSettledDate)}`;
    await sendMessage(chatId, reply);
    return;
  }
  
  if (text === '/settled') {
    const expenses = await getExpenses();
    const lastSettledDate = await getLastSettledDate();
    const settlements = await getSettlements();
    
    const valid = expenses.filter(e => {
      if (e.discarded) return false;
      if (!lastSettledDate) return true;
      return new Date(e.ts) > new Date(lastSettledDate);
    });
    
    const users = members.length > 0 ? members : [...new Set(valid.map(e => e.user))];
    
    if (users.length === 0) {
      await sendMessage(chatId, '⚠️ No active expenses to settle');
      return;
    }
    
    settlements[user] = true;
    await setSettlements(settlements);
    
    if (users.every(u => settlements[u])) {
      await setLastSettledDate(now());
      await setSettlements({});
      await sendMessage(chatId, `🎉 Everyone Settled!\n\nAll balances cleared.\nExpense history preserved.\n\n📅 Settled on: ${formatDate(now())}`);
    } else {
      const settled = Object.keys(settlements).filter(u => settlements[u]);
      const pending = users.filter(u => !settlements[u]);
      await sendMessage(chatId, `☑️ Marked as Settled\n\n${user} is settled.\n\n✅ Settled: ${settled.join(', ')}\n⏳ Pending: ${pending.join(', ')}`);
    }
    return;
  }
  
  // Parse expense
  const amounts = text.match(/\d+/g);
  if (!amounts) return;
  
  const words = text.toLowerCase().match(/\b[a-z]+\b/g) || [];
  const categories = words.filter(w => budgets[w]);
  
  if (!amounts.length || !categories.length) return;
  
  // Auto-add member
  if (!members.includes(user)) {
    members.push(user);
    await setMembers(members);
  }
  
  const expenses = await getExpenses();
  let pairs = [];
  
  if (amounts.length > 1 && categories.length === 1) {
    amounts.forEach(a => pairs.push({ amount: Number(a), category: categories[0] }));
  } else if (amounts.length === 1 && categories.length > 1) {
    pairs.push({ amount: Number(amounts[0]), category: categories[0] });
  } else {
    for (let i = 0; i < Math.min(amounts.length, categories.length); i++) {
      pairs.push({ amount: Number(amounts[i]), category: categories[i] });
    }
  }
  
  let confirm = [];
  let totalAdded = 0;
  
  for (const p of pairs) {
    totalAdded += p.amount;
    expenses.push({
      id: messageId,
      user,
      amount: p.amount,
      category: p.category,
      comment: text,
      ts: now(),
      discarded: false
    });
    
    const futureSpent = expenses.filter(e => e.category === p.category && !e.discarded).reduce((s, e) => s + e.amount, 0);
    const budget = budgets[p.category];
    const pct = Math.round((futureSpent / budget) * 100);
    const emoji = pct >= 100 ? '🔴' : pct >= 80 ? '🟡' : '🟢';
    
    confirm.push(`${emoji} ${p.category}: ₹${p.amount}\n   ${pct}% of ₹${budget} budget used`);
  }
  
  await setExpenses(expenses);
  await sendMessage(chatId, `✅ Expense Recorded\n\n👤 ${user}\n💰 Total: ₹${totalAdded}\n\n${confirm.join('\n\n')}\n\nReply /revert to undo`, messageId);
}

// ================= WEBHOOK HANDLER =================
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true });
  }
  
  try {
    const update = req.body;
    const msg = update.message || update.edited_message;
    
    if (!msg || !msg.text) {
      return res.status(200).json({ ok: true });
    }
    
    const chatId = msg.chat.id;
    const user = msg.from.first_name;
    const text = msg.text.trim();
    const messageId = msg.message_id;
    
    // Process command asynchronously
    handleCommand(chatId, user, text, messageId).catch(err => console.error(err));
    
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return res.status(200).json({ ok: true });
  }
}
