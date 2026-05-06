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

function stableCacheId(row) {
  const raw = String(row?.fragella_id || row?.id || '').trim();
  if (!raw || /^0\.\d+$/.test(raw)) return stableId(row?.name || '', row?.house || '');
  return raw;
}

const SB_HEADERS = key => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
});

const CACHE_PAGE_SIZE = 1000;
const CACHE_MAX_ROWS = 50000;

async function fetchAllCacheRows(sbUrl, sbKey) {
  const rows = [];
  let capped = false;

  for (let offset = 0; offset < CACHE_MAX_ROWS; offset += CACHE_PAGE_SIZE) {
    const response = await fetch(`${sbUrl}/rest/v1/fragrances_cache?select=*&offset=${offset}&limit=${CACHE_PAGE_SIZE}`, {
      headers: SB_HEADERS(sbKey),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Supabase ${response.status}: ${text.slice(0, 240)}`);
    }
    const page = await response.json();
    if (!Array.isArray(page) || !page.length) break;
    rows.push(...page);
    if (page.length < CACHE_PAGE_SIZE) break;
    if (rows.length >= CACHE_MAX_ROWS) capped = true;
  }

  return { rows, capped, maxRows: CACHE_MAX_ROWS };
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
    fragella_id: stableCacheId(row),
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
  };
}

function mergeIntoWinner(winner, losers) {
  const merged = { ...winner };
  for (const row of losers) {
    for (const key of [
      'family', 'longevity', 'sillage', 'gender', 'image_url',
      'launch_year', 'price_range'
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
  if (response.ok) return { ok: true };
  const text = await response.text();
  return { ok: false, status: response.status, detail: text.slice(0, 240) };
}

async function deleteById(id, sbUrl, sbKey) {
  const response = await fetch(`${sbUrl}/rest/v1/fragrances_cache?fragella_id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { ...SB_HEADERS(sbKey), Prefer: 'return=minimal' },
  });
  if (response.ok) return { ok: true };
  const text = await response.text();
  return { ok: false, status: response.status, detail: text.slice(0, 240) };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const sbUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sbKey = serviceKey || process.env.SUPABASE_ANON_KEY;
    if (!sbUrl || !sbKey) return res.status(500).json({ error: 'Missing Supabase env' });

    const apply = Boolean(req.body?.apply);
    const { rows, capped, maxRows } = await fetchAllCacheRows(sbUrl, sbKey);
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
        capped,
        max_rows: maxRows,
        groups: duplicateGroups.length,
        removable: duplicateGroups.reduce((sum, g) => sum + g.losers.length, 0),
        examples: duplicateGroups.slice(0, 8).map(g => ({
          key: g.key,
          keep: `${g.winner.name || 'Unnamed'}${g.winner.house ? ' · ' + g.winner.house : ''}`,
          remove: g.losers.map(row => `${row.name || 'Unnamed'}${row.house ? ' · ' + row.house : ''}`),
        })),
      });
    }

    if (capped) {
      return res.status(409).json({
        error: `Cache cleanup is capped at ${maxRows} rows. Refusing a partial merge until the debug reader can see the full cache.`,
        capped: true,
        max_rows: maxRows,
      });
    }

    if (!serviceKey) {
      return res.status(403).json({
        error: 'Missing SUPABASE_SERVICE_ROLE_KEY in Vercel. Duplicate cleanup needs service role permissions to update and delete cache rows.',
        groups: duplicateGroups.length,
        removable: duplicateGroups.reduce((sum, g) => sum + g.losers.length, 0),
      });
    }

    let merged = 0;
    let deleted = 0;
    const failed = [];
    const errors = [];

    for (const group of duplicateGroups) {
      const winnerId = group.winner.fragella_id || group.winner.id;
      if (!winnerId) {
        failed.push(group.key);
        continue;
      }
      const patch = mergeIntoWinner(group.winner, group.losers);
      const patched = await patchById(winnerId, patch, sbUrl, sbKey);
      if (!patched.ok) {
        failed.push(group.key);
        if (errors.length < 6) errors.push({
          action: 'patch',
          key: group.key,
          id: winnerId,
          status: patched.status,
          detail: patched.detail,
        });
        continue;
      }
      merged += 1;
      for (const loser of group.losers) {
        const loserId = loser.fragella_id || loser.id;
        if (!loserId || loserId === winnerId) continue;
        const removed = await deleteById(loserId, sbUrl, sbKey);
        if (removed.ok) deleted += 1;
        else {
          failed.push(`${group.key}:${loserId}`);
          if (errors.length < 6) errors.push({
            action: 'delete',
            key: group.key,
            id: loserId,
            status: removed.status,
            detail: removed.detail,
          });
        }
      }
    }

    return res.status(200).json({
      ok: true,
      dry_run: false,
      capped,
      max_rows: maxRows,
      groups: duplicateGroups.length,
      merged,
      deleted,
      failed,
      errors,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
