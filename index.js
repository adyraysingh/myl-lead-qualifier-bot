require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { qualifyLead } = require('./qualifier');
const { sendSlackAlert } = require('./slack');
const { addLead, getTodaysLeads, buildDailySummary, startDailyCron } = require('./dailySummary');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('MYL Lead Qualifier Bot is running.');
});

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    console.log('[Webhook] Received:', JSON.stringify(body).substring(0, 200));
    const transcript = body.transcript || body.chat_transcript || body.message || JSON.stringify(body);
    const visitorName = body.visitor?.name || body.visitor_name || 'Unknown Visitor';
    const result = await qualifyLead(transcript);
    console.log('[Qualifier] Result:', JSON.stringify(result));
    if (result.is_lead) {
      await sendSlackAlert({ ...result, visitor_name: visitorName });
      addLead({ ...result, visitor_name: visitorName });
      console.log('[Bot] Lead detected and alert sent for:', visitorName);
    } else {
      console.log('[Bot] Not a lead:', visitorName);
    }
    res.status(200).json({ success: true, result });
  } catch (err) {
    console.error('[Webhook] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/notify-slack', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });
    const webhook = process.env.SLACK_DAILY_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;
    await axios.post(webhook, { text: message });
    console.log('[Notify] Sent direct Slack message.');
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('[Notify] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/slack/events', async (req, res) => {
  try {
    const body = req.body;

    // URL verification challenge
    if (body.type === 'url_verification') {
      console.log('[Slack Events] URL verification received');
      return res.status(200).json({ challenge: body.challenge });
    }

    if (body.type === 'event_callback') {
      const event = body.event;
      if (event && event.type === 'app_mention') {
        // Strip the @mention tag to get the actual message
        const userMessage = event.text.replace(/<@[^>]+>/g, '').trim();
        const channel = event.channel;
        const user = event.user;
        console.log('[Slack Events] Mention from', user, 'in', channel, ':', userMessage);

        // Respond immediately with 200 so Slack does not retry
        res.status(200).send();

        const botToken = process.env.SLACK_BOT_TOKEN;
        if (!botToken) {
          console.error('[Slack Events] SLACK_BOT_TOKEN not set');
          return;
        }

        let replyText;
        const lowerMsg = userMessage.toLowerCase();

        if (lowerMsg === '' || lowerMsg.includes('help')) {
          replyText = 'Hi <@' + user + '>! Here is what I can do:\n' +
            'Send me a *chat transcript* to qualify a lead\n' +
            'Say *update* or *today* to see today lead count\n' +
            'Say *summary* for the full daily summary\n' +
            'Say *status* or *ping* to check if I am online';

        } else if (lowerMsg.includes('status') || lowerMsg.includes('ping') || lowerMsg.includes('alive') || lowerMsg.includes('online')) {
          const leads = getTodaysLeads();
          replyText = 'I am online and running! 🟢 ' + leads.length + ' lead(s) detected so far today.';

        } else if (
          lowerMsg.includes('update') ||
          lowerMsg.includes('today') ||
          lowerMsg.includes('leads') ||
          lowerMsg.includes('any') ||
          lowerMsg.includes('summary') ||
          lowerMsg.includes('report') ||
          lowerMsg.includes('count') ||
          lowerMsg.includes('how many')
        ) {
          const payload = buildDailySummary();
          replyText = payload.text;

        } else {
          try {
            const result = await qualifyLead(userMessage);
            if (result.is_lead) {
              replyText = 'Lead Qualified! Service: ' + result.service + ' | Urgency: ' + (result.urgency || '').toUpperCase() + ' | Intent: ' + result.intent_summary + ' | Action: ' + result.suggested_action;
            } else {
              replyText = 'This does not look like a lead transcript. Say *update* to check today leads, or *help* for all commands.';
            }
          } catch (e) {
            replyText = 'Error processing your request. Try again or say *help*.';
          }
        }

        try {
          await axios.post('https://slack.com/api/chat.postMessage', {
            channel: channel,
            text: replyText,
            thread_ts: event.thread_ts || event.ts
          }, {
            headers: {
              'Authorization': 'Bearer ' + botToken,
              'Content-Type': 'application/json'
            }
          });
        } catch (e) {
          console.error('[Slack Events] Reply failed:', e.message);
        }
        return;
      }
    }

    res.status(200).send();
  } catch (err) {
    console.error('[Slack Events] Error:', err.message);
    res.status(200).send();
  }
});

startDailyCron();

app.listen(PORT, () => {
  console.log('MYL Lead Qualifier Bot running on port ' + PORT);
});
