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

function hasData(value) {
  return Array.isArray(value) ? value.filter(Boolean).length > 0 : Boolean(value);
}

function isScentHiveId(id) {
  return String(id || '').startsWith('sh_');
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

function canonicalKey(row) {
  return normalize(`${row.name || ''} ${row.house || ''}`);
}

function cleanPatch(row) {
  return {
    fragella_id: row.fragella_id || row.id || '',
    name: row.name || '',
    house: row.house || '',
    family: row.family || '',
    notes_top: Array.isArray(row.notes_top) ? row.notes_top : [],
    notes_heart: Array.isArray(row.notes_heart) ? row.notes_heart : [],
    notes_base: Array.isArray(row.notes_base) ? row.notes_base : [],
    accords: Array.isArray(row.accords) ? row.accords : [],
    longevity: row.longevity || '',
    sillage: row.sillage || '',
    gender: row.gender || '',
    image_url: row.image_url || '',
    launch_year: row.launch_year || null,
    price_range: row.price_range || '',
    oil_type: row.oil_type || '',
  };
}

function mergeIntoWinner(winner, losers) {
  const merged = { ...winner };
  for (const row of losers) {
    for (const key of [
      'family', 'longevity', 'sillage', 'gender', 'image_url',
      'launch_year', 'price_range', 'oil_type'
    ]) {
      if (!hasData(merged[key]) && hasData(row[key])) merged[key] = row[key];
    }
    for (const key of ['notes_top', 'notes_heart', 'notes_base', 'accords']) {
      if (!hasData(merged[key]) && hasData(row[key])) merged[key] = row[key];
    }
    if (isScentHiveId(merged.fragella_id || merged.id) && !isScentHiveId(row.fragella_id || row.id)) {
      merged.fragella_id = row.fragella_id || row.id;
    }
  }
  return cleanPatch(merged);
}

async function patchById(id, row, sbUrl, sbKey) {
  const response = await fetch(`${sbUrl}/rest/v1/fragrances_cache?fragella_id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...SB_HEADERS(sbKey), Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
  return response.ok;
}

async function deleteById(id, sbUrl, sbKey) {
  const response = await fetch(`${sbUrl}/rest/v1/fragrances_cache?fragella_id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { ...SB_HEADERS(sbKey), Prefer: 'return=minimal' },
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

    const apply = Boolean(req.body?.apply);
    const rows = await fetchAllCacheRows(sbUrl, sbKey);
    const groups = {};
    for (const row of Array.isArray(rows) ? rows : []) {
      const key = canonicalKey(row);
      if (!key) continue;
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    }

    const duplicateGroups = Object.entries(groups)
      .filter(([, items]) => items.length > 1)
      .map(([key, items]) => {
        const sorted = items.slice().sort((a, b) => qualityScore(b) - qualityScore(a));
        return { key, winner: sorted[0], losers: sorted.slice(1) };
      });

    if (!apply) {
      return res.status(200).json({
        ok: true,
        dry_run: true,
        groups: duplicateGroups.length,
        removable: duplicateGroups.reduce((sum, g) => sum + g.losers.length, 0),
        examples: duplicateGroups.slice(0, 8).map(g => ({
          key: g.key,
          keep: `${g.winner.name || 'Unnamed'}${g.winner.house ? ' · ' + g.winner.house : ''}`,
          remove: g.losers.map(row => `${row.name || 'Unnamed'}${row.house ? ' · ' + row.house : ''}`),
        })),
      });
    }

    let merged = 0;
    let deleted = 0;
    const failed = [];

    for (const group of duplicateGroups) {
      const winnerId = group.winner.fragella_id || group.winner.id;
      if (!winnerId) {
        failed.push(group.key);
        continue;
      }
      const patch = mergeIntoWinner(group.winner, group.losers);
      const patched = await patchById(winnerId, patch, sbUrl, sbKey);
      if (!patched) {
        failed.push(group.key);
        continue;
      }
      merged += 1;
      for (const loser of group.losers) {
        const loserId = loser.fragella_id || loser.id;
        if (!loserId || loserId === winnerId) continue;
        if (await deleteById(loserId, sbUrl, sbKey)) deleted += 1;
        else failed.push(`${group.key}:${loserId}`);
      }
    }

    return res.status(200).json({ ok: true, dry_run: false, groups: duplicateGroups.length, merged, deleted, failed });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
