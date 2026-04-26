export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'No query', fragrances: [] });
    const url = 'https://api.fragella.com/api/v1/fragrances?search=' + encodeURIComponent(query) + '&limit=12';
    const response = await fetch(url, {
      headers: { 'x-api-key': '47bcbd502fb632b9ec6d165b872f5df8fc240de486b4c3ccc570d928e2b50831', 'Accept': 'application/json' }
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
    });
    return res.status(200).json({ fragrances });
  } catch (err) {
    return res.status(500).json({ error: err.message, fragrances: [] });
  }
}
