const axios = require('axios');
const cron = require('node-cron');

const DAILY_SLACK_WEBHOOK = process.env.SLACK_DAILY_WEBHOOK_URL;
let todaysChats = [];

function addChat(chat) {
  if (chat.chatId) {
    var idx = todaysChats.findIndex(function(c) { return c.chatId === chat.chatId; });
    if (idx >= 0) {
      todaysChats[idx] = Object.assign({}, todaysChats[idx], chat, { timestamp: new Date().toISOString() });
      return;
    }
  }
  todaysChats.push(Object.assign({ timestamp: new Date().toISOString() }, chat));
}

function addLead(lead) { addChat(Object.assign({}, lead, { status: 'closed' })); }
function getTodaysLeads() { return todaysChats; }

function buildDailySummary() {
  var now = new Date();
  var today = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  var timeStr = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
  var NL = '\n';
  if (todaysChats.length === 0) {
    return { text: '*Daily Chat Report -- ' + today + '*' + NL + '_As of ' + timeStr + ' IST_' + NL + NL + 'No chats recorded today yet.' };
  }
  var activeChats = todaysChats.filter(function(c) { return c.status === 'active'; });
  var missedChats = todaysChats.filter(function(c) { return c.status === 'missed'; });
  var closedChats = todaysChats.filter(function(c) { return c.status === 'closed'; });
  var qualifiedLeads = todaysChats.filter(function(c) { return c.is_lead === true; });
  var hotLeads = qualifiedLeads.filter(function(l) { return l.urgency === 'hot'; });
  var warmLeads = qualifiedLeads.filter(function(l) { return l.urgency === 'warm'; });
  var coldLeads = qualifiedLeads.filter(function(l) { return l.urgency === 'cold'; });
  var s = '*Daily Chat Report -- ' + today + '*' + NL;
  s += '_As of ' + timeStr + ' IST_' + NL + NL;
  s += '*Overview:* ' + todaysChats.length + ' total chats' + NL;
  s += 'Active: ' + activeChats.length + ' | Missed: ' + missedChats.length + ' | Closed: ' + closedChats.length + ' | Leads: ' + qualifiedLeads.length + NL;
  if (qualifiedLeads.length > 0) { s += 'Hot: ' + hotLeads.length + ' | Warm: ' + warmLeads.length + ' | Cold: ' + coldLeads.length + NL; }
  s += NL;
  if (activeChats.length > 0) {
    s += '*:yellow_circle: Active Chats (' + activeChats.length + '):*' + NL;
    activeChats.forEach(function(c, i) {
      var t = new Date(c.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
      s += (i+1) + '. ' + (c.visitor_name || 'Unknown') + (c.visitor_email ? ' (' + c.visitor_email + ')' : '') + ' @ ' + t + ' -- ongoing' + NL;
    });
    s += NL;
  }
  if (missedChats.length > 0) {
    s += '*:x: Missed Chats (' + missedChats.length + '):*' + NL;
    missedChats.forEach(function(c, i) {
      var t = new Date(c.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
      s += (i+1) + '. ' + (c.visitor_name || 'Unknown') + (c.visitor_email ? ' (' + c.visitor_email + ')' : '') + ' @ ' + t + ' -- follow up needed' + NL;
    });
    s += NL;
  }
  if (closedChats.length > 0) {
    s += '*:white_check_mark: Closed Chats (' + closedChats.length + '):*' + NL;
    closedChats.forEach(function(c, i) {
      var t = new Date(c.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
      var badge = c.is_lead ? '[LEAD]' : '[CHAT]';
      var urgLabel = c.urgency === 'hot' ? 'HOT' : c.urgency === 'warm' ? 'WARM' : c.urgency === 'cold' ? 'COLD' : '';
      s += (i+1) + '. ' + badge + ' ' + (c.visitor_name || 'Unknown') + (c.visitor_email ? ' (' + c.visitor_email + ')' : '') + ' @ ' + t + NL;
      if (c.is_lead) { s += '   ' + urgLabel + ' [' + c.service + '] ' + c.intent_summary + NL + '   -> ' + c.suggested_action + NL; }
      else if (c.intent_summary && c.intent_summary !== 'No transcript available') { s += '   _' + c.intent_summary + '_' + NL; }
    });
    s += NL;
  }
  if (qualifiedLeads.length > 0) {
    s += '*:dart: Potential Clients Today (' + qualifiedLeads.length + '):*' + NL;
    qualifiedLeads.forEach(function(l, i) {
      var urgLabel = l.urgency === 'hot' ? 'HOT' : l.urgency === 'warm' ? 'WARM' : 'COLD';
      var t = new Date(l.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
      s += (i+1) + '. [' + urgLabel + '] *' + (l.visitor_name || 'Unknown') + '*' + (l.visitor_email ? ' -- ' + l.visitor_email : '') + (l.visitor_phone ? ' | ' + l.visitor_phone : '') + ' @ ' + t + NL;
      s += '   [' + l.service + '] ' + l.intent_summary + NL + '   -> ' + l.suggested_action + NL;
    });
  } else {
    s += '_No qualified leads yet today._' + NL;
  }
  s += NL + '-- MYL Lead Qualifier Bot';
  return { text: s };
}

async function sendDailySummary() {
  if (!DAILY_SLACK_WEBHOOK) { console.log('[DailySummary] No SLACK_DAILY_WEBHOOK_URL set, skipping.'); return; }
  var payload = buildDailySummary();
  try {
    await axios.post(DAILY_SLACK_WEBHOOK, payload);
    console.log('[DailySummary] Sent summary with ' + todaysChats.length + ' chats.');
    todaysChats = [];
  } catch (err) { console.error('[DailySummary] Failed to send:', err.message); }
}

function startDailyCron() {
  cron.schedule('30 12 * * *', function() { console.log('[DailySummary] Running...'); sendDailySummary(); }, { timezone: 'UTC' });
  console.log('[DailySummary] Daily summary cron scheduled for 6:00 PM IST');
}

module.exports = { addChat: addChat, addLead: addLead, getTodaysLeads: getTodaysLeads, buildDailySummary: buildDailySummary, sendDailySummary: sendDailySummary, startDailyCron: startDailyCron };
