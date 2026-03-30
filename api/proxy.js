export const config = { runtime: 'edge' };

// ── Category page map ──────────────────────────────────────────────────────
// Maps keywords in the user query to known Sharaf DG category URLs.
// We target category listing pages (SSR) instead of the JS-rendered search
// endpoint (?q=...) which returns a near-empty HTML shell to crawlers.
const CATEGORY_MAP = [
  { keywords: ['oled','qled','tv','television','smart tv','uhd','4k tv','8k tv'],
    urls: ['https://uae.sharafdg.com/televisions/',
           'https://uae.sharafdg.com/product-category/televisions/'] },

  { keywords: ['ac','air con','air-con','split','inverter','cooling','ton','btu'],
    urls: ['https://uae.sharafdg.com/air-conditioners/',
           'https://uae.sharafdg.com/product-category/air-conditioners/'] },

  { keywords: ['fridge','refrigerator','freezer'],
    urls: ['https://uae.sharafdg.com/refrigerators/',
           'https://uae.sharafdg.com/product-category/refrigerators/'] },

  { keywords: ['washing machine','washer','laundry','dryer','front load','top load'],
    urls: ['https://uae.sharafdg.com/washing-machines/',
           'https://uae.sharafdg.com/product-category/washing-machines/'] },

  { keywords: ['dishwasher','dish washer'],
    urls: ['https://uae.sharafdg.com/dishwashers/',
           'https://uae.sharafdg.com/product-category/dishwashers/'] },

  { keywords: ['microwave','oven','convection'],
    urls: ['https://uae.sharafdg.com/microwave-ovens/',
           'https://uae.sharafdg.com/product-category/microwave-ovens/'] },

  { keywords: ['laptop','macbook','notebook','chromebook'],
    urls: ['https://uae.sharafdg.com/laptops/',
           'https://uae.sharafdg.com/product-category/laptops/'] },

  { keywords: ['iphone','samsung phone','android','smartphone','mobile','5g phone'],
    urls: ['https://uae.sharafdg.com/mobiles/',
           'https://uae.sharafdg.com/product-category/mobiles/'] },

  { keywords: ['tablet','ipad','android tab'],
    urls: ['https://uae.sharafdg.com/tablets/',
           'https://uae.sharafdg.com/product-category/tablets/'] },

  { keywords: ['headphone','earphone','earbuds','airpods','speaker','soundbar','audio'],
    urls: ['https://uae.sharafdg.com/audio/',
           'https://uae.sharafdg.com/product-category/audio/'] },

  { keywords: ['camera','dslr','mirrorless','gopro','action cam','webcam'],
    urls: ['https://uae.sharafdg.com/cameras/',
           'https://uae.sharafdg.com/product-category/cameras/'] },

  { keywords: ['vacuum','robot vacuum','cleaner','hoover'],
    urls: ['https://uae.sharafdg.com/vacuum-cleaners/',
           'https://uae.sharafdg.com/product-category/vacuum-cleaners/'] },

  { keywords: ['coffee','espresso','nespresso','kettle','blender','juicer','toaster','iron'],
    urls: ['https://uae.sharafdg.com/small-appliances/',
           'https://uae.sharafdg.com/product-category/small-appliances/'] },

  { keywords: ['watch','smartwatch','apple watch','galaxy watch','garmin'],
    urls: ['https://uae.sharafdg.com/wearables/',
           'https://uae.sharafdg.com/product-category/wearables/'] },

  { keywords: ['gaming','playstation','xbox','nintendo','ps5','ps4','console','game'],
    urls: ['https://uae.sharafdg.com/gaming/',
           'https://uae.sharafdg.com/product-category/gaming/'] },
];

function getCategoryUrls(query) {
  const q = query.toLowerCase();
  for (const entry of CATEGORY_MAP) {
    if (entry.keywords.some(k => q.includes(k))) {
      return entry.urls;
    }
  }
  return ['https://uae.sharafdg.com/'];
}
// ──────────────────────────────────────────────────────────────────────────

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

    const categoryUrls = getCategoryUrls(query);
    const urlList = categoryUrls.map(u => `- ${u}`).join('\n');

    const prompt = `Customer request: "${query}"

IMPORTANT: Do NOT use Sharaf DG search URLs (anything containing "?q=" or "post_type=product") — those pages are JavaScript-rendered and will appear empty to you. Always crawl category listing pages or individual product pages instead.

Follow these steps:

Step 1 — Crawl these Sharaf DG category listing pages directly to find real products:
${urlList}

Step 2 — From those pages, collect every product relevant to the customer's request. If the first URL yields few results, try the second URL.

Step 3 — If you still have fewer than 10 products after Step 2, search uae.sharafdg.com for the top brands in this category (e.g. "Samsung QLED site:uae.sharafdg.com", "LG OLED site:uae.sharafdg.com") to find additional individual product pages.

Step 4 — Compile all unique real products found and rank the closest matches to the customer's request first. Target 10 to 14 products total.

Rules:
- ONLY include products you actually found on uae.sharafdg.com — never invent product names, models, specs, or prices
- Include the exact product page URL if found; otherwise set url to null
- Include the listed price if visible; otherwise set price to null

Return ONLY a raw JSON object — no markdown, no code fences, no explanation:
{
  "summary": "Brief description of what you found and why these products suit the customer request",
  "products": [
    {
      "name": "Exact product name as listed on uae.sharafdg.com",
      "brand": "Brand name",
      "specs": "Key specs e.g. 75 inch · 4K OLED · 120Hz · Smart TV",
      "price": 5999,
      "original_price": 7499,
      "energy_rating": "5 Star",
      "features": ["Feature 1", "Feature 2", "Feature 3"],
      "why": "Specific reason this product suits the customer's request",
      "url": "https://uae.sharafdg.com/product/actual-product-slug/"
    }
  ]
}

Set original_price to null if no sale/original price is shown. Return ONLY raw JSON.`;

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
        temperature:       0.3,
        max_output_tokens: 6000
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

    // Soft hallucination guard — only block if >75% of products are clearly placeholders
    try {
      const parsed = JSON.parse(clean.match(/(\{[\s\S]*\})/)?.[1] || clean);
      if (parsed?.products?.length) {
        const fakePattern = /^(brand\s*[a-z]|model\s*[a-z]|product\s*[a-z]|brand\s*\d|unknown brand)/i;
        const fakeCount = parsed.products.filter(p =>
          fakePattern.test(p.brand || '') && fakePattern.test(p.name || '')
        ).length;
        if (fakeCount / parsed.products.length > 0.75) {
          return new Response(JSON.stringify({
            error: 'The AI could not find real products for this search. Try a more specific query, e.g. include a brand name or product category.'
          }), { status: 422, headers: cors });
        }
      }
    } catch (e) { /* parsing handled on frontend */ }

    return new Response(JSON.stringify({ answer: clean }), { status: 200, headers: cors });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
