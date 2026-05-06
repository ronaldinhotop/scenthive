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

function cacheKey(row) {
  return normalize(`${row.name || ''} ${row.house || ''}`);
}

function isScentHiveId(id) {
  return String(id || '').startsWith('sh_');
}

function hasData(value) {
  return Array.isArray(value) ? value.filter(Boolean).length > 0 : Boolean(value);
}

function qualityScore(row) {
  let score = 0;
  if (row.name) score += 10;
  if (row.house) score += 6;
  if (row.image_url) score += 8;
  if (row.family) score += 3;
  if (hasData(row.accords)) score += 6;
  if (hasData(row.notes_top)) score += 4;
  if (hasData(row.notes_heart)) score += 4;
  if (hasData(row.notes_base)) score += 4;
  if (row.launch_year) score += 2;
  if (!isScentHiveId(row.fragella_id || row.id)) score += 5;
  return score;
}

function mergeRow(existing, incoming) {
  const merged = { ...existing };
  for (const key of [
    'name', 'house', 'family', 'longevity', 'sillage', 'gender',
    'image_url', 'launch_year', 'price_range', 'oil_type'
  ]) {
    if (!hasData(merged[key]) && hasData(incoming[key])) merged[key] = incoming[key];
  }
  for (const key of ['notes_top', 'notes_heart', 'notes_base', 'accords']) {
    if (!hasData(merged[key]) && hasData(incoming[key])) merged[key] = incoming[key];
  }
  if (isScentHiveId(merged.fragella_id) && !isScentHiveId(incoming.fragella_id)) {
    merged.fragella_id = incoming.fragella_id;
  }
  if (qualityScore(incoming) > qualityScore(merged) + 8) {
    return { ...merged, ...Object.fromEntries(Object.entries(incoming).filter(([, v]) => hasData(v))) };
  }
  return merged;
}

async function findDuplicate(row, sbUrl, sbKey) {
  const words = normalize(row.name).split(' ').filter(Boolean);
  const word = words[0] || normalize(row.house).split(' ')[0];
  if (!word) return null;
  const filter = `name.ilike.*${word}*,house.ilike.*${word}*`;
  const url = `${sbUrl}/rest/v1/fragrances_cache?or=(${encodeURIComponent(filter)})&limit=40`;
  try {
    const response = await fetch(url, { headers: SB_HEADERS(sbKey) });
    if (!response.ok) return null;
    const rows = await response.json();
    if (!Array.isArray(rows)) return null;
    return rows.find(existing => cacheKey(existing) === cacheKey(row)) || null;
  } catch {
    return null;
  }
}

async function patchByFragellaId(existingId, row, sbUrl, sbKey) {
  const url = `${sbUrl}/rest/v1/fragrances_cache?fragella_id=eq.${encodeURIComponent(existingId)}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      ...SB_HEADERS(sbKey),
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  return response.ok;
}

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

    const inserts = [];
    let skipped = 0;
    let upgraded = 0;

    for (const row of rows) {
      const duplicate = await findDuplicate(row, sbUrl, sbKey);
      if (!duplicate) {
        inserts.push(row);
        continue;
      }

      const incomingIsRicher = qualityScore(row) > qualityScore(duplicate);
      const shouldUpgrade = isScentHiveId(duplicate.fragella_id || duplicate.id) || incomingIsRicher;
      if (shouldUpgrade && duplicate.fragella_id) {
        const merged = mergeRow(duplicate, row);
        const ok = await patchByFragellaId(duplicate.fragella_id, cleanFragrance(merged), sbUrl, sbKey);
        if (ok) upgraded += 1;
        else skipped += 1;
      } else {
        skipped += 1;
      }
    }

    if (!inserts.length) {
      return res.status(200).json({ ok: true, cached: 0, skipped, upgraded });
    }

    const response = await fetch(`${sbUrl}/rest/v1/fragrances_cache`, {
      method: 'POST',
      headers: {
        ...SB_HEADERS(sbKey),
        Prefer: 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify(inserts),
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(502).json({ error: `Supabase ${response.status}: ${text.slice(0, 240)}` });
    }

    return res.status(200).json({ ok: true, cached: inserts.length, skipped, upgraded });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
