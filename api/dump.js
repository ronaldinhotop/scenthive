// ─────────────────────────────────────────────────────────────────────────────
// GET /api/dump
//
// Returns all fragrances_cache rows as a JSON array you can paste directly
// into app.js as a static lookup. One-time use — run it, copy the output,
// delete this file.
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_ANON_KEY;

  if (!sbUrl || !sbKey)
    return res.status(500).json({ error: 'Missing Supabase env vars' });

  // Fetch all rows from fragrances_cache (Supabase default limit is 1000)
  const url = `${sbUrl}/rest/v1/fragrances_cache?select=*&limit=1000`;
  const r = await fetch(url, {
    headers: {
      'apikey': sbKey,
      'Authorization': `Bearer ${sbKey}`,
    }
  });

  if (!r.ok) return res.status(502).json({ error: 'Supabase error ' + r.status });

  const rows = await r.json();

  // Shape into the exact object app.js expects from searchFragella()
  const shaped = rows.map(f => ({
    fragella_id: f.fragella_id || '',
    name:        f.name        || '',
    house:       f.house       || '',
    family:      f.family      || '',
    notes_top:   f.notes_top   || [],
    notes_heart: f.notes_heart || [],
    notes_base:  f.notes_base  || [],
    accords:     f.accords     || [],
    longevity:   f.longevity   || '',
    sillage:     f.sillage     || '',
    gender:      f.gender      || '',
    image_url:   f.image_url   || '',
    launch_year: f.launch_year || null,
    price_range: f.price_range || '',
    oil_type:    f.oil_type    || '',
  })).filter(f => f.name);

  return res.status(200).json({ count: shaped.length, fragrances: shaped });
}
