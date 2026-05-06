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
        max_tokens: 1200,
        system: `You are a fragrance expert with encyclopaedic knowledge of perfume bottles and packaging.
Identify every fragrance bottle you can see in the image. Be precise about the exact name and house.
Respond ONLY with valid JSON:
{
  "fragrances": [
    {
      "name": "Exact Fragrance Name",
      "house": "Exact House Name",
      "confidence": "high|medium|low",
      "notes": ["key note 1", "key note 2", "key note 3"],
      "family": "fragrance family",
      "description": "one sentence about this fragrance"
    }
  ],
  "description": "one sentence about the scan quality"
}
If you can identify only one fragrance, return one item in fragrances.
If you cannot identify any fragrance, return an empty fragrances array and explain in description.`,
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
              text: 'Identify all fragrance bottles in this image. Return exact names and houses where possible.'
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
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed.fragrances)) {
        const fragrances = parsed.fragrances
          .filter(f => f && f.name)
          .map(f => ({
            name: f.name || null,
            house: f.house || '',
            confidence: f.confidence || 'low',
            notes: Array.isArray(f.notes) ? f.notes.slice(0, 5) : [],
            family: f.family || '',
            description: f.description || ''
          }));
        return res.status(200).json({
          fragrances,
          count: fragrances.length,
          description: parsed.description || ''
        });
      }
      return res.status(200).json(parsed);
    } catch {
      return res.status(500).json({ error: 'Could not parse response', raw: cleaned.slice(0, 200) });
    }

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
