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
  return stableId(row?.name || '', row?.house || '');
}

const SB_HEADERS = key => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
});

const CACHE_PAGE_SIZE = 1000;
const CACHE_MAX_ROWS = 50000;
const APPLY_GROUP_LIMIT = 12;
const APPLY_DELETE_LIMIT = 600;

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
  }
  return cleanPatch(merged);
}

function tempMergeId(row, index) {
  return `merge_${stableId(row.name || '', row.house || '')}_${Date.now()}_${index}`;
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

async function insertRow(row, sbUrl, sbKey) {
  const response = await fetch(`${sbUrl}/rest/v1/fragrances_cache`, {
    method: 'POST',
    headers: { ...SB_HEADERS(sbKey), Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
  if (response.ok) return { ok: true };
  const text = await response.text();
  return { ok: false, status: response.status, detail: text.slice(0, 240) };
}

function quotePostgrestValue(value) {
  return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

async function deleteByIds(ids, sbUrl, sbKey) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return { ok: true, deleted: 0 };
  const filter = `in.(${uniqueIds.map(quotePostgrestValue).join(',')})`;
  const response = await fetch(`${sbUrl}/rest/v1/fragrances_cache?fragella_id=${encodeURIComponent(filter)}`, {
    method: 'DELETE',
    headers: { ...SB_HEADERS(sbKey), Prefer: 'return=representation' },
  });
  if (response.ok) {
    const rows = await response.json().catch(() => []);
    return { ok: true, deleted: Array.isArray(rows) ? rows.length : uniqueIds.length };
  }
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
    let processedGroups = 0;
    let deleteBudget = APPLY_DELETE_LIMIT;

    for (const group of duplicateGroups) {
      if (processedGroups >= APPLY_GROUP_LIMIT || deleteBudget <= 0) break;
      const patch = mergeIntoWinner(group.winner, group.losers);
      const finalId = patch.fragella_id || stableId(patch.name || '', patch.house || '');
      const oldIds = [group.winner, ...group.losers]
        .map(row => row.fragella_id || row.id)
        .filter(Boolean);
      if (oldIds.length > deleteBudget) break;
      if (!oldIds.length) {
        failed.push(group.key);
        processedGroups += 1;
        continue;
      }

      const tempId = tempMergeId(patch, processedGroups);
      const inserted = await insertRow({ ...patch, fragella_id: tempId }, sbUrl, sbKey);
      if (!inserted.ok) {
        failed.push(`${group.key}:insert`);
        if (errors.length < 6) errors.push({
          action: 'insert',
          key: group.key,
          status: inserted.status,
          detail: inserted.detail,
        });
        processedGroups += 1;
        continue;
      }

      const removed = await deleteByIds(oldIds.slice(0, deleteBudget), sbUrl, sbKey);
      if (removed.ok) {
        deleted += removed.deleted;
        deleteBudget -= oldIds.length;
      } else {
        failed.push(`${group.key}:delete`);
        if (errors.length < 6) errors.push({
          action: 'delete',
          key: group.key,
          status: removed.status,
          detail: removed.detail,
        });
        processedGroups += 1;
        continue;
      }

      const finalized = await patchById(tempId, { ...patch, fragella_id: finalId }, sbUrl, sbKey);
      if (!finalized.ok) {
        failed.push(`${group.key}:finalize`);
        if (errors.length < 6) errors.push({
          action: 'finalize',
          key: group.key,
          id: tempId,
          status: finalized.status,
          detail: finalized.detail,
        });
      } else {
        merged += 1;
      }
      processedGroups += 1;
    }

    const remainingGroups = Math.max(0, duplicateGroups.length - processedGroups);

    return res.status(200).json({
      ok: true,
      dry_run: false,
      capped,
      max_rows: maxRows,
      groups: duplicateGroups.length,
      processed_groups: processedGroups,
      remaining_groups: remainingGroups,
      merged,
      deleted,
      failed,
      errors,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
