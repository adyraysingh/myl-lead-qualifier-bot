const axios = require('axios');
const cron = require('node-cron');

const DAILY_SLACK_WEBHOOK = process.env.SLACK_DAILY_WEBHOOK_URL;

let todaysChats = [];

function addChat(chat) {
  if (chat.chatId) {
    const idx = todaysChats.findIndex(c => c.chatId === chat.chatId);
    if (idx >= 0) {
      todaysChats[idx] = { ...todaysChats[idx], ...chat, timestamp: new Date().toISOString() };
      return;
    }
  }
  todaysChats.push({ timestamp: new Date().toISOString(), ...chat });
}

function addLead(lead) { addChat({ ...lead, status: 'closed' }); }

function getTodaysLeads() { return todaysChats; }

function buildDailySummary() {
  const now = new Date();
  const today = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
  if (todaysChats.length === 0) {
    return { text: '📊 *Daily Chat Report — ' + today + '*
_As of ' + timeStr + ' IST_

No chats recorded today yet.' };
  }
  const activeChats = todaysChats.filter(c => c.status === 'active');
  const missedChats = todaysChats.filter(c => c.status === 'missed');
  const closedChats = todaysChats.filter(c => c.status === 'closed');
  const qualifiedLeads = todaysChats.filter(c => c.is_lead === true);
  const hotLeads = qualifiedLeads.filter(l => l.urgency === 'hot');
  const warmLeads = qualifiedLeads.filter(l => l.urgency === 'warm');
  const coldLeads = qualifiedLeads.filter(l => l.urgency === 'cold');
  let s = '📊 *Daily Chat Report — ' + today + '*
_As of ' + timeStr + ' IST_

';
  s += '*Overview:* ' + todaysChats.length + ' total chats
';
  s += '🟡 Active: ' + activeChats.length + ' | ❌ Missed: ' + missedChats.length + ' | ✅ Closed: ' + closedChats.length + ' | 🎯 Leads: ' + qualifiedLeads.length + '
';
  if (qualifiedLeads.length > 0) s += '🔥 Hot: ' + hotLeads.length + ' | 🌤 Warm: ' + warmLeads.length + ' | ❄️ Cold: ' + coldLeads.length + '
';
  s += '
';
  if (activeChats.length > 0) {
    s += '*🟡 Active Chats (' + activeChats.length + '):*
';
    activeChats.forEach((c, i) => {
      const t = new Date(c.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
      s += (i+1) + '. ' + (c.visitor_name||'Unknown') + (c.visitor_email ? ' ('+c.visitor_email+')' : '') + ' @ ' + t + ' — _ongoing_
';
    });
    s += '
';
  }
  if (missedChats.length > 0) {
    s += '*❌ Missed Chats (' + missedChats.length + '):*
';
    missedChats.forEach((c, i) => {
      const t = new Date(c.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
      s += (i+1) + '. ' + (c.visitor_name||'Unknown') + (c.visitor_email ? ' ('+c.visitor_email+')' : '') + ' @ ' + t + ' — ⚠️ _follow up needed_
';
    });
    s += '
';
  }
  if (closedChats.length > 0) {
    s += '*✅ Closed Chats (' + closedChats.length + '):*
';
    closedChats.forEach((c, i) => {
      const t = new Date(c.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
      const badge = c.is_lead ? '🎯' : '💬';
      const ue = c.urgency === 'hot' ? '🔥' : c.urgency === 'warm' ? '🌤' : c.urgency === 'cold' ? '❄️' : '';
      s += (i+1) + '. ' + badge + ' ' + (c.visitor_name||'Unknown') + (c.visitor_email ? ' ('+c.visitor_email+')' : '') + ' @ ' + t + '
';
      if (c.is_lead) s += '   ' + ue + ' [' + c.service + '] ' + c.intent_summary + '
   → ' + c.suggested_action + '
';
      else if (c.intent_summary && c.intent_summary !== 'No transcript available') s += '   _' + c.intent_summary + '_
';
    });
    s += '
';
  }
  if (qualifiedLeads.length > 0) {
    s += '*🎯 Potential Clients Today (' + qualifiedLeads.length + '):*
';
    qualifiedLeads.forEach((l, i) => {
      const ue = l.urgency === 'hot' ? '🔥' : l.urgency === 'warm' ? '🌤' : '❄️';
      const t = new Date(l.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
      s += (i+1) + '. ' + ue + ' *' + (l.visitor_name||'Unknown') + '*' + (l.visitor_email ? ' — '+l.visitor_email : '') + (l.visitor_phone ? ' | '+l.visitor_phone : '') + ' @ ' + t + '
';
      s += '   [' + l.service + '] ' + l.intent_summary + '
   → ' + l.suggested_action + '
';
    });
  } else {
    s += '_No qualified leads yet today._
';
  }
  s += '
— MYL Lead Qualifier Bot';
  return { text: s };
}

async function sendDailySummary() {
  if (!DAILY_SLACK_WEBHOOK) { console.log('[DailySummary] No SLACK_DAILY_WEBHOOK_URL set, skipping.'); return; }
  const payload = buildDailySummary();
  try {
    await axios.post(DAILY_SLACK_WEBHOOK, payload);
    console.log('[DailySummary] Sent summary with ' + todaysChats.length + ' chats.');
    todaysChats = [];
  } catch (err) { console.error('[DailySummary] Failed to send:', err.message); }
}

function startDailyCron() {
  cron.schedule('30 12 * * *', () => { console.log('[DailySummary] Running...'); sendDailySummary(); }, { timezone: 'UTC' });
  console.log('[DailySummary] Daily summary cron scheduled for 6:00 PM IST');
}

module.exports = { addChat, addLead, getTodaysLeads, buildDailySummary, sendDailySummary, startDailyCron };
