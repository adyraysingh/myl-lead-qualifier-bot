require('dotenv').config();
const express = require('express');
const { qualifyLead } = require('./qualifier');
const { sendSlackAlert } = require('./slack');
const { addLead, startDailyCron } = require('./dailySummary');

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

    // Extract chat transcript from Zoho SalesIQ payload
    const transcript = body.transcript || body.chat_transcript || body.message || JSON.stringify(body);
    const visitorName = body.visitor?.name || body.visitor_name || 'Unknown Visitor';

    // Qualify the lead using OpenAI
    const result = await qualifyLead(transcript);
    console.log('[Qualifier] Result:', JSON.stringify(result));

    if (result.is_lead) {
      // Send immediate alert to #globolosys-b2b-360-leads-and-meeting
      await sendSlackAlert({ ...result, visitor_name: visitorName });
      // Add to daily summary tracker
      addLead({ ...result, visitor_name: visitorName });
      console.log('[Bot] Lead detected and alert sent.');
    } else {
      console.log('[Bot] Not a lead, skipping alert.');
    }

    res.status(200).json({ success: true, result });
  } catch (err) {
    console.error('[Webhook] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Start the daily cron job for summary
startDailyCron();

app.listen(PORT, () => {
  console.log(`MYL Lead Qualifier Bot running on port ${PORT}`);
});
