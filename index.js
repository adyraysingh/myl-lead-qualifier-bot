const express = require('express');
const { qualifyLead } = require('./qualifier');
const { sendSlackAlert } = require('./slack');
require('dotenv').config();

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.send('MYL Lead Qualifier Bot is running.');
  });

  app.post('/webhook', async (req, res) => {
    console.log('Webhook received:', JSON.stringify(req.body, null, 2));
      try {
          const payload = req.body;
              const visitorName =
                    payload?.visitor?.name ||
                          payload?.chat?.visitor?.name ||
                                payload?.data?.visitor?.name ||
                                      'Unknown Visitor';
                                          let transcript = '';
                                              const messages =
                                                    payload?.chat?.messages ||
                                                          payload?.data?.chat?.messages ||
                                                                payload?.messages ||
                                                                      null;
                                                                          if (messages && Array.isArray(messages)) {
                                                                                transcript = messages
                                                                                        .map((m) => (m.sender || m.role || 'User') + ': ' + (m.text || m.message || ''))
                                                                                                .join('\n');
                                                                                                    } else {
                                                                                                          transcript =
                                                                                                                  payload?.chat?.transcript ||
                                                                                                                          payload?.data?.transcript ||
                                                                                                                                  payload?.transcript ||
                                                                                                                                          JSON.stringify(payload);
                                                                                                                                              }
                                                                                                                                                  if (!transcript || transcript.trim().length === 0) {
                                                                                                                                                        return res.status(200).json({ status: 'skipped', reason: 'empty transcript' });
                                                                                                                                                            }
                                                                                                                                                                const qualification = await qualifyLead(transcript);
                                                                                                                                                                    console.log('Qualification result:', qualification);
                                                                                                                                                                        if (qualification.is_lead && qualification.service !== 'none') {
                                                                                                                                                                              await sendSlackAlert(visitorName, qualification);
                                                                                                                                                                                    return res.status(200).json({ status: 'lead_detected', qualification });
                                                                                                                                                                                        } else {
                                                                                                                                                                                              return res.status(200).json({ status: 'not_a_lead', qualification });
                                                                                                                                                                                                  }
                                                                                                                                                                                                    } catch (err) {
                                                                                                                                                                                                        console.error('Error processing webhook:', err.message);
                                                                                                                                                                                                            return res.status(500).json({ status: 'error', message: err.message });
                                                                                                                                                                                                              }
                                                                                                                                                                                                              });
                                                                                                                                                                                                              
                                                                                                                                                                                                              const PORT = process.env.PORT || 3000;
                                                                                                                                                                                                              app.listen(PORT, () => {
                                                                                                                                                                                                                console.log('Lead Qualifier Bot listening on port ' + PORT);
                                                                                                                                                                                                                });
