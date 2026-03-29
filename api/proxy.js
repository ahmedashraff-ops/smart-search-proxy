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

Search Sharaf DG UAE and find real products that match this request. Only include products you actually found via search — never invent names or make up products.

Return ONLY a raw JSON object (no markdown, no code fences):
{
  "summary": "describe what you found and why these products suit the request",
  "products": [
    {
      "name": "exact product name as listed on the website",
      "brand": "brand name",
      "specs": "key specs e.g. 50L · Single Door · A+ Energy",
      "price": 499,
      "url": "https://uae.sharafdg.com/product/actual-product-slug/",
      "why": "specific reason this product suits the customer request"
    }
  ]
}

Return 4 to 8 products. Set price to null if not found. Set url to null if not found.`;

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
        max_output_tokens: 1500
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

    // Extract the text answer
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

    // Fake product detection — if AI hallucinated placeholder names, return an error
    // instead of showing garbage data to the user
    try {
      const parsed = JSON.parse(clean.match(/(\{[\s\S]*\})/)?.[1] || clean);
      if (parsed && parsed.products) {
        const fakePattern = /^(brand\s*[a-z]|model\s*[a-z]|product\s*[a-z]|brand\s*\d)/i;
        const fakeCount = parsed.products.filter(p =>
          fakePattern.test(p.brand || '') || fakePattern.test(p.name || '')
        ).length;
        if (fakeCount > 0 && fakeCount >= parsed.products.length / 2) {
          return new Response(JSON.stringify({
            error: 'The AI could not find real products for this search. Please try a more specific query, e.g. include a brand name or product type.'
          }), { status: 422, headers: cors });
        }
      }
    } catch (e) { /* parsing will be handled on the frontend */ }

    return new Response(JSON.stringify({ answer: clean }), { status: 200, headers: cors });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
