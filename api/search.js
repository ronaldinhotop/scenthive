// ─────────────────────────────────────────────────────────────────────────────
// ScentHive /api/search
//
// Strategy (in order):
//   1. Supabase `fragrances_cache` — instant, shared across all users
//   2. Fragella external API        — authoritative, slower, rate-limited
//   3. Upsert Fragella results back into Supabase (fire-and-forget) so every
//      future request benefits from the cache hit.
// ─────────────────────────────────────────────────────────────────────────────

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const QUERY_ALIASES = {
  naxos: 'Xerjoff 1861 Naxos',
  aventus: 'Creed Aventus',
  layton: 'Parfums de Marly Layton',
  herod: 'Parfums de Marly Herod',
  'erba pura': 'Xerjoff Erba Pura',
  'oud wood': 'Tom Ford Oud Wood',
  'tobacco vanille': 'Tom Ford Tobacco Vanille',
  'another 13': 'Le Labo Another 13',
  'santal 33': 'Le Labo Santal 33',
  'baccarat rouge 540': 'Maison Francis Kurkdjian Baccarat Rouge 540'
};

// ─── Scoring ─────────────────────────────────────────────────────────────────

function scoreFragrance(f, query) {
  const q = normalize(query);
  const name = normalize(f.name);
  const house = normalize(f.house);
  const haystack = `${name} ${house}`.trim();
  if (!q || !haystack) return 0;

  let score = 0;
  if (name === q)           score += 120;
  if (haystack === q)       score += 115;
  if (name.startsWith(q))  score += 90;
  if (haystack.startsWith(q)) score += 70;
  if (name.includes(q))    score += 55;
  if (haystack.includes(q)) score += 35;

  const queryTokens   = q.split(' ').filter(Boolean);
  const nameTokens    = name.split(' ').filter(Boolean);
  const haystackTokens = haystack.split(' ').filter(Boolean);

  for (const token of queryTokens) {
    if (nameTokens.includes(token))                     score += 28;
    else if (haystackTokens.includes(token))            score += 18;
    else if (nameTokens.some(t => t.startsWith(token))) score += 12;
  }

  if (queryTokens.length === 1 && nameTokens[0] === q)    score += 20;
  if (queryTokens.length === 1 && house === q && name !== q) score -= 20;
  if (f.image_url) score += 3;
  return score;
}

// ─── Shape normalisation ──────────────────────────────────────────────────────

// Converts a raw Fragella API row → our canonical shape.
function mapFragellaRow(f) {
  return {
    fragella_id: String(f.id || f.ID || ''),
    name:        f.Name  || f.name  || '',
    house:       f.Brand || f.brand || f.house || '',
    family:      Array.isArray(f['Main Accords']) ? f['Main Accords'][0] : (f['Main Accords'] || f.family || ''),
    notes_top:   f['Top Notes']    || f.top_notes    || [],
    notes_heart: f['Middle Notes'] || f.middle_notes || [],
    notes_base:  f['Base Notes']   || f.base_notes   || [],
    accords:     f['Main Accords'] || f.accords       || [],
    longevity:   f.Longevity || f.longevity || '',
    sillage:     f.Sillage  || f.sillage   || '',
    gender:      f.Gender   || f.gender    || '',
    image_url:   f['Image URL'] || f.image_url || f.image || '',
    launch_year: f.Year || f.year || null,
    price_range: f.Price || f.price || '',
    oil_type:    f.OilType || f.oil_type || '',
    'General Notes': f['General Notes'] || []
  };
}

// Supabase rows already match the canonical shape — just alias the field that
// Supabase stores as `id` vs our `fragella_id`.
function mapSupabaseRow(f) {
  return {
    fragella_id: String(f.fragella_id || f.id || ''),
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
    'General Notes': f['General Notes'] || []
  };
}

function getRawRows(data) {
  if (Array.isArray(data))             return data;
  if (Array.isArray(data.data))        return data.data;
  if (Array.isArray(data.fragrances))  return data.fragrances;
  if (Array.isArray(data.results))     return data.results;
  return [];
}

// ─── Ranking ─────────────────────────────────────────────────────────────────

