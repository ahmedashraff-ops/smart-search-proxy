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

    const prompt = `${query}

Use web_search to search uae.sharafdg.com for real products matching this request. For each product found, visit the actual product page to get the real product image URL and product URL.

Return ONLY a valid JSON object — no markdown, no code fences, no backticks, no explanation, just raw JSON:
{
  "summary": "describe what you found and why these products suit the request",
  "products": [
    {
      "name": "Full product name as shown on Sharaf DG",
      "brand": "Brand name",
      "specs": "Key specs e.g. 55 inch · 4K QLED · 120Hz",
      "price": 1299,
      "original_price": 1599,
      "energy_rating": "5 Star",
      "features": ["Feature 1", "Feature 2", "Feature 3", "Feature 4", "Feature 5"],
      "why": "specific reason this product suits the customer request",
      "url": "https://uae.sharafdg.com/real-product-page-url",
      "image_url": "https://uae.sharafdg.com/real-product-image-url.jpg"
    }
  ]
}
IMPORTANT: Only include real products that actually exist on uae.sharafdg.com. Use web_search to find them and extract the real product page URL and the actual product image URL (usually from media.sharafdg.com or a CDN). Always return 8 to 12 products. If original_price is unavailable set it to null. If url is unavailable set it to null. If image_url is unavailable set it to null. Return ONLY raw JSON, nothing else.`;

    const yandexRes = await fetch('https://ai.api.cloud.yandex.net/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': auth, 'x-folder-id': folderId },
      body: JSON.stringify({
        model: 'gpt://' + folderId + '/yandexgpt',
        input: prompt,
        tools: [{ type: 'web_search', filters: { allowed_domains: ['uae.sharafdg.com'] } }],
        temperature: 0.2,
        max_output_tokens: 4000
      })
    });

    const raw = await yandexRes.text();
    let data;
    try { data = JSON.parse(raw); } catch(e) { data = { parseError: e.message, rawResponse: raw.substring(0, 800) }; }

    if (!yandexRes.ok) {
      return new Response(JSON.stringify({ error: 'Yandex error ' + yandexRes.status, detail: data }), { status: yandexRes.status, headers: cors });
    }

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

    let clean = answer.trim();
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```[a-z]*\n?/, '').replace(/```\s*$/, '').trim();
    }

    return new Response(JSON.stringify({ answer: clean }), { status: 200, headers: cors });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
