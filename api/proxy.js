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

    const auth     = apiKey.startsWith('t1.') ? 'Bearer ' + apiKey : 'Api-Key ' + apiKey;
    const modelURI = 'gpt://' + folderId + '/' + agentId + '/latest';

    // Call chat completions with the Agent Atelier model URI
    // The agent's knowledge base, web search and instructions are
    // automatically applied by Yandex when using the agent URI
    const yandexRes = await fetch('https://llm.api.cloud.yandex.net/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': auth,
        'x-folder-id': folderId
      },
      body: JSON.stringify({
        model: modelURI,
        messages: [{ role: 'user', content: query }],
        max_tokens: 2000,
        temperature: 0.3
      })
    });

    const raw = await yandexRes.text();
    let data;
    try { data = JSON.parse(raw); }
    catch(e) { data = { parseError: e.message, rawResponse: raw.substring(0, 500) }; }

    if (!yandexRes.ok) {
      return new Response(JSON.stringify({
        error: 'Yandex error ' + yandexRes.status,
        detail: data
      }), { status: yandexRes.status, headers: cors });
    }

    // Extract the agent's answer from the chat completion response
    const answer = data.choices?.[0]?.message?.content || 'No response from agent.';
    return new Response(JSON.stringify({ answer: answer }), { status: 200, headers: cors });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
