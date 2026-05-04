// ─────────────────────────────────────────────────────────────────────────────
// POST /api/seed
//
// One-shot cache warmer. Call it once after deploy to pre-populate
// `fragrances_cache` with every fragrance used in the hardcoded home shelves.
// After this runs, /api/search serves all shelf requests from Supabase —
// zero Fragella API calls for any pooled fragrance.
//
// Protected by SEED_SECRET env var:
//   curl -X POST https://scenthive-ten.vercel.app/api/seed \
//        -H "Content-Type: application/json" \
//        -d '{"secret":"<SEED_SECRET>"}'
// ─────────────────────────────────────────────────────────────────────────────

// All unique fragrance names used across every home shelf pool.
// Keep in sync with app.js pools.
const SEED_NAMES = [
  // newReleasePool
  'Dior Homme Parfum 2025', 'Valentino Uomo Born in Roma Extradose',
  'YSL Myslf Le Parfum', 'Bleu de Chanel L Exclu',
  'Sauvage Eau Forte Dior', 'Tom Ford Black Lacquer',
  'Aventus Absolu Creed', 'Le Male Elixir Absolu Jean Paul Gaultier',
  'Rabanne Million Gold', 'Boss Bottled Absolu',
  'Burberry Goddess Intense', 'Gucci Flora Gorgeous Orchid',
  'Libre Flowers Flames YSL', 'Devotion Intense Dolce Gabbana',

  // dailyPool
  'Gris Charnel BDK', 'Mojave Ghost Byredo', 'Philosykos Diptyque',
  'Another 13 Le Labo', 'Gentle Fluidity Silver Maison Francis Kurkdjian',
  'Lira Xerjoff', 'Ani Nishane', 'Hacivat Nishane',
  'Delina Parfums de Marly', 'Layton Parfums de Marly',
  'Molecule 01 Escentric Molecules', 'Musc Ravageur Frederic Malle',
  'Carnal Flower Frederic Malle', 'Tam Dao Diptyque',
  'Angels Share Kilian', 'Greenley Parfums de Marly',
  'Wulong Cha Nishane', 'Grand Soir Maison Francis Kurkdjian',
  'Ganymede Marc-Antoine Barrois', 'Naxos Xerjoff',
  'Santal 33 Le Labo', 'Oud Satin Mood Maison Francis Kurkdjian',
  'Ambre Nuit Dior', 'Imagination Louis Vuitton',

  // darkPool
  'Tobacco Vanille Tom Ford', 'Encre Noire Lalique', 'Black Orchid Tom Ford',
  'Interlude Man Amouage', 'Oud Wood Tom Ford', 'Lost Cherry Tom Ford',
  'Dior Homme Intense', 'Sauvage Elixir Dior', 'Black Afgano Nasomatto',
  'M7 Oud Absolu YSL', 'Kilian Black Phantom', 'Memoir Man Amouage',
  'Fahrenheit Dior', 'Sycomore Chanel', 'Jazz Club Maison Margiela',
  'Herod Parfums de Marly', 'Vetiver Guerlain', 'Pour Homme Yves Saint Laurent',

  // orientalPool
  'Baccarat Rouge 540 Maison Francis Kurkdjian', 'Love Don\'t Be Shy Kilian',
  'Good Girl Carolina Herrera', 'La Nuit de l\'Homme YSL',
  'Black Opium YSL', 'Elixir Tom Ford',
  'Bal d\'Afrique Byredo', 'Portrait of a Lady Frederic Malle',
  'Libre YSL', 'Flowerbomb Viktor Rolf',
  'Shalimar Guerlain', 'Opium YSL',
  'Spicebomb Viktor Rolf', 'Kenzo Amour',

  // freshPool
  'Bleu de Chanel EDP', 'Acqua di Gio Profumo', 'Y EDP YSL',
  'Erba Pura Xerjoff', 'Light Blue Dolce', 'Terre Hermes',
  'Reflection Man Amouage', 'Viking Creed', 'Silver Mountain Water Creed',
  'Bvlgari Man in Black', 'Neroli Portofino Tom Ford',
  'Lime Basil Mandarin Jo Malone', 'Kouros YSL', 'Dior Homme Eau',
  'Cool Water Davidoff', 'L\'Eau d\'Issey Issey Miyake',

  // popularShelf
  'Sauvage Dior', 'Aventus Creed', 'Baccarat Rouge 540',
  'Naxos Xerjoff', 'Oud Wood Tom Ford', 'Bleu de Chanel',

  // nicheGatewayPool
  'Portrait of a Lady Frederic Malle',
];

