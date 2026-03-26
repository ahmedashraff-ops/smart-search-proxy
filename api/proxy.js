const https = require('https');

// Tell Vercel to parse JSON bodies automatically
module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb'
    }
  }
};

module.exports = function handler(req, res) {

  // Set CORS headers FIRST before anything else
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Safely read body — handle both parsed and unparsed
  var body = req.body;
  if (!body) {
    return res.status(400).json({ error: 'Empty request body' });
  }
  if (typeof body === 'string') {
    try { body = JSON.parse(body); }
    catch(e) { return res.status(400).json({ error: 'Invalid JSON' }); }
  }

  if (!body.apiKey || !body.folderId || !body.model || !body.messages) {
    return res.status(400).json({ error: 'Missing fields: apiKey, folderId, model, messages' });
  }

  var auth = body.apiKey.startsWith('t1.')
    ? 'Bearer ' + body.apiKey
    : 'Api-Key ' + body.apiKey;

  var payload = JSON.stringify({
    model: body.model,
    messages: body.messages,
    temperature: body.temperature || 0.1,
    max_tokens: body.max_tokens || 800
  });

  var options = {
    hostname: 'llm.api.cloud.yandex.net',
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': auth,
      'x-folder-id': body.folderId,
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  var yReq = https.request(options, function(yRes) {
    var data = '';
    yRes.on('data', function(chunk) { data += chunk; });
    yRes.on('end', function() {
      try {
        var parsed = JSON.parse(data);
        return res.status(yRes.statusCode).json(parsed);
      } catch(e) {
        return res.status(yRes.statusCode).json({ error: data });
      }
    });
  });

  yReq.on('error', function(err) {
    return res.status(500).json({ error: 'Request to Yandex failed: ' + err.message });
  });

  yReq.write(payload);
  yReq.end();
};
