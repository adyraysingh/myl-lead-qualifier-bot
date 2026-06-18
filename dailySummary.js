const axios = require('axios');
const cron = require('node-cron');

const DAILY_SLACK_WEBHOOK = process.env.SLACK_DAILY_WEBHOOK_URL;

let todaysChats = [];

function addChat(chat) {
  if (chat.chatId) {
    const idx = todaysChats.findIndex(function(c) { return c.chatId === chat.chatId; });
    if (idx >= 0) {
      todaysChats[idx] = Object.assign({}, todaysChats[idx], chat, { timestamp: new Date().toISOString() });
      return;
    }
  }
  const entry = Object.assign({ timestamp: new Date().toISOString() }, chat);
  todaysChats.push(entry);
}

function addLead(lead) { addChat(Object.assign({}, lead, { status: 'closed' })); }

function getTodaysLeads() { return todaysChats; }

function buildDailySummary() {
  const now = new Date();
  const today = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });

  if (todaysChats.length === 0) {
    return { text: '[Report] *Daily Chat Report -- ' + today + '*
As of ' + timeStr + ' IST

No chats recorded today yet.' };
  }

  const activeChats = todaysChats.filter(function(c) { return c.status === 'active'; });
  const missedChats = todaysChats.filter(function(c) { return c.status === 'missed'; });
  const closedChats = todaysChats.filter(function(c) { return c.status === 'closed'; });
  const qualifiedLeads = todaysChats.filter(function(c) { return c.is_lead === true; });
  const hotLeads = qualifiedLeads.filter(function(l) { return l.urgency === 'hot'; });
  const warmLeads = qualifiedLeads.filter(function(l) { return l.urgency === 'warm'; });
  const coldLeads = qualifiedLeads.filter(function(l) { return l.urgency === 'cold'; });

  let s = '*Daily Chat Report -- ' + today + '*
';
  s += '_As of ' + timeStr + ' IST_

';
  s += '*Overview:* ' + todaysChats.length + ' total chats
';
  s += 'Active: ' + activeChats.length + ' | Missed: ' + missedChats.length + ' | Closed: ' + closedChats.length + ' | Leads: ' + qualifiedLeads.length + '
';
  if (qualifiedLeads.length > 0) {
    s += 'Hot: ' + hotLeads.length + ' | Warm: ' + warmLeads.length + ' | Cold: ' + coldLeads.length + '
';
  }
  s += '
';

  if (activeChats.length > 0) {
    s += '*:yellow_circle: Active Chats (' + activeChats.length + '):*
';
    activeChats.forEach(function(c, i) {
      const t = new Date(c.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
      s += (i + 1) + '. ' + (c.visitor_name || 'Unknown');
      if (c.visitor_email) s += ' (' + c.visitor_email + ')';
      s += ' @ ' + t + ' -- _ongoing_
';
    });
    s += '
';
  }

  if (missedChats.length > 0) {
    s += '*:x: Missed Chats (' + missedChats.length + '):*
';
    missedChats.forEach(function(c, i) {
      const t = new Date(c.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
      s += (i + 1) + '. ' + (c.visitor_name || 'Unknown');
      if (c.visitor_email) s += ' (' + c.visitor_email + ')';
      s += ' @ ' + t + ' -- follow up needed
';
    });
    s += '
';
  }

  if (closedChats.length > 0) {
    s += '*:white_check_mark: Closed Chats (' + closedChats.length + '):*
';
    closedChats.forEach(function(c, i) {
      const t = new Date(c.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
      const badge = c.is_lead ? '[LEAD]' : '[CHAT]';
      const urgLabel = c.urgency === 'hot' ? 'HOT' : c.urgency === 'warm' ? 'WARM' : c.urgency === 'cold' ? 'COLD' : '';
      s += (i + 1) + '. ' + badge + ' ' + (c.visitor_name || 'Unknown');
      if (c.visitor_email) s += ' (' + c.visitor_email + ')';
      s += ' @ ' + t + '
';
      if (c.is_lead) {
        s += '   ' + urgLabel + ' [' + c.service + '] ' + c.intent_summary + '
';
        s += '   -> ' + c.suggested_action + '
';
      } else if (c.intent_summary && c.intent_summary !== 'No transcript available') {
        s += '   _' + c.intent_summary + '_
';
      }
    });
    s += '
';
  }

  if (qualifiedLeads.length > 0) {
    s += '*:dart: Potential Clients Today (' + qualifiedLeads.length + '):*
';
    qualifiedLeads.forEach(function(l, i) {
      const urgLabel = l.urgency === 'hot' ? 'HOT' : l.urgency === 'warm' ? 'WARM' : 'COLD';
      const t = new Date(l.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
      s += (i + 1) + '. [' + urgLabel + '] *' + (l.visitor_name || 'Unknown') + '*';
      if (l.visitor_email) s += ' -- ' + l.visitor_email;
      if (l.visitor_phone) s += ' | ' + l.visitor_phone;
      s += ' @ ' + t + '
';
      s += '   [' + l.service + '] ' + l.intent_summary + '
';
      s += '   -> ' + l.suggested_action + '
';
    });
  } else {
    s += '_No qualified leads yet today._
';
  }

  s += '
-- MYL Lead Qualifier Bot';
  return { text: s };
}

async function sendDailySummary() {
  if (!DAILY_SLACK_WEBHOOK) {
    console.log('[DailySummary] No SLACK_DAILY_WEBHOOK_URL set, skipping.');
    return;
  }
  const payload = buildDailySummary();
  try {
    await axios.post(DAILY_SLACK_WEBHOOK, payload);
    console.log('[DailySummary] Sent summary with ' + todaysChats.length + ' chats.');
    todaysChats = [];
  } catch (err) {
    console.error('[DailySummary] Failed to send:', err.message);
  }
}

function startDailyCron() {
  cron.schedule('30 12 * * *', function() {
    console.log('[DailySummary] Running scheduled daily summary...');
    sendDailySummary();
  }, { timezone: 'UTC' });
  console.log('[DailySummary] Daily summary cron scheduled for 6:00 PM IST');
}

module.exports = { addChat: addChat, addLead: addLead, getTodaysLeads: getTodaysLeads, buildDailySummary: buildDailySummary, sendDailySummary: sendDailySummary, startDailyCron: startDailyCron };
