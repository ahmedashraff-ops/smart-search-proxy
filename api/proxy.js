export const config = { runtime: 'edge' };

// ── Category brand map ─────────────────────────────────────────────────────
// For each product category, defines:
//   - keywords: to detect which category the query belongs to
//   - category: the Sharaf DG category label used in search queries
//   - brands: top brands to use in fallback brand-specific searches
const CATEGORY_MAP = [
  {
    keywords: ['oled','qled','tv','television','smart tv','uhd','4k tv','8k tv','55 inch','65 inch','75 inch','85 inch'],
    category: 'TV',
    brands:   ['Samsung','LG','Sony','TCL','Hisense','Panasonic','Philips']
  },
  {
    keywords: ['ac','air con','air-con','split ac','inverter ac','cooling','1.5 ton','2 ton'],
    category: 'air conditioner',
    brands:   ['Samsung','LG','Daikin','Panasonic','Carrier','Midea','Hitachi','Gree']
  },
  {
    keywords: ['fridge','refrigerator','freezer'],
    category: 'refrigerator',
    brands:   ['Samsung','LG','Bosch','Whirlpool','Hitachi','Haier','Beko']
  },
  {
    keywords: ['washing machine','washer','laundry','dryer','front load','top load'],
    category: 'washing machine',
    brands:   ['Samsung','LG','Bosch','Whirlpool','Haier','Beko','Midea']
  },
  {
    keywords: ['dishwasher'],
    category: 'dishwasher',
    brands:   ['Bosch','Samsung','LG','Midea','Beko','Whirlpool']
  },
  {
    keywords: ['microwave','oven','convection oven'],
    category: 'microwave',
    brands:   ['Samsung','LG','Panasonic','Toshiba','Midea','Sharp']
  },
  {
    keywords: ['laptop','macbook','notebook','chromebook'],
    category: 'laptop',
    brands:   ['Apple','Samsung','HP','Dell','Lenovo','Asus','Acer','Microsoft']
  },
  {
    keywords: ['iphone','smartphone','mobile phone','5g phone','android phone'],
    category: 'smartphone',
    brands:   ['Apple','Samsung','Google','Huawei','Xiaomi','OnePlus','Oppo']
  },
  {
    keywords: ['tablet','ipad'],
    category: 'tablet',
    brands:   ['Apple','Samsung','Lenovo','Huawei','Microsoft']
  },
  {
    keywords: ['headphone','earphone','earbuds','airpods','speaker','soundbar','audio'],
    category: 'audio',
    brands:   ['Sony','JBL','Bose','Samsung','Apple','Sennheiser','LG']
  },
  {
    keywords: ['camera','dslr','mirrorless','gopro','action cam'],
    category: 'camera',
    brands:   ['Sony','Canon','Nikon','Fujifilm','GoPro','Panasonic']
  },
  {
    keywords: ['vacuum','robot vacuum','cleaner'],
    category: 'vacuum cleaner',
    brands:   ['Dyson','iRobot','Samsung','LG','Xiaomi','Philips','Miele']
  },
  {
    keywords: ['gaming','ps5','playstation','xbox','nintendo'],
    category: 'gaming',
    brands:   ['Sony','Microsoft','Nintendo','Razer','Logitech']
  },
  {
    keywords: ['smartwatch','watch','wearable','galaxy watch','apple watch'],
    category: 'smartwatch',
    brands:   ['Apple','Samsung','Garmin','Huawei','Fitbit']
  },
];

function getCategoryInfo(query) {
  const q = query.toLowerCase();
  for (const entry of CATEGORY_MAP) {
    if (entry.keywords.some(k => q.includes(k))) {
      return entry;
    }
  }
  return null;
}

// Build 3-4 distinct search queries for maximum product coverage
function buildSearchQueries(query, categoryInfo) {
  const queries = [];

  // Query 1: exact customer request scoped to Sharaf DG
  queries.push(`${query} site:uae.sharafdg.com`);

  if (categoryInfo) {
    // Query 2: category browse on Sharaf DG (finds listing pages)
    queries.push(`${categoryInfo.category} site:uae.sharafdg.com`);

    // Query 3 & 4: top 2 brands in this category
    if (categoryInfo.brands.length >= 2) {
      queries.push(`${categoryInfo.brands[0]} ${categoryInfo.category} site:uae.sharafdg.com`);
      queries.push(`${categoryInfo.brands[1]} ${categoryInfo.category} site:uae.sharafdg.com`);
    }
  }

  return queries;
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

    const categoryInfo   = getCategoryInfo(query);
    const searchQueries  = buildSearchQueries(query, categoryInfo);
    const queriesList    = searchQueries.map((q, i) => `${i + 1}. "${q}"`).join('\n');

    const prompt = `Customer request: "${query}"

You must run ALL of the following searches one by one to find as many real products as possible from Sharaf DG UAE:

${queriesList}

After running all searches:
- Collect every unique product found across all searches
- Only include products that genuinely appeared in search results — never invent names, models, or prices
- Rank products so the closest matches to the customer's original request appear first
- Target 10 to 14 unique products total
- If a product appears in multiple searches, include it only once
- If a URL to the product page was visible in results, include it; otherwise set url to null
- If a price was visible in results, include it; otherwise set price to null

Return ONLY a raw JSON object — no markdown, no code fences, no explanation:
{
  "summary": "Brief description of what you found and why these products suit the customer request",
  "products": [
    {
      "name": "Exact product name as found in search results",
      "brand": "Brand name",
      "specs": "Key specs e.g. 75 inch · 4K OLED · 120Hz · Smart TV",
      "price": 5999,
      "original_price": 7499,
      "energy_rating": "5 Star",
      "features": ["Feature 1", "Feature 2", "Feature 3"],
      "why": "Specific reason this product suits the customer request",
      "url": "https://uae.sharafdg.com/product/actual-product-slug/"
    }
  ]
}

Set original_price to null if no sale/original price was visible. Return ONLY raw JSON.`;

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
