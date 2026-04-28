export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const prompt = body.prompt || 'recommend a fragrance';
    const collection = body.collection || [];
    const system = body.system || 'You are a fragrance expert. Respond ONLY with valid JSON: {"intro":"one sentence","recommendations":[{"name":"Name","house":"House","why":"why","notes":["Note1"],"occasion":"when","price":"range","is_dupe":false}]}';

    const colCtx = collection.length > 0 
      ? '\n\nUser owns: ' + collection.map(b => b.name + ' by ' + b.house).join(', ')
      : '';

    const apiKey = process.env.ANTHROPIC_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing ANTHROPIC_KEY env variable' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1200,
        system: system,
        messages: [{ role: 'user', content: prompt + colCtx }]
      })
    });

    const data = await response.json();
    
    if (data.error) {
      return res.status(500).json({ error: 'Anthropic: ' + data.error.message });
    }

    const text = (data.content || []).map(b => b.text || '').join('');
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    try {
      const parsed = JSON.parse(cleaned);
      return res.status(200).json(parsed);
    } catch (e) {
      return res.status(500).json({ error: 'Parse error: ' + e.message, raw: cleaned.substring(0, 200) });
    }

  } catch (err) {
    return res.status(500).json({ 
      error: err.message || 'Unknown error',
      stack: err.stack ? err.stack.substring(0, 300) : null
    });
  }
}
