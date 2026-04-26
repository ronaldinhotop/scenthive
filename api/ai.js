export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const { prompt, collection, system } = req.body;
    const collectionContext = collection && collection.length > 0
      ? '\n\nUser collection: ' + collection.map(b => b.name + ' by ' + b.house).join(', ')
      : '';
    const systemPrompt = system || 'You are the AI engine for ScentHive, a premium fragrance platform. Deep expertise across all fragrance houses. Give genuine expert recommendations. Factor in the collection. For dupe requests find cheaper alternatives. Respond ONLY with valid JSON: {"intro":"one sentence","recommendations":[{"name":"Name","house":"House","why":"2-3 sentences","notes":["Note1","Note2","Note3"],"occasion":"when","price":"price range","is_dupe":false}]} Give exactly 3 recommendations.';
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_KEY,
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
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
