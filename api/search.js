function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function scoreFragrance(f, query) {
  const q = normalize(query);
  const name = normalize(f.name);
  const house = normalize(f.house);
  const haystack = `${name} ${house}`.trim();
  if (!q || !haystack) return 0;

  let score = 0;
  if (name === q) score += 120;
  if (haystack === q) score += 115;
  if (name.startsWith(q)) score += 90;
  if (haystack.startsWith(q)) score += 70;
  if (name.includes(q)) score += 55;
  if (haystack.includes(q)) score += 35;

  const queryTokens = q.split(' ').filter(Boolean);
  const nameTokens = name.split(' ').filter(Boolean);
  const haystackTokens = haystack.split(' ').filter(Boolean);

  for (const token of queryTokens) {
    if (nameTokens.includes(token)) score += 28;
    else if (haystackTokens.includes(token)) score += 18;
    else if (nameTokens.some(t => t.startsWith(token))) score += 12;
  }

  // Prefer complete perfume names over brand-only fuzzy hits.
  if (queryTokens.length === 1 && nameTokens[0] === q) score += 20;
  if (queryTokens.length === 1 && house === q && name !== q) score -= 20;
  if (f.image_url) score += 3;
  return score;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'No query', fragrances: [] });
    const apiKey = process.env.FRAGELLA_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Missing FRAGELLA_API_KEY', fragrances: [] });
    const url = 'https://api.fragella.com/api/v1/fragrances?search=' + encodeURIComponent(query) + '&limit=12';
    const response = await fetch(url, {
      headers: { 'x-api-key': apiKey, 'Accept': 'application/json' }
    });
    const responseText = await response.text();
    if (!response.ok) return res.status(500).json({ error: 'Fragella ' + response.status, fragrances: [] });
    const data = JSON.parse(responseText);
    var raw = [];
    if (Array.isArray(data)) raw = data;
    else if (Array.isArray(data.data)) raw = data.data;
    else if (Array.isArray(data.fragrances)) raw = data.fragrances;
    else if (Array.isArray(data.results)) raw = data.results;
    const fragrances = raw.map(function(f) {
      return {
        fragella_id: String(f.id || f.ID || Math.random()),
        name: f.Name || f.name || '',
        house: f.Brand || f.brand || f.house || '',
        family: Array.isArray(f['Main Accords']) ? f['Main Accords'][0] : (f['Main Accords'] || f.family || ''),
        notes_top: f['Top Notes'] || f.top_notes || [],
        notes_heart: f['Middle Notes'] || f.middle_notes || [],
        notes_base: f['Base Notes'] || f.base_notes || [],
        accords: f['Main Accords'] || f.accords || [],
        longevity: f.Longevity || f.longevity || '',
        sillage: f.Sillage || f.sillage || '',
        gender: f.Gender || f.gender || '',
        image_url: f['Image URL'] || f.image_url || f.image || '',
        launch_year: f.Year || f.year || null,
        price_range: f.Price || f.price || '',
        oil_type: f.OilType || f.oil_type || '',
        'General Notes': f['General Notes'] || []
      };
    }).map(f => ({ ...f, _score: scoreFragrance(f, query) }));

    const bestScore = Math.max(...fragrances.map(f => f._score), 0);
    const filtered = bestScore >= 55
      ? fragrances.filter(f => f._score >= Math.max(20, bestScore - 80))
      : fragrances;

    filtered.sort((a, b) => b._score - a._score || String(a.name).localeCompare(String(b.name)));
    return res.status(200).json({ fragrances: filtered.map(({ _score, ...f }) => f) });
  } catch (err) {
    return res.status(500).json({ error: err.message, fragrances: [] });
  }
}
