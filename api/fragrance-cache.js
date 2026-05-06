function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stableId(name, house) {
  const key = normalize(`${house} ${name}`);
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `sh_${(hash >>> 0).toString(36)}`;
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function cleanFragrance(f) {
  const name = String(f?.name || f?.fragrance_name || '').trim();
  const house = String(f?.house || '').trim();
  if (!name) return null;
  return {
    fragella_id: String(f.fragella_id || f.id || stableId(name, house)),
    name,
    house,
    family: f.family || '',
    notes_top: asArray(f.notes_top || f['Top Notes']),
    notes_heart: asArray(f.notes_heart || f['Middle Notes']),
    notes_base: asArray(f.notes_base || f['Base Notes']),
    accords: asArray(f.accords || f['Main Accords']),
    longevity: f.longevity || '',
    sillage: f.sillage || '',
    gender: f.gender || '',
    image_url: f.image_url || f['Image URL'] || '',
    launch_year: f.launch_year || f.Year || null,
    price_range: f.price_range || '',
    oil_type: f.oil_type || '',
  };
}

const SB_HEADERS = key => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const sbUrl = process.env.SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!sbUrl || !sbKey) return res.status(500).json({ error: 'Missing Supabase env' });

    const body = req.body || {};
    const raw = Array.isArray(body.fragrances) ? body.fragrances : [body.fragrance || body];
    const rows = raw.map(cleanFragrance).filter(Boolean);
    if (!rows.length) return res.status(400).json({ error: 'No valid fragrances' });

    const response = await fetch(`${sbUrl}/rest/v1/fragrances_cache`, {
      method: 'POST',
      headers: {
        ...SB_HEADERS(sbKey),
        Prefer: 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify(rows),
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(502).json({ error: `Supabase ${response.status}: ${text.slice(0, 240)}` });
    }

    return res.status(200).json({ ok: true, cached: rows.length });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
