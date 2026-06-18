const OpenAI = require('openai');
require('dotenv').config();

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = 'You are a lead qualifier for two services: 1. MYL (MakeYourLabel) - fashion brand launch & manufacturing. Flag if visitor mentions: clothing brand, launch, pre-order, manufacturing, MOQ, samples, tech pack, Meta ads for fashion. 2. Retell AI - AI outbound calling. Flag if visitor mentions: AI calling, sales automation, outbound calls, voicemail, lead follow-up via phone. Return JSON only with these exact keys: is_lead (boolean), service (string: MYL or RetellAI or none), intent_summary (string), urgency (string: hot or warm or cold), suggested_action (string)';

async function qualifyLead(transcript) {
  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: 'Chat transcript: ' + transcript }
      ],
      response_format: { type: 'json_object' }
    });
    return JSON.parse(response.choices[0].message.content);
  } catch (err) {
    console.error('OpenAI error:', err.message);
    throw err;
  }
}

module.exports = { qualifyLead };
