function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const SB_HEADERS = key => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
});

async function fetchAllCacheRows(sbUrl, sbKey) {
  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; offset < 10000; offset += pageSize) {
    const response = await fetch(`${sbUrl}/rest/v1/fragrances_cache?select=*&offset=${offset}&limit=${pageSize}`, {
      headers: SB_HEADERS(sbKey),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Supabase ${response.status}: ${text.slice(0, 240)}`);
    }
    const page = await response.json();
    if (!Array.isArray(page) || !page.length) break;
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

function hasArrayData(value) {
  return Array.isArray(value) && value.filter(Boolean).length > 0;
}

function rowQuality(row) {
  const hasNotes = hasArrayData(row.notes_top) || hasArrayData(row.notes_heart) || hasArrayData(row.notes_base);
  const hasAccords = hasArrayData(row.accords);
  return {
    hasImage: Boolean(row.image_url),
    hasNotes,
    hasAccords,
    source: String(row.fragella_id || '').startsWith('sh_') ? 'scenthive' : 'fragella/cache',
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const sbUrl = process.env.SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!sbUrl || !sbKey) return res.status(500).json({ error: 'Missing Supabase env' });

    const list = await fetchAllCacheRows(sbUrl, sbKey);
    const dupes = {};
    for (const row of list) {
      const key = normalize(`${row.name || ''} ${row.house || ''}`);
      if (!key) continue;
      if (!dupes[key]) dupes[key] = [];
      dupes[key].push(row);
    }
    const duplicateEntries = Object.entries(dupes).filter(([, rows]) => rows.length > 1);
    const duplicateExamples = duplicateEntries
      .slice(0, 8)
      .map(([key, rows]) => ({
        key,
        count: rows.length,
        names: rows.slice(0, 4).map(row => `${row.name || 'Unnamed'}${row.house ? ' · ' + row.house : ''}`),
      }));
    const duplicateGroups = duplicateEntries.length;

    const enriched = list.map(row => ({ ...row, _quality: rowQuality(row) }));
    const stats = enriched.reduce((acc, row) => {
      acc.total += 1;
      if (!row._quality.hasImage) acc.missing_images += 1;
      if (!row._quality.hasNotes) acc.missing_notes += 1;
      if (!row._quality.hasAccords) acc.missing_accords += 1;
      if (row._quality.source === 'scenthive') acc.scenthive_ids += 1;
      return acc;
    }, { total: 0, missing_images: 0, missing_notes: 0, missing_accords: 0, scenthive_ids: 0, duplicate_groups: duplicateGroups });

    enriched.sort((a, b) => {
      const av = String(a.updated_at || a.created_at || a.name || '');
      const bv = String(b.updated_at || b.created_at || b.name || '');
      return bv.localeCompare(av);
    });

    return res.status(200).json({
      ok: true,
      stats,
      duplicate_examples: duplicateExamples,
      rows: enriched.slice(0, 120).map(row => ({
        fragella_id: row.fragella_id || row.id || '',
        name: row.name || '',
        house: row.house || '',
        image_url: row.image_url || '',
        family: row.family || '',
        accords: row.accords || [],
        notes_top: row.notes_top || [],
        notes_heart: row.notes_heart || [],
        notes_base: row.notes_base || [],
        launch_year: row.launch_year || null,
        created_at: row.created_at || '',
        updated_at: row.updated_at || '',
        quality: row._quality,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
