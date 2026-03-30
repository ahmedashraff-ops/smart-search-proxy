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

    const prompt = `${query}

You must search uae.sharafdg.com multiple times using different search strategies to find as many real matching products as possible:

1. First search: use the customer's exact request as the query
2. Second search: broaden to the product category (e.g. if they asked for "50 inch QLED TV", search for "QLED TV" or "Smart TV 50 inch")
3. Third search: search by major brands in this category (e.g. "Samsung TV", "LG TV", "Sony TV" etc.)
4. Combine all unique results — aim for 10 to 14 distinct products total

Rules:
- Only include products you actually found on uae.sharafdg.com during your searches
- Do NOT invent product names, models, or prices
- If a product URL was in the search results, include it exactly as found
- If a price was shown in search results, include it; otherwise set to null
- If fewer than 10 products exist for the exact query, include closely related products from the same category that a customer with this request would also consider
- Rank products so the closest matches to the original request appear first

Return ONLY a raw JSON object — no markdown, no code fences, no explanation:
{
  "summary": "Brief description of what you found and why these products suit the customer's request",
  "products": [
    {
      "name": "Exact product name as listed on uae.sharafdg.com",
      "brand": "Brand name",
      "specs": "Key specs e.g. 55 inch · 4K QLED · 120Hz · Smart TV",
      "price": 2199,
      "original_price": 2599,
      "energy_rating": "5 Star",
      "features": ["Feature 1", "Feature 2", "Feature 3"],
      "why": "Specific reason this product suits the customer's request",
      "url": "https://uae.sharafdg.com/product/actual-slug/"
    }
  ]
}

Set original_price to null if no sale price found. Set url to null if not found. Return ONLY raw JSON.`;

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
        temperature:       0.2,
        max_output_tokens: 4000   // increased to fit 10-14 detailed products
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

    // Strip markdown fences if model added them despite instructions
    let clean = answer.trim();
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```[a-z]*\n?/, '').replace(/```\s*$/, '').trim();
    }

    // Soft hallucination check — only block if ALL products look like obvious placeholders.
    // We use a strict pattern and a high threshold (75%) so real-but-oddly-named products
    // are not incorrectly blocked. If only a minority look fake, we let them through
    // so the genuine results still reach the user.
    try {
      const parsed = JSON.parse(clean.match(/(\{[\s\S]*\})/)?.[1] || clean);
      if (parsed?.products?.length) {
        const fakePattern = /^(brand\s*[a-z]|model\s*[a-z]|product\s*[a-z]|brand\s*\d|unknown brand)/i;
        const fakeCount = parsed.products.filter(p =>
          fakePattern.test(p.brand || '') && fakePattern.test(p.name || '')
        ).length;
        // Only reject if more than 60% are clearly fake
        if (fakeCount / parsed.products.length > 0.60) {
          return new Response(JSON.stringify({
            error: 'The AI could not find real products for this search. Try a more specific query, e.g. include a brand name or product category.'
          }), { status: 422, headers: cors });
        }
      }
    } catch (e) { /* parsing will be handled on the frontend */ }

    return new Response(JSON.stringify({ answer: clean }), { status: 200, headers: cors });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
