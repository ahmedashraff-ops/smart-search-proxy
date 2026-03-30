// Node.js runtime (not Edge) — allows up to 60s on Hobby plan
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')   { res.status(405).json({ error: 'Method not allowed' }); return; }

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 55000);

  try {
    const { apiKey = '', folderId = '', promptId = '', query = '' } = req.body;

    if (!apiKey || !folderId || !promptId || !query) {
      clearTimeout(timeoutId);
      res.status(400).json({ error: 'Missing: apiKey, folderId, promptId, query' });
      return;
    }

    const auth = apiKey.startsWith('t1.') ? 'Bearer ' + apiKey : 'Api-Key ' + apiKey;

    const yandexRes = await fetch('https://ai.api.cloud.yandex.net/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': auth,
        'x-folder-id':   folderId
      },
      body: JSON.stringify({
        prompt: { id: promptId },
        input:  query
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const raw = await yandexRes.text();
    let data;
    try { data = JSON.parse(raw); }
    catch(e) { data = { parseError: e.message, rawResponse: raw.substring(0, 800) }; }

    if (!yandexRes.ok) {
      res.status(yandexRes.status).json({ error: 'Yandex error ' + yandexRes.status, detail: data });
      return;
    }

    // Extract answer text — handle both response shapes
    let answer = '';
    if (data.output_text) {
      answer = data.output_text;
    } else if (data.output) {
      const msgBlock = data.output.find(o => o.type === 'message');
      if (msgBlock?.content) {
        const textBlock = msgBlock.content.find(c => c.type === 'output_text' || c.type === 'text');
        if (textBlock) answer = textBlock.text;
      }
    }

    // Strip markdown fences if the agent added them
    let clean = answer.trim();
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```[a-z]*\n?/, '').replace(/```\s*$/, '').trim();
    }

    res.status(200).json({ answer: clean });

  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = err.name === 'AbortError';
    res.status(isTimeout ? 504 : 500).json({
      error: isTimeout
        ? 'Request timed out — Yandex took too long. Please try again.'
        : err.message
    });
  }
}
