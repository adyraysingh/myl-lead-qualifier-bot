const axios = require('axios');
const cron = require('node-cron');

const DAILY_SLACK_WEBHOOK = process.env.SLACK_DAILY_WEBHOOK_URL;

// In-memory store of today's leads
let todaysLeads = [];

function addLead(lead) {
  todaysLeads.push({
    timestamp: new Date().toISOString(),
    ...lead
  });
}

function getTodaysLeads() {
  return todaysLeads;
}

function buildDailySummary() {
  const today = new Date().toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  if (todaysLeads.length === 0) {
    return {
      text: `📊 *Daily Lead Summary — ${today}*

No leads detected today. Keep the conversations going!`
    };
  }

  const hotLeads = todaysLeads.filter(l => l.urgency === 'hot');
  const warmLeads = todaysLeads.filter(l => l.urgency === 'warm');
  const coldLeads = todaysLeads.filter(l => l.urgency === 'cold');

  const myl = todaysLeads.filter(l => l.service === 'MYL');
  const retell = todaysLeads.filter(l => l.service === 'RetellAI');

  let summary = `📊 *Daily Lead Summary — ${today}*

`;
  summary += `*Total Leads:* ${todaysLeads.length} | 🔥 Hot: ${hotLeads.length} | 🌤 Warm: ${warmLeads.length} | ❄️ Cold: ${coldLeads.length}
`;
  summary += `*By Service:* MYL: ${myl.length} | Retell AI: ${retell.length}

`;
  summary += `*Lead Breakdown:*
`;

  todaysLeads.forEach((lead, i) => {
    const urgencyEmoji = lead.urgency === 'hot' ? '🔥' : lead.urgency === 'warm' ? '🌤' : '❄️';
    const time = new Date(lead.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
    summary += `${i + 1}. ${urgencyEmoji} [${lead.service}] ${lead.visitor_name || 'Unknown Visitor'} @ ${time}
`;
    summary += ` _${lead.intent_summary}_
`;
    summary += ` → ${lead.suggested_action}

`;
  });

  summary += `— MYL Lead Qualifier Bot`;
  return { text: summary };
}

async function sendDailySummary() {
  if (!DAILY_SLACK_WEBHOOK) {
    console.log('[DailySummary] No SLACK_DAILY_WEBHOOK_URL set, skipping.');
    return;
  }
  const payload = buildDailySummary();
  try {
    await axios.post(DAILY_SLACK_WEBHOOK, payload);
    console.log(`[DailySummary] Sent summary with ${todaysLeads.length} leads.`);
    // Reset for next day
    todaysLeads = [];
  } catch (err) {
    console.error('[DailySummary] Failed to send:', err.message);
  }
}

// Schedule daily summary at 6:00 PM IST (12:30 UTC)
function startDailyCron() {
  cron.schedule('30 12 * * *', () => {
    console.log('[DailySummary] Running scheduled daily summary...');
    sendDailySummary();
  }, {
    timezone: 'UTC'
  });
  console.log('[DailySummary] Daily summary cron scheduled for 6:00 PM IST');
}

module.exports = { addLead, getTodaysLeads, buildDailySummary, sendDailySummary, startDailyCron };
