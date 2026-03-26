export const config = { runtime: 'edge' };

export default async function handler(req) {

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: corsHeaders
    });
  }

  try {
    const body = await req.json();

    // Force strings — Edge Runtime can minify variable names causing type errors
    const apiKey   = String(body.apiKey   || '');
    const folderId = String(body.folderId || '');
    const model    = String(body.model    || '');
    const messages = body.messages;

    if (!apiKey || !folderId || !model || !messages) {
      return new Response(JSON.stringify({
        error: 'Missing fields',
        received: Object.keys(body)
      }), { status: 400, headers: corsHeaders });
    }

    const auth = apiKey.startsWith('t1.')
      ? 'Bearer ' + apiKey
      : 'Api-Key ' + apiKey;

    const yandexRes = await fetch('https://llm.api.cloud.yandex.net/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': auth,
        'x-folder-id': folderId
      },
      body: JSON.stringify({
        model:       model,
        messages:    messages,
        temperature: body.temperature  || 0.1,
        max_tokens:  body.max_tokens   || 800
      })
    });

    const data = await yandexRes.json();
    return new Response(JSON.stringify(data), {
      status: yandexRes.status, headers: corsHeaders
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500, headers: corsHeaders
    });
  }
}
