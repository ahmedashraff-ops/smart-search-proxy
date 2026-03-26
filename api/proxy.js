module.exports = async function handler(req, res) {

  // ── CORS headers — allow requests from any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // ── Handle browser preflight check
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { apiKey, folderId, model, messages, temperature, max_tokens } = req.body;

  if (!apiKey || !folderId || !model || !messages) {
    return res.status(400).json({ error: 'Missing required fields: apiKey, folderId, model, messages' });
  }

  // ── Yandex: API Keys (AQVN...) use "Api-Key", IAM tokens (t1...) use "Bearer"
  const authHeader = apiKey.startsWith('t1.')
    ? `Bearer ${apiKey}`
    : `Api-Key ${apiKey}`;

  try {
    const yandexRes = await fetch('https://llm.api.cloud.yandex.net/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'x-folder-id': folderId,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: temperature ?? 0.1,
        max_tokens: max_tokens ?? 1000,
      }),
    });

    const data = await yandexRes.json();

    if (!yandexRes.ok) {
      return res.status(yandexRes.status).json({
        error: data?.error?.message || data?.message || `Yandex API error ${yandexRes.status}`,
      });
    }

    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: `Proxy error: ${err.message}` });
  }
}
