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

    const prompt = `Customer request: "${query}"

Use the web search tool to search uae.sharafdg.com for real products matching this request. You MUST search before answering.

STRICT RULES — failure to follow these will make the response useless:
- ONLY include products you actually found via web search on uae.sharafdg.com
- NEVER invent, guess, or placeholder product names, brands, prices, or specs
- NEVER use generic names like "Brand A", "Brand B", "Product 1", "Model X", "Unknown Brand"
- Every product must have a real brand name (e.g. Samsung, LG, Sony, Philips, Bosch, Apple)
- Every product must have a real model name as it appears on the Sharaf DG website
- If you cannot find enough real products via search, return only what you actually found — do not pad with invented products
- If a URL was visible in search results, include it. Otherwise set url to null
- If a price was visible in search results, include it. Otherwise set price to null

Return ONLY a valid raw JSON object — no markdown, no code fences, no backticks, no explanation:
{
  "summary": "describe what you found and why these products suit the request",
  "products": [
    {
      "name": "Full real product name e.g. Samsung 65 QN85B Neo QLED 4K Smart TV",
      "brand": "Real brand name e.g. Samsung",
      "specs": "Key specs e.g. 65 inch · 4K QLED · 120Hz",
      "price": 1299,
      "original_price": 1599,
      "energy_rating": "5 Star",
      "features": ["Feature 1", "Feature 2", "Feature 3"],
      "why": "specific reason this product suits the customer request",
      "url": "https://uae.sharafdg.com/product-url-if-found"
    }
  ]
}

Target 8 to 12 products. If fewer real products are found via search, broaden to related products in the same category — but only real ones found via search. Set original_price to null if unavailable. Return ONLY raw JSON.`;

    const yandexRes = await fetch('https://ai.api.cloud.yandex.net/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': auth,
        'x-folder-id': folderId
      },
      body: JSON.stringify({
        model: 'gpt://' + folderId + '/yandexgpt',
        input: prompt,
        tools: [{ type: 'web_search', filters: { allowed_domains: ['uae.sharafdg.com'] },
            "search_context_size": "medium", }],
        temperature: 0.2,
        max_output_tokens: 4000
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

    // Extract answer text
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

    // Strip markdown fences if model added them despite instructions
    let clean = answer.trim();
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```[a-z]*\n?/, '').replace(/```\s*$/, '').trim();
    }

    // ── Hallucination guard ──────────────────────────────────────────────────
    // Catches placeholder names like "Brand A", "Brand B", "Brand 1",
    // "Model X", "Product 1", "Unknown Brand", "Generic Brand" etc.
    // Only rejects the whole response if the MAJORITY are fake —
    // a few oddly-named real products won't trigger a false positive.
    try {
      const parsed = JSON.parse(clean.match(/(\{[\s\S]*\})/)?.[1] || clean);
      if (parsed?.products?.length) {
        const fakePattern = /^(brand\s+[a-z\d]|model\s+[a-z\d]|product\s+[a-z\d]|unknown\s+brand|generic\s+brand|sample\s+brand|brand\s*\d|placeholder)/i;
        const fakeCount = parsed.products.filter(p =>
          fakePattern.test((p.brand || '').trim()) || fakePattern.test((p.name || '').trim())
        ).length;
        // Reject if more than half the products are clearly hallucinated
        if (fakeCount > 0 && fakeCount >= Math.ceil(parsed.products.length / 2)) {
          return new Response(JSON.stringify({
            error: 'No real products could be found for this search on Sharaf DG. Please try a different query — for example, include a brand name (Samsung, LG, Sony) or a specific product type.'
          }), { status: 422, headers: cors });
        }
      }
    } catch (e) { /* JSON parsing will be handled on the frontend */ }
    // ────────────────────────────────────────────────────────────────────────

    return new Response(JSON.stringify({ answer: clean }), { status: 200, headers: cors });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