// Deduplicate
const UNIQUE_NAMES = [...new Set(SEED_NAMES)];

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

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
  };
}

function getRawRows(data) {
  if (Array.isArray(data))            return data;
  if (Array.isArray(data.data))       return data.data;
  if (Array.isArray(data.fragrances)) return data.fragrances;
  if (Array.isArray(data.results))    return data.results;
  return [];
}

async function fetchFragella(query, apiKey) {
  const url = 'https://api.fragella.com/api/v1/fragrances?search='
    + encodeURIComponent(query) + '&limit=5';
  const res = await fetch(url, {
    headers: { 'x-api-key': apiKey, 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error('Fragella ' + res.status + ' for ' + query);
  return getRawRows(await res.json());
}

async function upsertBatch(rows, sbUrl, sbKey) {
  if (!rows.length) return;
  const res = await fetch(`${sbUrl}/rest/v1/fragrances_cache`, {
    method: 'POST',
    headers: {
      'apikey': sbKey,
      'Authorization': `Bearer ${sbKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Supabase upsert failed: ' + txt.slice(0, 200));
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'POST only' });

  // Guard with a secret so it can't be triggered by random crawlers.
  const secret = process.env.SEED_SECRET;
  const { secret: provided } = req.body || {};
  if (secret && provided !== secret)
    return res.status(401).json({ error: 'Unauthorized' });

  const fragellaKey = process.env.FRAGELLA_API_KEY;
  const sbUrl       = process.env.SUPABASE_URL;
  const sbKey       = process.env.SUPABASE_ANON_KEY;

  if (!fragellaKey) return res.status(500).json({ error: 'Missing FRAGELLA_API_KEY' });
  if (!sbUrl || !sbKey) return res.status(500).json({ error: 'Missing Supabase env vars' });

  const results = { seeded: 0, skipped: 0, errors: [] };
  const batchRows = [];

  for (let i = 0; i < UNIQUE_NAMES.length; i++) {
    const name = UNIQUE_NAMES[i];
    try {
      // Check if already cached before hitting Fragella
      const word = normalize(name).split(' ')[0];
      const checkUrl = `${sbUrl}/rest/v1/fragrances_cache?name=ilike.*${encodeURIComponent(word)}*&limit=1`;
      const checkRes = await fetch(checkUrl, {
        headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` }
      });
      if (checkRes.ok) {
        const existing = await checkRes.json();
        if (Array.isArray(existing) && existing.length > 0) {
          results.skipped++;
          continue;
        }
      }

      // Not cached — fetch from Fragella
      const raw = await fetchFragella(name, fragellaKey);
      const mapped = raw
        .map(mapFragellaRow)
        .filter(f => f.fragella_id && f.name);
      batchRows.push(...mapped);
      results.seeded += mapped.length;

      // Flush every 10 rows to avoid oversized payloads
      if (batchRows.length >= 10) {
        await upsertBatch(batchRows.splice(0), sbUrl, sbKey);
      }

      // 200ms between Fragella calls — stay well under rate limits
      await sleep(200);
    } catch (err) {
      results.errors.push({ name, error: err.message });
    }
  }

  // Flush remainder
  if (batchRows.length) {
    try { await upsertBatch(batchRows, sbUrl, sbKey); }
    catch (err) { results.errors.push({ name: 'final_flush', error: err.message }); }
  }

  return res.status(200).json({
    message: 'Seed complete',
    total: UNIQUE_NAMES.length,
    ...results,
  });
}
