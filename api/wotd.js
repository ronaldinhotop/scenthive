// ─────────────────────────────────────────────────────────────────────────────
// POST /api/wotd
// What to wear today — weather-aware fragrance recommendation.
//
// Body: { lat, lon, diary, collection, tasteProfile, country }
// Returns: { weather, recommendation, cached }
// ─────────────────────────────────────────────────────────────────────────────

const MODEL_PRIORITY = [
  'claude-sonnet-4-5',
  'claude-opus-4-5',
  'claude-3-5-sonnet-20241022',
  'claude-haiku-4-5',
  'claude-3-5-haiku-20241022',
];

// WMO weather codes → human description + scent context
function decodeWeather(code, temp) {
  const c = Number(code);
  let condition = 'clear';
  let scent_context = 'clear skies';

  if (c === 0)                       { condition = 'sunny';      scent_context = 'bright sunshine'; }
  else if (c <= 3)                   { condition = 'cloudy';     scent_context = 'overcast skies'; }
  else if (c <= 48)                  { condition = 'foggy';      scent_context = 'heavy fog and mist'; }
  else if (c <= 55)                  { condition = 'drizzle';    scent_context = 'light drizzle'; }
  else if (c <= 65)                  { condition = 'rain';       scent_context = 'steady rain'; }
  else if (c <= 75)                  { condition = 'snow';       scent_context = 'snowfall'; }
  else if (c <= 82)                  { condition = 'showers';    scent_context = 'passing rain showers'; }
  else if (c === 95 || c === 96 || c === 99) { condition = 'storm'; scent_context = 'thunderstorm'; }

  const feel = temp <= 0   ? 'freezing'
             : temp <= 8   ? 'cold'
             : temp <= 15  ? 'cool'
             : temp <= 22  ? 'mild'
             : temp <= 28  ? 'warm'
             : 'hot';

  return { condition, scent_context, feel };
}

async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&forecast_days=1&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Weather fetch failed');
  const d = await r.json();
  const temp = Math.round(d.current.temperature_2m);
  const code = d.current.weather_code;
  const { condition, scent_context, feel } = decodeWeather(code, temp);
  return { temp, condition, scent_context, feel, code };
}

async function fetchCity(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    const r = await fetch(url, { headers: { 'User-Agent': 'ScentHive/1.0 contact@scenthive.app' } });
    if (!r.ok) return null;
    const d = await r.json();
    return d.address?.city || d.address?.town || d.address?.village || d.address?.county || null;
  } catch {
    return null;
  }
}

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

function buildPrompt({ weather, city, diary, collection, tasteProfile }) {
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const cityStr = city ? ` in ${city}` : '';

  const diaryLines = diary.slice(0, 30).map(e => {
    const stars = e.rating ? `${e.rating}/5` : 'unrated';
    const worn = e.worn_at ? new Date(e.worn_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
    return `  • ${e.fragrance_name || e.name || ''} by ${e.house || ''} (${stars})${worn ? ' — worn ' + worn : ''}`;
  }).join('\n') || '  (no diary entries yet)';

  const collectionList = collection.map(b => `${b.name} by ${b.house}`);
  const collectionStr = collectionList.length
    ? collectionList.join(', ')
    : '(no collection yet — suggest something worth buying)';

  const profileStr = tasteProfile
    ? `${tasteProfile.name} — ${tasteProfile.tagline || ''}`
    : 'Not established yet';

  // Find recently worn (last 7 days) to avoid suggesting them
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentlyWorn = diary
    .filter(e => e.worn_at && new Date(e.worn_at).getTime() > sevenDaysAgo)
    .map(e => e.fragrance_name || e.name || '');

  const avoidStr = recentlyWorn.length
    ? `Avoid these (worn in last 7 days): ${recentlyWorn.join(', ')}.`
    : '';

  return {
    system: `You are a personal fragrance advisor for ScentHive. You give one specific, opinionated fragrance recommendation for today based on the user's taste, collection, and current weather. You respond ONLY with valid JSON.`,
    user: `It is ${timeOfDay}${cityStr}. The weather is ${weather.feel} and ${weather.scent_context} (${weather.temp}°C).

USER TASTE PROFILE: ${profileStr}

THEIR COLLECTION (pick from here if possible):
${collectionStr}

THEIR DIARY — recent history:
${diaryLines}

${avoidStr}

Give ONE specific fragrance recommendation for right now. If they own something perfect, pick that. Otherwise suggest something worth trying that fits their taste.

Respond with this exact JSON:
{
  "name": "Exact Fragrance Name",
  "house": "Exact Brand Name",
  "why": "One confident sentence: why this scent, right now, for this weather. Reference their taste or something they own/love.",
  "weather_fit": "brief 3-5 word descriptor of why it fits the weather",
  "in_collection": true or false (true only if it exactly matches one of their collection items),
  "season_tags": ["cool", "rainy"] (pick all that apply from: sunny, hot, warm, cool, cold, rainy, snowy, foggy, morning, evening)
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
    const { lat, lon, diary = [], collection = [], tasteProfile = null } = req.body || {};

    // Weather (required)
    if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });

    const [weather, city, model] = await Promise.all([
      fetchWeather(lat, lon),
      fetchCity(lat, lon),
      pickModel(apiKey),
    ]);

    const { system, user } = buildPrompt({ weather, city, diary, collection, tasteProfile });

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });

    const data = await resp.json();
    if (!resp.ok) return res.status(502).json({ error: data?.error?.message || 'Anthropic error' });

    const text = (data.content || []).map(b => b.text || '').join('').trim();
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const recommendation = JSON.parse(cleaned);

    return res.status(200).json({
      weather: { temp: weather.temp, condition: weather.condition, feel: weather.feel, city },
      recommendation,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
