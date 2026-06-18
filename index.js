require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { qualifyLead } = require('./qualifier');
const { sendSlackAlert } = require('./slack');
const { addChat, getTodaysLeads, buildDailySummary, startDailyCron } = require('./dailySummary');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('MYL Lead Qualifier Bot is running.');
});

async function getSmartReply(userMsg, chats) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) return null;
  const active = chats.filter(c => c.status === 'active');
  const missed = chats.filter(c => c.status === 'missed');
  const closed = chats.filter(c => c.status === 'closed');
  const leads = chats.filter(c => c.is_lead === true);
  const hot = leads.filter(l => l.urgency === 'hot');
  const warm = leads.filter(l => l.urgency === 'warm');
  const chatData = {
    total: chats.length,
    active: active.length,
    missed: missed.length,
    closed: closed.length,
    totalLeads: leads.length,
    hotLeads: hot.length,
    warmLeads: warm.length,
    potentialClients: leads.map(l => ({ name: l.visitor_name, email: l.visitor_email || 'not provided', phone: l.visitor_phone || 'not provided', service: l.service, urgency: l.urgency, intent: l.intent_summary, action: l.suggested_action })),
    missedVisitors: missed.map(m => ({ name: m.visitor_name, email: m.visitor_email || 'not provided', time: m.timestamp })),
    activeVisitors: active.map(a => ({ name: a.visitor_name, time: a.timestamp }))
  };
  const systemPrompt = 'You are a smart sales assistant bot named MYL Bot for MakeYourLabel, a custom label/packaging company. Help the sales team track website chat visitors and potential clients. Respond naturally and conversationally in a friendly, smart tone - like a helpful human colleague, not a robot. Be concise but informative. Use Slack markdown (*bold*, _italic_, bullet points). When someone asks about leads or updates, give clear actionable info. When listing potential clients, include their name, what they want, and recommended next action. Today chat data: ' + JSON.stringify(chatData);
  try {
    const resp = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }],
      max_tokens: 600,
      temperature: 0.7
    }, { headers: { 'Authorization': 'Bearer ' + OPENAI_API_KEY, 'Content-Type': 'application/json' } });
    return resp.data.choices[0].message.content.trim();
  } catch(e) {
    console.error('[SmartReply] OpenAI error:', e.message);
    return null;
  }
}

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    console.log('[Webhook] Received event:', body.event_type || body.chat_event_type || 'unknown', JSON.stringify(body).substring(0, 300));
    const eventType = body.event_type || body.chat_event_type || '';
    let chatStatus = 'unknown';
    if (eventType.includes('created')) chatStatus = 'active';
    else if (eventType.includes('missed')) chatStatus = 'missed';
    else if (eventType.includes('completed')) chatStatus = 'closed';
    const visitorName = (body.visitor && body.visitor.name) ? body.visitor.name : (body.visitor_name || 'Unknown Visitor');
    const visitorEmail = (body.visitor && body.visitor.email) ? body.visitor.email : (body.visitor_email || '');
    const visitorPhone = (body.visitor && body.visitor.phone) ? body.visitor.phone : (body.visitor_phone || '');
    const chatId = (body.conversation && body.conversation.id) ? body.conversation.id : (body.chat_id || body.id || '');
    const startTime = (body.conversation && body.conversation.started_time) ? body.conversation.started_time : (body.start_time || new Date().toISOString());
    if (chatStatus === 'active') {
      addChat({ chatId, visitor_name: visitorName, visitor_email: visitorEmail, visitor_phone: visitorPhone, status: 'active', is_lead: false, service: 'unknown', urgency: 'unknown', intent_summary: 'Chat just started', suggested_action: 'Monitor conversation', start_time: startTime });
      return res.status(200).json({ success: true, status: 'active' });
    }
    if (chatStatus === 'missed') {
      addChat({ chatId, visitor_name: visitorName, visitor_email: visitorEmail, visitor_phone: visitorPhone, status: 'missed', is_lead: false, service: 'unknown', urgency: 'cold', intent_summary: 'Visitor left without being served', suggested_action: 'Follow up with visitor ASAP', start_time: startTime });
      return res.status(200).json({ success: true, status: 'missed' });
    }
    const transcript = body.transcript || body.chat_transcript || body.message || '';
    if (!transcript) {
      addChat({ chatId, visitor_name: visitorName, visitor_email: visitorEmail, visitor_phone: visitorPhone, status: 'closed', is_lead: false, service: 'none', urgency: 'cold', intent_summary: 'No transcript available', suggested_action: 'Check SalesIQ for details', start_time: startTime });
      return res.status(200).json({ success: true, status: 'closed', note: 'no transcript' });
    }
    const result = await qualifyLead(transcript);
    addChat({ chatId, visitor_name: visitorName, visitor_email: visitorEmail, visitor_phone: visitorPhone, status: 'closed', is_lead: result.is_lead, service: result.service || 'none', urgency: result.urgency || 'cold', intent_summary: result.intent_summary || '', suggested_action: result.suggested_action || '', start_time: startTime });
    if (result.is_lead) { await sendSlackAlert({ ...result, visitor_name: visitorName }); }
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
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/slack/events', async (req, res) => {
  try {
    const body = req.body;
    if (body.type === 'url_verification') { return res.status(200).json({ challenge: body.challenge }); }
    if (body.type === 'event_callback') {
      const event = body.event;
      if (event && event.type === 'app_mention') {
        const userMessage = event.text.replace(/<@[^>]+>/g, '').trim();
        const channel = event.channel;
        const user = event.user;
        console.log('[Slack Events] Mention from', user, ':', userMessage);
        res.status(200).send();
        const botToken = process.env.SLACK_BOT_TOKEN;
        if (!botToken) { console.error('[Slack Events] SLACK_BOT_TOKEN not set'); return; }
        const chats = getTodaysLeads();
        let replyText = '';
        const smartReply = await getSmartReply(userMessage || 'give me today update', chats);
        if (smartReply) {
          replyText = smartReply;
        } else {
          const summary = buildDailySummary();
          replyText = summary.text;
        }
        try {
          await axios.post('https://slack.com/api/chat.postMessage', {
            channel: channel,
            text: replyText,
            thread_ts: event.thread_ts || event.ts
          }, { headers: { 'Authorization': 'Bearer ' + botToken, 'Content-Type': 'application/json' } });
        } catch (e) { console.error('[Slack Events] Reply failed:', e.message); }
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
