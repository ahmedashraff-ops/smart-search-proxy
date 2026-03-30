export const config = { runtime: 'edge' };

export default async function handler(req) {

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: cors });

  // ── TIMEOUT CONTROLLER (55s — safely under Vercel's 60s max) ────────────
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 55000);

  try {
    const body      = await req.json();
    const apiKey    = String(body.apiKey    || '');
    const folderId  = String(body.folderId  || '');
    const promptId  = String(body.promptId  || '');
    const query     = String(body.query     || '');

    if (!apiKey || !folderId || !promptId || !query) {
      clearTimeout(timeoutId);
      return new Response(
        JSON.stringify({ error: 'Missing: apiKey, folderId, promptId, query' }),
        { status: 400, headers: cors }
      );
    }

    const auth = apiKey.startsWith('t1.') ? 'Bearer ' + apiKey : 'Api-Key ' + apiKey;

    const yandexRes = await fetch('https://ai.api.cloud.yandex.net/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': auth,
        'x-folder-id': folderId
      },
      body: JSON.stringify({
        prompt: { id: promptId },
        input: query
      }),
      signal: controller.signal   // ← abort if Yandex takes too long
    });

    clearTimeout(timeoutId);      // ← Yandex responded in time, cancel the timer

    const raw = await yandexRes.text();
    let data;
    try { data = JSON.parse(raw); }
    catch(e) { data = { parseError: e.message, rawResponse: raw.substring(0, 800) }; }

    if (!yandexRes.ok) {
      return new Response(
        JSON.stringify({ error: 'Yandex error ' + yandexRes.status, detail: data }),
        { status: yandexRes.status, headers: cors }
      );
    }

    // Extract answer text — handle both response shapes
    let answer = '';
    if (data.output_text) {
      answer = data.output_text;
    } else if (data.output) {
      const msgBlock = data.output.find(o => o.type === 'message');
      if (msgBlock && msgBlock.content) {
        const textBlock = msgBlock.content.find(c => c.type === 'output_text' || c.type === 'text');
        if (textBlock) answer = textBlock.text;
      }
    }

    // Strip markdown fences if the agent added them
    let clean = answer.trim();
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```[a-z]*\n?/, '').replace(/```\s*$/, '').trim();
    }

    return new Response(JSON.stringify({ answer: clean }), { status: 200, headers: cors });

  } catch (err) {
    clearTimeout(timeoutId);
    // Return a clear timeout message instead of the generic "Failed to fetch"
    const isTimeout = err.name === 'AbortError';
    return new Response(
      JSON.stringify({ error: isTimeout ? 'Request timed out — Yandex took too long. Please try again.' : err.message }),
      { status: isTimeout ? 504 : 500, headers: cors }
    );
  }
}
