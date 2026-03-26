export const config = { runtime: 'edge' };

const BASE = 'https://llm.api.cloud.yandex.net/v1';

async function yCall(path, method, auth, folderId, body) {
  const opts = {
    method: method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': auth,
      'x-folder-id': folderId
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(BASE + path, opts);
  const data = await r.json();
  return { status: r.status, data: data };
}

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

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
    const body  = await req.json();
    const apiKey   = String(body.apiKey   || '');
    const folderId = String(body.folderId || '');
    const agentId  = String(body.agentId  || '');
    const query    = String(body.query    || '');

    if (!apiKey || !folderId || !agentId || !query) {
      return new Response(JSON.stringify({ error: 'Missing: apiKey, folderId, agentId, query' }), { status: 400, headers: cors });
    }

    const auth = apiKey.startsWith('t1.') ? 'Bearer ' + apiKey : 'Api-Key ' + apiKey;

    // Step 1 — Create thread
    const threadRes = await yCall('/threads', 'POST', auth, folderId, {});
    if (threadRes.status !== 200) {
      return new Response(JSON.stringify({ error: 'Thread creation failed', detail: threadRes.data }), { status: threadRes.status, headers: cors });
    }
    const threadId = threadRes.data.id;

    // Step 2 — Add user message
    const msgRes = await yCall('/threads/' + threadId + '/messages', 'POST', auth, folderId, {
      role: 'user',
      content: [{ type: 'text', text: { value: query } }]
    });
    if (msgRes.status !== 200) {
      return new Response(JSON.stringify({ error: 'Message failed', detail: msgRes.data }), { status: msgRes.status, headers: cors });
    }

    // Step 3 — Start run with your Agent Atelier agent
    const runRes = await yCall('/threads/' + threadId + '/runs', 'POST', auth, folderId, {
      assistant_id: agentId
    });
    if (runRes.status !== 200) {
      return new Response(JSON.stringify({ error: 'Run failed', detail: runRes.data }), { status: runRes.status, headers: cors });
    }
    const runId = runRes.data.id;

    // Step 4 — Poll until complete (max 25 seconds, every 2s)
    let runStatus = runRes.data.status;
    let attempts  = 0;
    while (runStatus !== 'completed' && runStatus !== 'failed' && runStatus !== 'cancelled' && attempts < 12) {
      await sleep(2000);
      const poll = await yCall('/threads/' + threadId + '/runs/' + runId, 'GET', auth, folderId);
      runStatus = poll.data.status;
      attempts++;
    }

    if (runStatus !== 'completed') {
      return new Response(JSON.stringify({ error: 'Agent timed out. Status: ' + runStatus }), { status: 504, headers: cors });
    }

    // Step 5 — Get assistant reply
    const msgsRes = await yCall('/threads/' + threadId + '/messages', 'GET', auth, folderId);
    const msgs = msgsRes.data.data || msgsRes.data.messages || [];
    const assistantMsgs = msgs.filter(function(m) { return m.role === 'assistant'; });
    const last = assistantMsgs[assistantMsgs.length - 1];
    const answer = (last && last.content && last.content[0] && last.content[0].text && last.content[0].text.value)
      ? last.content[0].text.value
      : JSON.stringify(last);

    return new Response(JSON.stringify({ answer: answer }), { status: 200, headers: cors });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
