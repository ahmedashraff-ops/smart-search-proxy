export const config = { runtime: 'edge' };

export default async function handler(req) {

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });

  const { searchParams } = new URL(req.url);
  const imageUrl = searchParams.get('url');

  if (!imageUrl) {
    return new Response(JSON.stringify({ error: 'Missing url param' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  // Only allow HTTPS image URLs
  if (!imageUrl.startsWith('https://')) {
    return new Response(JSON.stringify({ error: 'Only HTTPS URLs are allowed' }), {
      status: 403,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  try {
    const imgRes = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SharafDG-SmartSearch/1.0)',
        'Referer': 'https://uae.sharafdg.com/'
      }
    });

    if (!imgRes.ok) {
      return new Response(null, { status: imgRes.status, headers: cors });
    }

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const imageBuffer = await imgRes.arrayBuffer();

    return new Response(imageBuffer, {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
}
