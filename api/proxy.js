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

  try {
    const body     = await req.json();
    const apiKey   = String(body.apiKey   || '');
    const folderId = String(body.folderId || '');
    const query    = String(body.query    || '');

    if (!apiKey || !folderId || !query) {
      return new Response(JSON.stringify({ error: 'Missing: apiKey, folderId, query' }), { status: 400, headers: cors });
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
        model: 'gpt://' + folderId + '/yandexgpt',
        input: 'I am looking for electronics in UAE. ' + query + '. Please search online and give me specific product recommendations available in UAE, including product names, prices in AED, and where to buy them.',
        tools: [{ type: 'web_search' }],
        temperature: 0.3,
        max_output_tokens: 1500
      })
    });

    const raw = await yandexRes.text();
    let data;
    try { data = JSON.parse(raw); }
    catch(e) { data = { parseError: e.message, rawResponse: raw.substring(0, 800) }; }

    if (!yandexRes.ok) {
      return new Response(JSON.stringify({
        error: 'Yandex error ' + yandexRes.status,
        detail: data
      }), { status: yandexRes.status, headers: cors });
    }

    // Extract answer
    let answer = 'No results found.';
    if (data.output_text) {
      answer = data.output_text;
    } else if (data.output) {
      const msgBlock = data.output.find(function(o) { return o.type === 'message'; });
      if (msgBlock && msgBlock.content) {
        const textBlock = msgBlock.content.find(function(c) { return c.type === 'output_text' || c.type === 'text'; });
        if (textBlock) answer = textBlock.text;
      }
    }

    return new Response(JSON.stringify({ answer: answer }), { status: 200, headers: cors });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
