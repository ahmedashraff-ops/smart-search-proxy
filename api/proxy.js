const https = require('https');

module.exports = async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { apiKey, folderId, model, messages, temperature, max_tokens } = req.body;

    if (!apiKey || !folderId || !model || !messages) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const authHeader = apiKey.startsWith('t1.')
      ? `Bearer ${apiKey}`
      : `Api-Key ${apiKey}`;

    const payload = JSON.stringify({
      model,
      messages,
      temperature: temperature ?? 0.1,
      max_tokens: max_tokens ?? 1000,
    });

    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'llm.api.cloud.yandex.net',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
          'x-folder-id': folderId,
          'Content-Length': Buffer.byteLength(payload),
        },
      };

      const reqYandex = https.request(options, (yRes) => {
        let data = '';
        yRes.on('data', chunk => data += chunk);
        yRes.on('end', () => resolve({ status: yRes.statusCode, body: data }));
      });

      reqYandex.on('error', reject);
      reqYandex.write(payload);
      reqYandex.end();
    });

    const parsed = JSON.parse(result.body);
    return res.status(result.status).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: `Proxy error: ${err.message}` });
  }
}
