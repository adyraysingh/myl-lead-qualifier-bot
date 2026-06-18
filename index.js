require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { qualifyLead } = require('./qualifier');
const { sendSlackAlert } = require('./slack');
const { addLead, startDailyCron } = require('./dailySummary');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('MYL Lead Qualifier Bot is running.');
});

// Main webhook endpoint - triggered by Zoho SalesIQ
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

// Endpoint to post a direct message to the daily Slack channel
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

// Start the daily cron job for summary
startDailyCron();

app.listen(PORT, () => {
  console.log(`MYL Lead Qualifier Bot running on port ${PORT}`);
});