function rankFragrances(rows, query, alreadyMapped = false) {
  const seen = new Set();
  const mapped = rows
    .map(f => alreadyMapped ? f : mapFragellaRow(f))
    .filter(f => {
      const key = normalize(`${f.name} ${f.house}`);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(f => ({ ...f, _score: scoreFragrance(f, query) }));

  const bestScore = Math.max(...mapped.map(f => f._score), 0);
  const filtered = bestScore >= 55
    ? mapped.filter(f => f._score >= Math.max(20, bestScore - 80))
    : mapped;

  filtered.sort((a, b) => b._score - a._score || String(a.name).localeCompare(String(b.name)));
  return { bestScore, fragrances: filtered.map(({ _score, ...f }) => f) };
}

function mergeRanked(primary, secondary) {
  const seen = new Set();
  const merged = [];
  for (const f of [...primary.fragrances, ...secondary.fragrances]) {
    const key = normalize(`${f.name} ${f.house}`);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(f);
  }
  return merged;
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

const SB_HEADERS = (key) => ({
  'apikey': key,
  'Authorization': `Bearer ${key}`,
  'Content-Type': 'application/json',
});

// Query `fragrances_cache` for rows whose name or house contain each word of
// the query. Returns up to 20 rows already in canonical shape.
async function searchSupabaseCache(query, sbUrl, sbKey) {
  const words = normalize(query).split(' ').filter(Boolean);
  if (!words.length) return [];

  // Use the first (most significant) word for the ilike filter to keep the
  // result set broad, then let scoreFragrance handle ranking.
  const word = words[0];
  const filter = `name.ilike.*${word}*,house.ilike.*${word}*`;

  const url = `${sbUrl}/rest/v1/fragrances_cache?or=(${encodeURIComponent(filter)})&limit=20`;
  try {
    const res = await fetch(url, { headers: SB_HEADERS(sbKey) });
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows.map(mapSupabaseRow) : [];
  } catch {
    return [];
  }
}

// Upsert canonical rows into `fragrances_cache`. Fire-and-forget — the caller
// does NOT await this; we return the promise so Node doesn't GC it too early.
function upsertSupabaseCache(rows, sbUrl, sbKey) {
  if (!rows.length) return Promise.resolve();

  // Strip `General Notes` and any non-column extras before upserting.
  const clean = rows.map(({ 'General Notes': _gn, ...r }) => ({
    fragella_id: r.fragella_id,
    name:        r.name,
    house:       r.house,
    family:      r.family,
    notes_top:   r.notes_top,
    notes_heart: r.notes_heart,
    notes_base:  r.notes_base,
    accords:     r.accords,
    longevity:   r.longevity,
    sillage:     r.sillage,
    gender:      r.gender,
    image_url:   r.image_url,
    launch_year: r.launch_year,
    price_range: r.price_range,
    oil_type:    r.oil_type,
  })).filter(r => r.fragella_id && r.name);

  return fetch(`${sbUrl}/rest/v1/fragrances_cache`, {
    method: 'POST',
    headers: {
      ...SB_HEADERS(sbKey),
      'Prefer': 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(clean),
  }).catch(() => {}); // swallow — cache write failure is non-fatal
}

// ─── Fragella API ─────────────────────────────────────────────────────────────

async function fetchFragella(query, apiKey) {
  const url = 'https://api.fragella.com/api/v1/fragrances?search='
    + encodeURIComponent(query) + '&limit=12';
  const response = await fetch(url, {
    headers: { 'x-api-key': apiKey, 'Accept': 'application/json' }
  });
  const text = await response.text();
  if (!response.ok) {
    const err = new Error('Fragella ' + response.status);
    err.status = response.status;
    throw err;
  }
  return getRawRows(JSON.parse(text));
}

// ─── Handler ──────────────────────────────────────────────────────────────────

// How many Supabase hits (with a decent score) we need before skipping Fragella.
const CACHE_SUFFICIENT_COUNT = 3;
const CACHE_SUFFICIENT_SCORE = 35;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed', fragrances: [] });

  try {
    const { query } = req.body || {};
    if (!query) return res.status(400).json({ error: 'No query', fragrances: [] });

    const fragellaKey = process.env.FRAGELLA_API_KEY;
    const sbUrl       = process.env.SUPABASE_URL;
    const sbKey       = process.env.SUPABASE_ANON_KEY;

    const normalizedQuery = normalize(query);
    const alias = QUERY_ALIASES[normalizedQuery];

    // ── 1. Supabase cache lookup ──────────────────────────────────────────────
    let cacheRanked = { bestScore: 0, fragrances: [] };

    if (sbUrl && sbKey) {
      const cacheRows = await searchSupabaseCache(query, sbUrl, sbKey);

      // For aliases, also search the alias term and merge
      if (alias) {
        const aliasRows = await searchSupabaseCache(alias, sbUrl, sbKey);
        const merged = [...cacheRows];
        const seen = new Set(cacheRows.map(f => normalize(`${f.name} ${f.house}`)));
        for (const f of aliasRows) {
          const key = normalize(`${f.name} ${f.house}`);
          if (!seen.has(key)) { seen.add(key); merged.push(f); }
        }
        cacheRanked = rankFragrances(merged, alias || query, true);
      } else {
        cacheRanked = rankFragrances(cacheRows, query, true);
      }
    }

    const cacheGoodEnough = (
      cacheRanked.fragrances.length >= CACHE_SUFFICIENT_COUNT &&
      cacheRanked.bestScore >= CACHE_SUFFICIENT_SCORE
    );

    // ── 2. Return cache if sufficient ────────────────────────────────────────
    if (cacheGoodEnough) {
      return res.status(200).json({
        fragrances: cacheRanked.fragrances,
        source: 'cache',
      });
    }

    // ── 3. Fragella API fallback ──────────────────────────────────────────────
    if (!fragellaKey) {
      // No Fragella key — return whatever cache we have (even if thin)
      return res.status(200).json({
        fragrances: cacheRanked.fragrances,
        source: 'cache',
        warning: 'Missing FRAGELLA_API_KEY',
      });
    }

    let fragellaRanked = { bestScore: 0, fragrances: [] };

    if (alias) {
      const [raw, aliasRaw] = await Promise.all([
        fetchFragella(query, fragellaKey),
        fetchFragella(alias, fragellaKey),
      ]);
      const aliasRanked = rankFragrances(aliasRaw, alias);
      const queryRanked = rankFragrances(raw, query);
      fragellaRanked.fragrances = mergeRanked(aliasRanked, queryRanked);
      fragellaRanked.bestScore  = Math.max(aliasRanked.bestScore, queryRanked.bestScore);
    } else {
      fragellaRanked = rankFragrances(await fetchFragella(query, fragellaKey), query);
    }

    // ── 4. Write Fragella results back to Supabase (fire-and-forget) ─────────
    if (sbUrl && sbKey && fragellaRanked.fragrances.length) {
      upsertSupabaseCache(fragellaRanked.fragrances, sbUrl, sbKey);
      // intentionally not awaited — response is already ready
    }

    // ── 5. Merge: Fragella primary, cache fills any gaps ─────────────────────
    const final = mergeRanked(fragellaRanked, cacheRanked);
    return res.status(200).json({ fragrances: final, source: 'fragella' });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unknown error', fragrances: [] });
  }
}
