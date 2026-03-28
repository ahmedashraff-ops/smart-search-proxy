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
    const agentId  = String(body.agentId  || '');
    const query    = String(body.query    || '');

    if (!apiKey || !folderId || !agentId || !query) {
      return new Response(JSON.stringify({ error: 'Missing: apiKey, folderId, agentId, query' }), { status: 400, headers: cors });
    }

    const auth = apiKey.startsWith('t1.') ? 'Bearer ' + apiKey : 'Api-Key ' + apiKey;

    // Agent Atelier agents use the Responses API, not chat/completions
    // The agent ID is passed directly as the model
    const yandexRes = await fetch('https://llm.api.cloud.yandex.net/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': auth,
        'x-folder-id': folderId
      },
      body: JSON.stringify({
        model: agentId,
        input: query,
        max_output_tokens: 2000
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

    // Responses API returns output as an array of content blocks
    let answer = 'No response from agent.';
    if (data.output) {
      // output is an array — find the message block with text
      const msgBlock = data.output.find(function(o) { return o.type === 'message'; });
      if (msgBlock && msgBlock.content) {
        const textBlock = msgBlock.content.find(function(c) { return c.type === 'output_text'; });
        if (textBlock) answer = textBlock.text;
      }
    } else if (data.choices) {
      // Fallback: sometimes returns chat completions format
      answer = data.choices[0]?.message?.content || answer;
    }

    return new Response(JSON.stringify({ answer: answer }), { status: 200, headers: cors });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
