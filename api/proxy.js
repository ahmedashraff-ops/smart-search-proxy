export const config = { runtime: 'edge' };

export default async function handler(req) {

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  if (req.method !== 'POST')   return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: cors });

  try {
    const body     = await req.json();
    const apiKey   = String(body.apiKey   || '');
    const folderId = String(body.folderId || '');
    const query    = String(body.query    || '');

    if (!apiKey || !folderId || !query) {
      return new Response(JSON.stringify({ error: 'Missing: apiKey, folderId, query' }), { status: 400, headers: cors });
    }

    const auth = apiKey.startsWith('t1.') ? 'Bearer ' + apiKey : 'Api-Key ' + apiKey;

    const prompt = `Customer request: "${query}"

Search Sharaf DG UAE and find real products that match this request.

Return a raw JSON object — no markdown, no code fences, just the JSON:
{
  "summary": "1-2 sentences describing what you found and why these products suit the request",
  "products": [
    {
      "name": "exact product name as listed on the website",
      "brand": "brand name",
      "specs": "key specs e.g. 50L · Single Door · A+ Energy",
      "price": 499,
      "url": "https://uae.sharafdg.com/product/actual-product-slug/"
    }
  ]
}

Rules:
- Only include real products you actually found via search — never invent or guess names
- Use the exact product name shown on the website
- Include between 4 and 8 products
- Set price to null if not available
- Set url to null if not available
- Return ONLY the JSON object, nothing else`;

    const yandexRes = await fetch('https://ai.api.cloud.yandex.net/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': auth,
        'x-folder-id':   folderId
      },
      body: JSON.stringify({
        model:             'gpt://' + folderId + '/yandexgpt',
        input:             prompt,
        tools:             [{ type: 'web_search', filters: { allowed_domains: ['uae.sharafdg.com'] } }],
        temperature:       0.1,
        max_output_tokens: 3000
      })
    });

    const raw = await yandexRes.text();
    let data;
    try { data = JSON.parse(raw); }
    catch (e) { data = { parseError: e.message, rawResponse: raw.substring(0, 800) }; }

    if (!yandexRes.ok) {
      return new Response(JSON.stringify({ error: 'Yandex error ' + yandexRes.status, detail: data }), {
        status: yandexRes.status, headers: cors
      });
    }

    // Extract the text answer from the response
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

    // Strip markdown fences if present
    let clean = answer.trim();
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```[a-z]*\n?/, '').replace(/```\s*$/, '').trim();
    }

    return new Response(JSON.stringify({ answer: clean }), { status: 200, headers: cors });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
