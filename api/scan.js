const MODEL_PRIORITY = [
  'claude-sonnet-4-5',
  'claude-opus-4-5',
  'claude-3-5-sonnet-20241022',
  'claude-haiku-4-5',
  'claude-3-5-haiku-20241022',
];

let _cachedModel = null;

async function pickModel(apiKey) {
  if (_cachedModel) return _cachedModel;
  try {
    const r = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    });
    if (!r.ok) return MODEL_PRIORITY[0];
    const { data } = await r.json();
    const ids = (data || []).map(m => m.id);
    for (const m of MODEL_PRIORITY) {
      if (ids.includes(m)) { _cachedModel = m; return m; }
    }
    if (ids.length) { _cachedModel = ids[0]; return ids[0]; }
  } catch {}
  return MODEL_PRIORITY[0];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const { image, mediaType } = body;

    if (!image) return res.status(400).json({ error: 'No image provided' });

    const apiKey = process.env.ANTHROPIC_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Missing ANTHROPIC_KEY' });

    const model = await pickModel(apiKey);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 600,
        system: `You are a fragrance expert with encyclopaedic knowledge of perfume bottles and packaging.
Identify the fragrance in the image. Be precise about the exact name and house.
Respond ONLY with valid JSON:
{
  "name": "Exact Fragrance Name",
  "house": "Exact House Name",
  "confidence": "high|medium|low",
  "notes": ["key note 1", "key note 2", "key note 3"],
  "family": "fragrance family",
  "description": "one sentence about this fragrance"
}
If you cannot identify it, set name to null and explain in description.`,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType || 'image/jpeg',
                data: image
              }
            },
            {
              type: 'text',
              text: 'What fragrance is this? Give me the exact name and house.'
            }
          ]
        }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const msg = data?.error?.message || JSON.stringify(data).slice(0, 300);
      return res.status(502).json({ error: `Anthropic ${response.status}: ${msg}` });
    }

    const text = (data.content || []).map(b => b.text || '').join('');
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
      return res.status(200).json(JSON.parse(cleaned));
    } catch {
      return res.status(500).json({ error: 'Could not parse response', raw: cleaned.slice(0, 200) });
    }

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
