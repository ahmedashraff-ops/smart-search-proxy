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
    const { apiKey, folderId, model, messages, temperature, max_tokens } = body;

    if (!apiKey || !folderId || !model || !messages) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), {
        status: 400, headers: corsHeaders
      });
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
        model,
        messages,
        temperature: temperature || 0.1,
        max_tokens: max_tokens || 800
      })
    });

    const data = await yandexRes.json();
    return new Response(JSON.stringify(data), {
      status: yandexRes.status, headers: corsHeaders
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: corsHeaders
    });
  }
}
