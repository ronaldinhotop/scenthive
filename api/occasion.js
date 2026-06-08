// ─────────────────────────────────────────────────────────────────────────────
// POST /api/occasion
// Occasion-aware fragrance recommendation — picks from the user's collection
// (or suggests a buy) based on where they're going.
//
// Body: { occasion, diary, collection, tasteProfile }
// Returns: { recommendation }
// ─────────────────────────────────────────────────────────────────────────────

const MODEL_PRIORITY = [
  'claude-sonnet-4-5',
  'claude-opus-4-5',
  'claude-3-5-sonnet-20241022',
  'claude-haiku-4-5',
  'claude-3-5-haiku-20241022',
];

const OCCASION_META = {
  date:    { label: 'Date Night',    vibe: 'romantic, seductive, and memorable. You want to leave an impression that lingers.' },
  office:  { label: 'Office',        vibe: 'confident and professional — clean, controlled projection that works in close quarters.' },
  sport:   { label: 'Sport / Gym',   vibe: 'fresh, energetic, light-wearing. Nothing heavy — you will be active.' },
  travel:  { label: 'Travel',        vibe: 'versatile and practical. Something that layers well with clothing, packs well mentally.' },
  night:   { label: 'Night Out',     vibe: 'bold, loud, and social. You want presence on a dance floor or at a crowded bar.' },
  casual:  { label: 'Casual',        vibe: 'relaxed and effortless — your go-to that feels like a second skin.' },
  beach:   { label: 'Beach',         vibe: 'light, airy, and summery. Something that works with sun and salt air.' },
  cozy:    { label: 'Cozy Night In', vibe: 'warm, intimate, and comforting — like a blanket for the nose.' },
};

async function pickModel(apiKey) {
  try {
    const r = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    });
    if (!r.ok) return MODEL_PRIORITY[0];
    const { data } = await r.json();
    const ids = (data || []).map(m => m.id);
    for (const m of MODEL_PRIORITY) if (ids.includes(m)) return m;
    if (ids.length) return ids[0];
  } catch {}
  return MODEL_PRIORITY[0];
}

function buildPrompt({ occasion, diary, collection, tasteProfile }) {
  const meta = OCCASION_META[occasion] || { label: occasion, vibe: 'appropriate and enjoyable.' };

  const diaryLines = diary.slice(0, 30).map(e => {
    const stars = e.rating ? `${e.rating}/5` : 'unrated';
    return `  • ${e.fragrance_name || e.name || ''} by ${e.house || ''} (${stars})`;
  }).join('\n') || '  (no diary entries yet)';

  const collectionStr = collection.length
    ? collection.map(b => `${b.name} by ${b.house}`).join(', ')
    : '(no collection yet — suggest something worth buying)';

  const profileStr = tasteProfile
    ? `${tasteProfile.name} — ${tasteProfile.tagline || ''}`
    : 'Not established yet';

  // Avoid recently worn (last 7 days)
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentlyWorn = diary
    .filter(e => e.worn_at && new Date(e.worn_at).getTime() > sevenDaysAgo)
    .map(e => e.fragrance_name || e.name || '');

  const avoidStr = recentlyWorn.length
    ? `Avoid these (worn in last 7 days): ${recentlyWorn.join(', ')}.`
    : '';

  return {
    system: `You are a personal fragrance advisor for ScentHive. You give one specific, opinionated fragrance recommendation based on the user's taste, collection, and the occasion they're preparing for. You respond ONLY with valid JSON.`,
    user: `The user is heading to: ${meta.label}.
The vibe they need: ${meta.vibe}

USER TASTE PROFILE: ${profileStr}

THEIR COLLECTION (pick from here if possible):
${collectionStr}

THEIR DIARY — recent history:
${diaryLines}

${avoidStr}

Give ONE fragrance that fits this occasion perfectly. If they own something ideal, pick that. Otherwise suggest something worth trying that fits both their taste and this occasion.

Respond with this exact JSON:
{
  "name": "Exact Fragrance Name",
  "house": "Exact Brand Name",
  "why": "One confident sentence: why this scent, right now, for this occasion. Reference their taste, the vibe, or something they own/love.",
  "occasion_fit": "brief 3-5 word descriptor of why it fits",
  "in_collection": true or false (true only if it exactly matches one of their collection items),
  "intensity": "light" | "moderate" | "bold"
}`
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Missing ANTHROPIC_KEY' });

  try {
    const { occasion, diary = [], collection = [], tasteProfile = null } = req.body || {};
    if (!occasion) return res.status(400).json({ error: 'occasion required' });

    const model = await pickModel(apiKey);
    const { system, user } = buildPrompt({ occasion, diary, collection, tasteProfile });

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 350,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });

    const data = await resp.json();
    if (!resp.ok) return res.status(502).json({ error: data?.error?.message || 'Anthropic error' });

    const text = (data.content || []).map(b => b.text || '').join('').trim();
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const recommendation = JSON.parse(cleaned);

    return res.status(200).json({ recommendation });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
