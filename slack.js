const axios = require('axios');
require('dotenv').config();

const URGENCY_EMOJI = { hot: '🔥', warm: '🌤️', cold: '🧊' };

async function sendSlackAlert(data) {
  const { service, intent_summary, urgency, suggested_action, visitor_name } = data;
  const emoji = URGENCY_EMOJI[urgency] || '❓';
  const label = urgency ? urgency.toUpperCase() : 'UNKNOWN';
  const visitorName = visitor_name || 'Unknown Visitor';

  const message = {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: emoji + ' New Lead Detected — ' + service, emoji: true }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: '*👤 Visitor:*\n' + visitorName },
          { type: 'mrkdwn', text: '*🎯 Service:*\n' + (service === 'MYL' ? 'MYL Onboarding' : 'Retell AI') }
        ]
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '*📋 Intent:*\n' + intent_summary }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: '*🌡️ Urgency:*\n' + emoji + ' ' + label },
          { type: 'mrkdwn', text: '*✅ Action:*\n' + suggested_action }
        ]
      },
      { type: 'divider' },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: '_via SalesIQ Chat Qualifier Bot_' }]
      }
    ]
  };

  try {
    await axios.post(process.env.SLACK_WEBHOOK_URL, message);
    console.log('Slack alert sent successfully for visitor:', visitorName);
  } catch (err) {
    console.error('Slack error:', err.message);
    throw err;
  }
}

module.exports = { sendSlackAlert };
