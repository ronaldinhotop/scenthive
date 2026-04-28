export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Manually parse body if not parsed
    let body = req.body;
    if (!body || typeof body === 'string') {
      try {
        body = body ? JSON.parse(body) : {};
      } catch (e) {
        body = {};
      }
    }

    // Read from raw stream if still empty
    if (!body || Object.keys(body).length === 0) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks).toString('utf-8');
      try {
        body = JSON.parse(rawBody);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid JSON body' });
      }
    }

    const prompt = body.prompt || '';
    const collection = body.collection || [];
    const system = body.system || '';

    if (!prompt) return res.status(400).json({ error: 'No prompt provided' });

    const collectionContext = collection.length > 0
      ? '\n\nUser collection: ' + collection.map(b => b.name + ' by ' + b.house).join(', ')
      : '';

    const systemPrompt = system || 'You are the AI engine for ScentHive, a premium fragrance platform. Deep expertise across all fragrance houses. Give genuine expert recommendations. Factor in the collection. For dupe requests find cheaper alternatives. Respond ONLY with valid JSON: {"intro":"one sentence","recommendations":[{"name":"Name","house":"House","why":"2-3 sentences","notes":["Note1","Note2","Note3"],"occasion":"when","price":"price range","is_dupe":false}]} Give exactly 3 recommendations.';

    const apiKey = process.env.ANTHROPIC_KEY || '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';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt + collectionContext }]
      })
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const text = data.content.map(b => b.text || '').join('');
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
