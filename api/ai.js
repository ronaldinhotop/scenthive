// Prefer accuracy over speed — Sonnet before Haiku
const MODEL_PRIORITY = [
  'claude-sonnet-4-5',
  'claude-opus-4-5',
  'claude-3-5-sonnet-20241022',
  'claude-haiku-4-5',
  'claude-3-5-haiku-20241022',
  'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307',
];

const SYSTEM_PROMPT = `You are a world-class fragrance expert with encyclopaedic knowledge of perfumery.

CRITICAL RULES — you must follow these exactly:
1. Respond ONLY with valid JSON, no markdown, no extra text.
2. Every "name" must be the EXACT official fragrance name.
3. Every "house" must be the EXACT official brand/house name. Never confuse houses. Double-check before answering.
4. Only recommend real, commercially available fragrances that actually exist.
5. If recommending dupes, they must genuinely smell similar — not just share a note.
6. Notes must be real notes found in that fragrance, not invented.

JSON format:
{
  "intro": "one sentence overview",
  "recommendations": [
    {
      "name": "Exact Fragrance Name",
      "house": "Exact House Name",
      "why": "specific reason this fits the request",
      "notes": ["Note1", "Note2", "Note3"],
      "occasion": "when to wear",
      "price": "$XX–$XX per 100ml",
      "is_dupe": false
    }
  ]
}`;

function buildPersonalPrompt(diary, collection, wishlist, tasteProfile, topFamilies) {
  const diaryLines = diary.slice(0, 40).map(e => {
    const stars = e.rating ? `${e.rating}/5` : 'unrated';
    const note = e.notes ? ` — "${String(e.notes).slice(0, 80)}"` : '';
    return `  • ${e.name || e.fragrance_name || ''} by ${e.house || ''} (${stars})${note}`;
  }).join('\n') || '  (none logged yet)';

  const collectionLines = collection.length
    ? collection.map(b => `  • ${b.name || ''} by ${b.house || ''}`).join('\n')
    : '  (none logged yet)';

  const wishlistLines = wishlist.length
    ? wishlist.map(w => `  • ${w.name || ''} by ${w.house || ''}`).join('\n')
    : '  (empty)';

  const profileLine = tasteProfile
    ? `${tasteProfile.name || 'Unknown'} — ${tasteProfile.tagline || ''}${Array.isArray(tasteProfile.traits) ? ` (${tasteProfile.traits.join(', ')})` : ''}`
    : 'Not yet determined';

  return `You are a personal fragrance advisor with encyclopaedic knowledge of perfumery. You know this user's taste because you have access to their real fragrance history.

THEIR SCENT IDENTITY: ${profileLine}
TOP FRAGRANCE FAMILIES: ${topFamilies || 'Unknown'}

THEIR DIARY (${diary.length} fragrances logged, most recent first):
${diaryLines}

THEIR COLLECTION (bottles they own — do not recommend these):
${collectionLines}

THEIR WISHLIST:
${wishlistLines}

RULES:
1. Respond ONLY with valid JSON, no markdown, no extra text.
2. Start your intro by referencing something specific from their diary or taste.
3. Every recommendation must be a real fragrance that exists.
4. Never recommend something they already own.
5. Use high ratings as preference signals and low ratings as dislike signals.
6. Mention fragrances they've logged by name when explaining why a recommendation fits.
7. Max 5 recommendations.

JSON format:
{
  "intro": "one sentence that references something specific from their history",
  "recommendations": [
    {
      "name": "Exact Fragrance Name",
      "house": "Exact House Name",
      "why": "specific reason based on their actual diary/taste",
      "notes": ["Note1", "Note2", "Note3"],
      "occasion": "when to wear",
      "price": "$XX–$XX per 100ml",
      "is_dupe": false
    }
  ]
}`;
}

let _cachedModel = null;

async function pickModel(apiKey) {
  if (_cachedModel) return _cachedModel;
  try {
    const r = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    });
    if (!r.ok) return MODEL_PRIORITY[0];
    const { data } = await r.json();
    const ids = (data || []).map(m => m.id);
    for (const m of MODEL_PRIORITY) {
      if (ids.includes(m)) { _cachedModel = m; return m; }
    }
    if (ids.length) { _cachedModel = ids[0]; return ids[0]; }
  } catch {}
  return MODEL_PRIORITY[0];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const prompt = body.prompt || 'recommend a fragrance';
    const collection = body.collection || [];
    const diary = body.diary || [];
    const wishlist = body.wishlist || [];
    const tasteProfile = body.tasteProfile || null;
    const topFamilies = body.topFamilies || null;
    const usePersonal = Array.isArray(diary) && diary.length > 0;
    const system = usePersonal
      ? buildPersonalPrompt(diary, collection, wishlist, tasteProfile, topFamilies)
      : (body.system || SYSTEM_PROMPT);

    const colCtx = !usePersonal && collection.length > 0
      ? '\n\nUser currently owns: ' + collection.map(b => b.name + ' by ' + b.house).join(', ') + '. Avoid recommending these.'
      : '';

    const apiKey = process.env.ANTHROPIC_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing ANTHROPIC_KEY — add it in Vercel → Project → Settings → Environment Variables.' });
    }

    const model = await pickModel(apiKey);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system,
        messages: [{ role: 'user', content: prompt + colCtx }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const msg = data?.error?.message || data?.error?.type || JSON.stringify(data).slice(0, 400);
      return res.status(502).json({ error: `Anthropic ${response.status} (model: ${model}): ${msg}`, model });
    }

    if (data.error) {
      return res.status(500).json({ error: 'Anthropic: ' + data.error.message });
    }

    const text = (data.content || []).map(b => b.text || '').join('');
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
      const parsed = JSON.parse(cleaned);
      return res.status(200).json(parsed);
    } catch (e) {
      return res.status(500).json({ error: 'Parse error: ' + e.message, raw: cleaned.substring(0, 200) });
    }

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
