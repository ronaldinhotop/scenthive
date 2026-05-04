'use strict';

// ═══════ CONFIG ═══════
const SB_URL = 'https://razsffndadhxlqvvmjrr.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhenNmZm5kYWRoeGxxdnZtanJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NTI2ODIsImV4cCI6MjA5MjAyODY4Mn0.2B73ncLA5iPPZTvCZ4k-fv85p2dgwi4-JwFJjS0ZU7s';
const SEARCH_URL = '/api/search';

const sb = supabase.createClient(SB_URL, SB_KEY);

// ═══════ STATE ═══════
let user = null;
let collection = [];
let diary = [];
let authMode = 'signin';
let logRating = 0;
let prevScreen = 'home';
let curScreen = 'auth';
let searchTimer = null;
let fragStore = {};

// ═══════ NAV BUILDER ═══════
function buildNav(active) {
  const tabs = [
    { id: 'home', label: 'Home', svg: '<path d="M3 9l7-6 7 6v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9z" stroke="currentColor" stroke-width="1.5"/><path d="M8 20v-6h4v6" stroke="currentColor" stroke-width="1.5"/>' },
    { id: 'diary', label: 'Diary', svg: '<rect x="4" y="3" width="12" height="14" rx="1" stroke="currentColor" stroke-width="1.5"/><path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' },
    { id: '_log_', label: '', svg: '' },
    { id: 'collection', label: 'Hive', svg: '<rect x="3" y="5" width="14" height="11" rx="1" stroke="currentColor" stroke-width="1.5"/><path d="M7 5V4a1 1 0 011-1h4a1 1 0 011 1v1" stroke="currentColor" stroke-width="1.5"/>' },
    { id: 'profile', label: 'Profile', svg: '<circle cx="10" cy="7" r="3" stroke="currentColor" stroke-width="1.5"/><path d="M3 17c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' }
  ];
  return tabs.map(t => {
    if (t.id === '_log_') {
      return '<button class="bnav-btn bnav-log" data-act="log"><span class="log-circle">+</span></button>';
    }
    const cls = (t.id === active) ? 'bnav-btn active' : 'bnav-btn';
    return `<button class="${cls}" data-tab="${t.id}"><svg width="20" height="20" viewBox="0 0 20 20" fill="none">${t.svg}</svg>${t.label}</button>`;
  }).join('');
}

function injectNavs() {
  const map = { 'nav-home': 'home', 'nav-diary': 'diary', 'nav-collection': 'collection', 'nav-profile': 'profile' };
  Object.keys(map).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = buildNav(map[id]);
  });
  // Wire up clicks
  document.querySelectorAll('.bnav-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const tab = this.getAttribute('data-tab');
      const act = this.getAttribute('data-act');
      if (act === 'log') openLog();
      else if (tab) showTab(tab);
    });
  });
}

// ═══════ NAVIGATION ═══════
function showScreen(id) {
  prevScreen = curScreen;
  curScreen = id;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('screen-' + id);
  if (target) target.classList.add('active');
  window.scrollTo(0, 0);
  // Update global topnav active state
  document.querySelectorAll('.gtnav-link[data-tab]').forEach(l => {
    l.classList.toggle('active', l.getAttribute('data-tab') === id);
  });
  // Show/hide global topnav on auth/article screens
  const gtnav = document.getElementById('global-topnav');
  if (gtnav) gtnav.style.display = (id === 'auth' || id === 'article') ? 'none' : '';
  // Update avatar initial
  const av = document.getElementById('gtnav-avatar');
  if (av && typeof user !== 'undefined' && user) {
    const name = user.user_metadata?.name || user.email || 'U';
    av.textContent = name[0].toUpperCase();
  }
}

function showTab(id) {
  showScreen(id);
  if (id === 'diary') renderDiary();
  if (id === 'collection') renderCollection();
  if (id === 'profile') renderProfile();
  if (id === 'home') renderHome();
}

function goBack() { showScreen(prevScreen || 'home') }
function goToProfile() { showTab('profile') }

// ═══════ AUTH ═══════
function setAuthMode(mode) {
  authMode = mode;
  document.getElementById('tab-signin').classList.toggle('active', mode === 'signin');
  document.getElementById('tab-signup').classList.toggle('active', mode === 'signup');
  document.getElementById('auth-name').style.display = mode === 'signup' ? 'block' : 'none';
  document.getElementById('auth-btn').textContent = mode === 'signup' ? 'Create account' : 'Sign in';
  document.getElementById('auth-msg').textContent = '';
}

function setMsg(text, cls) {
  const el = document.getElementById('auth-msg');
  el.textContent = text;
  el.className = 'auth-msg ' + (cls || '');
}

async function handleAuth() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const name = document.getElementById('auth-name').value.trim();
  const btn = document.getElementById('auth-btn');
  if (!email || !password) { setMsg('Please fill in all fields.', 'error'); return; }
  btn.disabled = true;
  btn.textContent = 'Please wait…';
  try {
    if (authMode === 'signup') {
      const { error } = await sb.auth.signUp({ email, password, options: { data: { name: name || email.split('@')[0] } } });
      if (error) throw error;
      const { data, error: e2 } = await sb.auth.signInWithPassword({ email, password });
      if (!e2 && data.user) {
        user = data.user;
        await initApp();
        setTimeout(() => toast('🐝 Welcome to the hive! Start by logging what you\'re wearing today.'), 800);
      } else setMsg('Account created! Please sign in.', 'success');
    } else {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      user = data.user;
      await initApp();
    }
  } catch (e) {
    setMsg(e.message || 'Something went wrong.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = authMode === 'signup' ? 'Create account' : 'Sign in';
  }
}

function enterAsGuest() {
  user = null;
  try {
    diary = JSON.parse(localStorage.getItem('sh_diary') || '[]');
    collection = JSON.parse(localStorage.getItem('sh_collection') || '[]');
  } catch (e) { diary = []; collection = []; }
  loadWishlist();
  showTab('home');
  updateHero();
  loadCommunityFeed();
  updateRightSidebar();
}

async function initApp() {
  await Promise.all([loadCollection(), loadDiary()]);
  loadWishlist();
  showTab('home');
  updateHero();
  maybeShowOnboarding();
}

async function doSignOut() {
  await sb.auth.signOut();
  user = null;
  diary = [];
  collection = [];
  closeModal('modal-settings');
  showScreen('auth');
}

// ═══════ DATA ═══════
async function loadCollection() {
  if (!user) {
    try { collection = JSON.parse(localStorage.getItem('sh_collection') || '[]'); } catch (e) { collection = []; }
    return;
  }
  try {
    const { data } = await sb.from('collection').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (data) collection = data;
  } catch (e) { collection = []; }
}

async function loadDiary() {
  if (!user) {
    try { diary = JSON.parse(localStorage.getItem('sh_diary') || '[]'); } catch (e) { diary = []; }
    return;
  }
  try {
    const { data } = await sb.from('journal_entries').select('*').eq('user_id', user.id).order('worn_at', { ascending: false }).limit(500);
    if (data) diary = data;
  } catch (e) { diary = []; }
}

function saveLocal() {
  try {
    localStorage.setItem('sh_diary', JSON.stringify(diary));
    localStorage.setItem('sh_collection', JSON.stringify(collection));
  } catch (e) {}
}

// ═══════ RECENTLY VIEWED ═══════
const RECENTS_KEY = 'sh_recents';
const RECENTS_MAX = 12;

function saveRecent(f) {
  if (!f || !f.name) return;
  try {
    const stored = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
    const key = (f.name + '||' + (f.house || '')).toLowerCase();
    const filtered = stored.filter(r =>
      (r.name + '||' + (r.house || '')).toLowerCase() !== key
    );
    const slim = {
      name: f.name,
      house: f.house || '',
      image_url: f.image_url || null,
      fragella_id: f.fragella_id || null,
      family: f.family || '',
      accords: Array.isArray(f.accords || f['Main Accords']) ? (f.accords || f['Main Accords']).slice(0, 5) : [],
      notes_top: Array.isArray(f.notes_top || f['Top Notes']) ? (f.notes_top || f['Top Notes']).slice(0, 4) : [],
      notes_heart: Array.isArray(f.notes_heart || f['Middle Notes']) ? (f.notes_heart || f['Middle Notes']).slice(0, 4) : [],
      notes_base: Array.isArray(f.notes_base || f['Base Notes']) ? (f.notes_base || f['Base Notes']).slice(0, 4) : []
    };
    filtered.unshift(slim);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(filtered.slice(0, RECENTS_MAX)));
  } catch (e) {}
}

function loadRecents() {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]'); } catch (e) { return []; }
}

function clearRecents() {
  try { localStorage.removeItem(RECENTS_KEY); } catch (e) {}
}

// ═══════ HOME ═══════
async function updateRightSidebar() {
  const rsl = document.getElementById('rs-logged');
  const rsc = document.getElementById('rs-collection');
  const rsr = document.getElementById('rs-recent');
  if(rsl) rsl.textContent = diary.length;
  if(rsc) rsc.textContent = collection.length;
  if(rsr && diary.length > 0) {
    rsr.innerHTML = diary.slice(0,3).map(e => `
      <div style="background:var(--bg2);padding:10px 12px;cursor:pointer">
        <div style="font-family:'Playfair Display',serif;font-size:13px;font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(e.fragrance_name)}</div>
        <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--gold);letter-spacing:0.06em;margin-top:2px">${e.rating ? '★'.repeat(e.rating) : ''}</div>
      </div>
    `).join('');
  } else if(rsr) {
    rsr.innerHTML = '<div style="padding:12px;font-size:12px;color:var(--grey);font-style:italic">Nothing logged yet</div>';
  }
}

async function renderHome() {
  updateHero();
  renderContinueStrip();
  renderRecentsShelf();
  renderSimilarRecentShelf();
  renderTasteModule();
  renderForYouShelf();

  // Recently worn by you
  const sectionYours = document.getElementById('section-recent-yours');
  const shelfYours = document.getElementById('shelf-yours');
  if (sectionYours && shelfYours && user && diary.length > 0) {
    sectionYours.style.display = '';
    const unique = [];
    const seen = new Set();
    for (const e of diary) {
      const k = (e.fragrance_name || '').toLowerCase();
      if (!seen.has(k)) { seen.add(k); unique.push(e); }
      if (unique.length >= 8) break;
    }
    shelfYours.innerHTML = unique.map(e => {
      const key = 'yo' + Math.random().toString(36).slice(2,7);
      fragStore[key] = { name: e.fragrance_name, house: e.house, image_url: e.image_url };
      const nm = escapeHtml(e.fragrance_name || '');
      const hs = escapeHtml(e.house || '');
      const imgHtml = e.image_url ? makeImg(e.image_url, nm) : '<div class="poster-card-emoji">🏺</div>';
      return '<div class="poster-card" data-key="' + key + '">' +
        '<div class="poster-card-img">' + imgHtml +
        '<div class="poster-card-info"><div class="poster-card-name">' + nm + '</div><div class="poster-card-house">' + hs + '</div></div>' +
        '</div></div>';
    }).join('');
    shelfYours.querySelectorAll('.poster-card').forEach(c =>
      c.addEventListener('click', () => openFrag(c.getAttribute('data-key')))
    );
  } else if (sectionYours) {
    sectionYours.style.display = 'none';
  }

  const newReleasePool = [
    'Dior Homme Parfum 2025', 'Valentino Uomo Born in Roma Extradose',
    'YSL Myslf Le Parfum', 'Bleu de Chanel L Exclu',
    'Sauvage Eau Forte Dior', 'Tom Ford Black Lacquer',
    'Aventus Absolu Creed', 'Le Male Elixir Absolu Jean Paul Gaultier',
    'Rabanne Million Gold', 'Boss Bottled Absolu',
    'Burberry Goddess Intense', 'Gucci Flora Gorgeous Orchid',
    'Libre Flowers Flames YSL', 'Devotion Intense Dolce Gabbana'
  ];

  const dailyPool = [
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
    'Ambre Nuit Dior', 'Imagination Louis Vuitton'
  ];

  loadPopularShelf();

  const darkPool = [
    'Tobacco Vanille Tom Ford', 'Encre Noire Lalique', 'Black Orchid Tom Ford',
    'Interlude Man Amouage', 'Oud Wood Tom Ford', 'Lost Cherry Tom Ford',
    'Dior Homme Intense', 'Sauvage Elixir Dior', 'Black Afgano Nasomatto',
    'M7 Oud Absolu YSL', 'Kilian Black Phantom', 'Memoir Man Amouage',
    'Fahrenheit Dior', 'Sycomore Chanel', 'Jazz Club Maison Margiela',
    'Herod Parfums de Marly', 'Vetiver Guerlain', 'Pour Homme Yves Saint Laurent'
  ];
  const orientalPool = [
    'Baccarat Rouge 540 Maison Francis Kurkdjian', 'Love Don\'t Be Shy Kilian',
    'Good Girl Carolina Herrera', 'La Nuit de l\'Homme YSL',
    'Black Opium YSL', 'Elixir Tom Ford',
    'Bal d\'Afrique Byredo', 'Portrait of a Lady Frederic Malle',
    'Libre YSL', 'Flowerbomb Viktor Rolf',
    'Shalimar Guerlain', 'Opium YSL',
    'Musc Ravageur Frederic Malle', 'Ambre Nuit Dior',
    'Spicebomb Viktor Rolf', 'Kenzo Amour'
  ];
  const freshPool = [
    'Bleu de Chanel EDP', 'Acqua di Gio Profumo', 'Y EDP YSL',
    'Erba Pura Xerjoff', 'Light Blue Dolce', 'Terre Hermes',
    'Reflection Man Amouage', 'Viking Creed', 'Silver Mountain Water Creed',
    'Bvlgari Man in Black', 'Neroli Portofino Tom Ford',
    'Lime Basil Mandarin Jo Malone', 'Kouros YSL', 'Dior Homme Eau',
    'Cool Water Davidoff', 'L\'Eau d\'Issey Issey Miyake'
  ];
  const shuffle = arr => arr.slice().sort(() => Math.random() - 0.5);
  const dailyPick = arr => {
    const dateKey = new Date().toISOString().slice(0, 10);
    let seed = 0;
    for (let i = 0; i < dateKey.length; i++) seed = (seed * 31 + dateKey.charCodeAt(i)) >>> 0;
    const seeded = arr.slice();
    for (let i = seeded.length - 1; i > 0; i--) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const j = seed % (i + 1);
      [seeded[i], seeded[j]] = [seeded[j], seeded[i]];
    }
    return seeded.slice(0, 8);
  };

  const dailySub = document.getElementById('daily-recs-sub');
  if (dailySub) {
    dailySub.textContent = new Date().toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    }) + ' · a fresh set for discovery.';
  }

  delete _shelfCache['shelf-new'];
  delete _shelfCache['shelf-daily'];
  delete _shelfCache['shelf-dark'];
  delete _shelfCache['shelf-oriental'];
  delete _shelfCache['shelf-fresh'];

  loadShelf('shelf-new', shuffle(newReleasePool).slice(0, 8));
  loadShelf('shelf-daily', dailyPick(dailyPool));
  loadShelf('shelf-dark', shuffle(darkPool).slice(0, 8));
  loadShelf('shelf-oriental', shuffle(orientalPool).slice(0, 8));
  loadShelf('shelf-fresh', shuffle(freshPool).slice(0, 8));
  loadCommunityFeed();
  renderJournalGuides();
  loadArticlesList();
}

function renderRecentsShelf() {
  const section  = document.getElementById('section-recents');
  const shelf    = document.getElementById('shelf-recents');
  const clearBtn = document.getElementById('recents-clear');
  if (!section || !shelf) return;

  const recents = loadRecents();
  if (!recents.length) { section.style.display = 'none'; return; }

  section.style.display = '';
  shelf.innerHTML = recents.map(f => buildPosterCard(f)).join('');
  shelf.querySelectorAll('.poster-card').forEach(card =>
    card.addEventListener('click', () => openFrag(card.getAttribute('data-key')))
  );

  if (clearBtn) {
    clearBtn.onclick = () => { clearRecents(); section.style.display = 'none'; };
  }
}

function getAccordName(accord) {
  return typeof accord === 'string' ? accord : (accord?.name || '');
}

function buildSimilarRecentQueries(f) {
  const signals = [];
  (f.accords || []).slice(0, 3).forEach(a => {
    const name = getAccordName(a);
    if (name) signals.push(name);
  });
  (f.notes_base || []).slice(0, 2).forEach(n => signals.push(n));
  (f.notes_heart || []).slice(0, 1).forEach(n => signals.push(n));
  if (f.family) signals.push(f.family);

  const cleanSignals = [...new Set(signals.map(s => String(s || '').trim()).filter(Boolean))];
  if (!cleanSignals.length) {
    const house = f.house ? f.house + ' ' : '';
    return [
      house + f.name,
      f.name + ' intense',
      f.name + ' elixir',
      f.name + ' parfum',
      f.name + ' eau de parfum'
    ];
  }

  const queries = [
    cleanSignals.slice(0, 2).join(' '),
    cleanSignals.slice(0, 3).join(' '),
    cleanSignals[0] + ' fragrance',
    cleanSignals[1] ? cleanSignals[1] + ' perfume' : '',
    f.family ? f.family + ' perfume' : '',
    f.name
  ];
  return [...new Set(queries.filter(Boolean))].slice(0, 6);
}

async function renderSimilarRecentShelf() {
  const section = document.getElementById('section-similar-recent');
  const shelf = document.getElementById('shelf-similar-recent');
  const source = document.getElementById('similar-recent-source');
  const more = document.getElementById('similar-recent-more');
  if (!section || !shelf) return;

  const recent = loadRecents()[0];
  if (!recent || !recent.name) {
    section.style.display = 'none';
    return;
  }

  const label = [recent.house, recent.name].filter(Boolean).join(' ');
  if (source) source.textContent = label;
  if (more) more.onclick = () => triggerSearch(label);
  section.style.display = '';
  shelf.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';

  const exclude = (recent.name + '||' + (recent.house || '')).toLowerCase();
  const seen = new Set([exclude]);
  const picks = [];

  try {
    const firstPass = await searchFragella(label || recent.name);
    (firstPass || []).forEach(f => {
      const key = (f.name + '||' + (f.house || '')).toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        picks.push(f);
      }
    });

    if (picks.length < 5) {
      const queries = buildSimilarRecentQueries(recent);
      for (const q of queries) {
        if (picks.length >= 8) break;
        const results = await searchFragella(q);
        (results || []).forEach(f => {
          const key = (f.name + '||' + (f.house || '')).toLowerCase();
          if (!seen.has(key) && picks.length < 8) {
            seen.add(key);
            picks.push(f);
          }
        });
      }
    }

    if (!picks.length) throw new Error('no similar results');
    shelf.innerHTML = picks.slice(0, 8).map(f => buildPosterCard(f)).join('');
    shelf.querySelectorAll('.poster-card').forEach(card =>
      card.addEventListener('click', () => openFrag(card.getAttribute('data-key')))
    );
  } catch (e) {
    section.style.display = 'none';
  }
}

function renderContinueStrip() {
  const section = document.getElementById('section-continue');
  const strip = document.getElementById('continue-strip');
  if (!section || !strip) return;

  if (!user || diary.length === 0) {
    section.style.display = 'none';
    return;
  }

  const unique = [];
  const seen = new Set();
  for (const e of diary) {
    const k = (e.fragrance_name || '').toLowerCase();
    if (!seen.has(k)) { seen.add(k); unique.push(e); }
    if (unique.length >= 4) break;
  }

  strip.innerHTML = unique.map(e => {
    const nm = escapeHtml(e.fragrance_name || '');
    const hs = escapeHtml(e.house || '');
    const img = e.image_url
      ? `<img src="${escapeAttr(e.image_url)}" alt="${nm}" loading="lazy" onerror="this.style.display='none'">`
      : '<span style="font-size:20px">🏺</span>';
    const ago = timeAgo(e.worn_at);
    return `<div class="continue-item" onclick="triggerSearch(${JSON.stringify(e.fragrance_name || '')})">
      <div class="continue-item-img">${img}</div>
      <div class="continue-item-info">
        <div class="continue-item-name">${nm}</div>
        <div class="continue-item-house">${hs}</div>
        <div class="continue-item-ago">${ago}</div>
      </div>
      <button class="continue-item-btn" title="Quick log" onclick="event.stopPropagation();quickLog(${JSON.stringify(e.fragrance_name||'')},${JSON.stringify(e.house||'')},${JSON.stringify(e.image_url||null)},${JSON.stringify(e.fragella_id||null)})">⏱</button>
    </div>`;
  }).join('');

  section.style.display = '';
}

function getTasteProfile() {
  let profileKey = null;
  if (user && user.user_metadata?.taste_profile?.key) {
    profileKey = user.user_metadata.taste_profile.key;
  }
  if (!profileKey) {
    try {
      const stored = JSON.parse(localStorage.getItem('sh_taste_profile') || 'null');
      if (stored?.key) profileKey = stored.key;
    } catch (e) {}
  }
  if (!profileKey || !TASTE_PROFILES[profileKey]) return null;
  return { key: profileKey, ...TASTE_PROFILES[profileKey] };
}

function renderTasteModule() {
  const cardEl = document.getElementById('taste-profile-card');
  const ctaEl = document.getElementById('taste-cta');
  const matchesEl = document.getElementById('shelf-taste-matches');
  if (!cardEl || !ctaEl) return;

  const profile = getTasteProfile();
  if (matchesEl) {
    matchesEl.style.display = 'none';
    matchesEl.dataset.loaded = '';
    matchesEl.innerHTML = '';
  }

  if (!profile) {
    ctaEl.style.display = '';
    cardEl.style.display = 'none';
    return;
  }

  ctaEl.style.display = 'none';
  const traitsHtml = (profile.traits || [])
    .map(t => `<span class="tpc-trait">${escapeHtml(t)}</span>`)
    .join('');

  cardEl.innerHTML = `
    <div class="taste-profile-card">
      <div class="tpc-header">
        <div class="tpc-emoji">${profile.emoji}</div>
        <div class="tpc-identity">
          <div class="tpc-eyebrow">Your scent profile</div>
          <div class="tpc-name">${escapeHtml(profile.name)}</div>
        </div>
      </div>
      <div class="tpc-traits">${traitsHtml}</div>
      <div class="tpc-actions">
        <button class="tpc-btn-primary" id="tpc-view-matches">View matches →</button>
        <button class="tpc-btn-secondary" onclick="openTasteTest()">Retake</button>
      </div>
    </div>`;
  cardEl.style.display = '';

  const viewBtn = document.getElementById('tpc-view-matches');
  if (viewBtn) viewBtn.addEventListener('click', () => loadTasteMatches(profile));
}

function loadTasteMatches(profile) {
  const matchesEl = document.getElementById('shelf-taste-matches');
  if (!matchesEl) return;

  if (matchesEl.dataset.loaded === 'true') {
    matchesEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }

  matchesEl.style.display = '';
  matchesEl.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';

  delete _shelfCache['shelf-taste-matches'];
  loadShelf('shelf-taste-matches', profile.queries || []).then(() => {
    matchesEl.dataset.loaded = 'true';
    matchesEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

const _nicheGatewayPool = [
  'Aventus Creed', 'Baccarat Rouge 540 Maison Francis Kurkdjian',
  'Santal 33 Le Labo', 'Oud Wood Tom Ford', 'Naxos Xerjoff',
  'Portrait of a Lady Frederic Malle', 'Bal d\'Afrique Byredo',
  'Viking Creed', 'Tobacco Vanille Tom Ford', 'Erba Pura Xerjoff',
  'Lost Cherry Tom Ford', 'Black Orchid Tom Ford'
];

async function renderForYouShelf() {
  const section = document.getElementById('section-foryou');
  const el = document.getElementById('shelf-foryou');
  const eyebrow = document.getElementById('foryou-eyebrow');
  const title = document.getElementById('foryou-title');
  const sub = document.getElementById('foryou-sub');
  if (!section || !el) return;

  let sourceName = '';
  let sourceHouse = '';
  if (collection.length > 0) {
    sourceName = collection[0].name || '';
    sourceHouse = collection[0].house || '';
  } else if (diary.length > 0) {
    sourceName = diary[0].fragrance_name || '';
    sourceHouse = diary[0].house || '';
  }

  if (!sourceName) {
    if (eyebrow) eyebrow.textContent = 'Crowd favourites';
    if (title) title.innerHTML = 'Where to <em>start</em>';
    if (sub) sub.textContent = 'The fragrances everyone should smell at least once.';
    loadShelf('shelf-foryou', _nicheGatewayPool.slice().sort(() => Math.random() - 0.5).slice(0, 8));
    section.style.display = '';
    return;
  }

  const firstName = user?.user_metadata?.name?.split(' ')[0] || user?.email?.split('@')[0] || '';
  if (eyebrow) eyebrow.textContent = 'Tuned to your taste';
  if (title) title.innerHTML = firstName ? `Picked for <em>${escapeHtml(firstName)}</em>` : 'Picked <em>for you</em>';
  if (sub) sub.textContent = `Because you have ${[sourceHouse, sourceName].filter(Boolean).join(' ')}`;
  section.style.display = '';
  el.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';

  try {
    const results = await searchFragella(sourceName);
    const hiveNames = new Set(collection.map(c => (c.name || '').toLowerCase()));
    const filtered = (results || [])
      .filter(r => !hiveNames.has((r.name || '').toLowerCase()))
      .slice(0, 8);
    if (!filtered.length) throw new Error('no results');
    el.innerHTML = filtered.map(f => buildPosterCard(f)).join('');
    el.querySelectorAll('.poster-card').forEach(c =>
      c.addEventListener('click', () => openFrag(c.getAttribute('data-key')))
    );
  } catch (e) {
    loadShelf('shelf-foryou', _nicheGatewayPool.slice().sort(() => Math.random() - 0.5).slice(0, 8));
  }
}

async function loadPopularShelf() {
  const el = document.getElementById('shelf-popular');
  if (!el) return;
  el.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';
  try {
    // Get most logged fragrances in last 30 days from journal_entries
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await sb
      .from('journal_entries')
      .select('fragrance_name, house, image_url, fragella_id')
      .gte('worn_at', since)
      .limit(100);

    if (data && data.length > 0) {
      // Count occurrences
      const counts = {};
      data.forEach(e => {
        const key = e.fragrance_name + '__' + (e.house || '');
        if (!counts[key]) counts[key] = { fragrance_name: e.fragrance_name, house: e.house, image_url: e.image_url, fragella_id: e.fragella_id, count: 0 };
        counts[key].count++;
      });
      const sorted = Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 8);
      const cards = sorted.map(f => {
        const key = 'pop' + Math.random().toString(36).slice(2, 7);
        fragStore[key] = { name: f.fragrance_name, house: f.house, image_url: f.image_url, fragella_id: f.fragella_id };
        const img = f.image_url ? makeImg(f.image_url, f.fragrance_name) : '';
        const nm = escapeHtml(f.fragrance_name);
        const hs = escapeHtml(f.house || '');
        return '<div class="poster-card" data-key="' + key + '">' +
          '<div class="poster-card-img">' + (img || '<div class="poster-card-emoji">🏺</div>') +
          '<div class="poster-card-info">' +
          '<div class="poster-card-name">' + nm + '</div>' +
          '<div class="poster-card-house">' + hs + '</div>' +
          '<div class="poster-card-rating">⬡ ' + f.count + ' log' + (f.count !== 1 ? 's' : '') + '</div>' +
          '</div></div></div>';
      });
      el.innerHTML = cards.join('');
      el.querySelectorAll('.poster-card').forEach(card => {
        card.addEventListener('click', () => openFrag(card.getAttribute('data-key')));
      });
      return;
    }
  } catch (e) {}
  // Fallback to curated list if no data yet
  loadShelf('shelf-popular', ['Sauvage', 'Aventus', 'Baccarat Rouge 540', 'Naxos', 'Oud Wood', 'Bleu de Chanel']);
}

const _shelfCache = {};
async function loadShelf(elId, names) {
  const el = document.getElementById(elId);
  if (!el) return;
  // Return cached result immediately on revisits
  if (_shelfCache[elId]) {
    el.innerHTML = _shelfCache[elId];
    el.querySelectorAll('.poster-card').forEach(card => {
      card.addEventListener('click', () => openFrag(card.getAttribute('data-key')));
    });
    return;
  }
  // Stagger requests slightly to avoid hammering the API
  const results = [];
  for (let i = 0; i < names.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 80));
    results.push(await searchFragella(names[i]).then(v => ({ status: 'fulfilled', value: v })).catch(() => ({ status: 'rejected' })));
  }
  const cards = results
    .filter(r => r.status === 'fulfilled' && r.value && r.value[0])
    .map(r => buildPosterCard(r.value[0]));
  const html = cards.length ? cards.join('') : '<div class="loading-row" style="color:var(--grey);font-size:12px">Could not load shelf</div>';
  _shelfCache[elId] = html;
  el.innerHTML = html;
  el.querySelectorAll('.poster-card').forEach(card => {
    card.addEventListener('click', () => openFrag(card.getAttribute('data-key')));
  });
}

function buildPosterCard(f) {
  const key = 'p' + Math.random().toString(36).slice(2, 8);
  fragStore[key] = f;
  const safeName = escapeHtml(f.name || '');
  const safeHouse = escapeHtml(f.house || '');
  const img = f.image_url
    ? `<img src="${escapeAttr(f.image_url)}" alt="${safeName}" loading="lazy" onerror="this.style.display='none';var e=document.createElement('div');e.className='poster-card-emoji';e.textContent='🏺';this.parentNode.insertBefore(e,this);">`
    : '<div class="poster-card-emoji">🏺</div>';
  const actions = `<div class="poster-card-actions">
      <button class="pca-btn pca-log" data-pca="log" data-name="${escapeAttr(f.name||'')}" data-house="${escapeAttr(f.house||'')}" data-img="${escapeAttr(f.image_url||'')}">Log</button>
      <button class="pca-btn pca-hive" data-pca="hive" data-name="${escapeAttr(f.name||'')}" data-house="${escapeAttr(f.house||'')}" data-img="${escapeAttr(f.image_url||'')}" data-fid="${escapeAttr(f.fragella_id||'')}">🐝 Hive</button>
      <button class="pca-btn pca-wish" data-pca="wish" data-name="${escapeAttr(f.name||'')}" data-house="${escapeAttr(f.house||'')}" data-img="${escapeAttr(f.image_url||'')}" data-fid="${escapeAttr(f.fragella_id||'')}">✨ Wish</button>
    </div>`;
  return `
    <div class="poster-card" data-key="${key}">
      <div class="poster-card-img">${img}${actions}
        <div class="poster-card-info">
          <div class="poster-card-name">${safeName}</div>
          <div class="poster-card-house">${safeHouse}${f.launch_year ? ' · ' + f.launch_year : ''}</div>
        </div>
      </div>
    </div>`;
}


function makeImg(url, alt, cls, style) {
  if (!url) return '';
  var s = style || 'max-width:80%;max-height:80%;object-fit:contain;mix-blend-mode:luminosity;filter:brightness(1.3)';
  return '<img src="' + escapeAttr(url) + '" alt="' + escapeHtml(alt||'') + '" class="' + (cls||'') + '" style="' + s + '" loading="lazy" onerror="this.style.display=\'none\';var e=document.createElement(\'div\');e.className=\'poster-card-emoji\';e.textContent=\'🏺\';this.parentNode.insertBefore(e,this);">';
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeAttr(s) {
  return String(s || '').replace(/"/g, '&quot;');
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const then = new Date(dateStr).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Date.now() - then;
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (h < 1) return 'just now';
  if (h < 24) return h + 'h ago';
  if (d === 1) return 'yesterday';
  if (d < 7) return d + ' days ago';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ═══════ SEARCH ═══════
function onSearch(q) {
  clearTimeout(searchTimer);
  const wrap = document.getElementById('search-results');
  const home = document.getElementById('home-content');
  if (!q.trim()) {
    wrap.classList.remove('active');
    home.style.display = 'block';
    return;
  }
  wrap.classList.add('active');
  home.style.display = 'none';
  wrap.innerHTML = '<div class="loading-row"><div class="spinner"></div><div style="margin-top:10px">Searching…</div></div>';
  searchTimer = setTimeout(() => doSearch(q), 400);
}

async function doSearch(q) {
  const wrap = document.getElementById('search-results');
  try {
    const frags = await searchFragella(q);
    if (!frags || frags.length === 0) {
      wrap.innerHTML = `<div class="search-empty">No results for "${escapeHtml(q)}"</div>`;
      return;
    }
    wrap.innerHTML = frags.map(f => buildResultItem(f)).join('');
    wrap.querySelectorAll('.result-item').forEach(item => {
      // Quick action buttons
      item.querySelectorAll('.result-act-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const f = fragStore[item.getAttribute('data-key')];
          if (!f) return;
          const act = btn.getAttribute('data-act');
          if (act === 'log') prefillLog(f.name, f.house, f.image_url);
          else if (act === 'hive') quickAdd(f.name, f.house, f.image_url, f.fragella_id);
          else if (act === 'wish') { addToWishlist(f); }
        });
      });
      // Row click → detail
      item.addEventListener('click', () => openFrag(item.getAttribute('data-key')));
    });
  } catch (e) {
    wrap.innerHTML = '<div class="search-empty">Search unavailable right now</div>';
  }
}

function buildResultItem(f) {
  const key = 'r' + Math.random().toString(36).slice(2, 8);
  fragStore[key] = f;
  const safeName = escapeHtml(f.name || 'Unknown');
  const img = f.image_url
    ? `<img src="${escapeAttr(f.image_url)}" alt="${safeName}" onerror="this.outerHTML='<div class=&quot;result-img-emoji&quot;>🏺</div>'">`
    : '<div class="result-img-emoji">🏺</div>';

  // Meta chips: family, year, gender
  const chips = [f.family, f.launch_year, f.gender, f.oil_type]
    .filter(Boolean).slice(0, 3)
    .map(v => `<span class="result-chip">${escapeHtml(String(v))}</span>`).join('');

  // Top accords preview
  const accords = Array.isArray(f.accords) ? f.accords.slice(0, 2).map(a =>
    `<span class="result-chip" style="color:var(--purple-light)">${escapeHtml(typeof a === 'string' ? a : a.name || '')}</span>`
  ).join('') : '';

  return `
    <div class="result-item" data-key="${key}" style="align-items:flex-start">
      <div class="result-img" style="margin-top:2px">${img}</div>
      <div class="result-info" style="flex:1;min-width:0">
        <div class="result-name">${safeName}</div>
        <div class="result-house">${escapeHtml(f.house || '')}</div>
        ${chips || accords ? `<div class="result-meta">${chips}${accords}</div>` : ''}
      </div>
      <div class="result-actions">
        <button class="result-act-btn" data-act="log" title="Log it">📝</button>
        <button class="result-act-btn" data-act="hive" title="Add to hive">🐝</button>
        <button class="result-act-btn" data-act="wish" title="Want to try">✨</button>
      </div>
    </div>`;
}

// searchFragella defined above

// ═══════ NOTE HELPERS ═══════
function noteEmoji(n) {
  n = (n || '').toLowerCase();
  if (n.includes('rose')) return '🌹';
  if (n.includes('jasmin')) return '🌸';
  if (n.includes('lemon') || n.includes('bergamot')) return '🍋';
  if (n.includes('vanilla')) return '🍦';
  if (n.includes('cedar')) return '🌲';
  if (n.includes('sandalwood') || n.includes('wood')) return '🪵';
  if (n.includes('musk')) return '☁️';
  if (n.includes('oud')) return '🪵';
  if (n.includes('iris') || n.includes('violet')) return '💜';
  if (n.includes('amber')) return '🟡';
  if (n.includes('pepper')) return '🌶️';
  if (n.includes('tobacco')) return '🍃';
  if (n.includes('leather')) return '🟤';
  if (n.includes('orange') || n.includes('mandarin') || n.includes('grapefruit')) return '🍊';
  if (n.includes('honey')) return '🍯';
  if (n.includes('patchouli') || n.includes('mint')) return '🌿';
  if (n.includes('lavender')) return '💐';
  if (n.includes('neroli') || n.includes('ylang') || n.includes('blossom')) return '🌼';
  if (n.includes('vetiver') || n.includes('hay') || n.includes('grass')) return '🌾';
  if (n.includes('coffee')) return '☕';
  if (n.includes('chocolate') || n.includes('cocoa')) return '🍫';
  if (n.includes('fruit') || n.includes('apple') || n.includes('peach')) return '🍎';
  if (n.includes('sea') || n.includes('aqua') || n.includes('marine')) return '🌊';
  return '';
}

// ═══════ NOTE IMAGES (Wikipedia thumbnails) ═══════
const NOTE_WIKI_PAGES = {
  'bergamot':'Bergamot_orange','lemon':'Lemon','orange':'Orange_(fruit)',
  'grapefruit':'Grapefruit','lime':'Lime_(fruit)','mandarin':'Mandarin_orange',
  'mandarine':'Mandarin_orange','yuzu':'Yuzu','tangerine':'Tangerine',
  'neroli':'Neroli','petitgrain':'Petitgrain','rose':'Rose','jasmine':'Jasmine',
  'jasmin':'Jasmine','lavender':'Lavender','iris':'Iris_(plant)',
  'violet':'Violet_(plant)','ylang-ylang':'Ylang-ylang','ylang ylang':'Ylang-ylang',
  'tuberose':'Polianthes_tuberosa','geranium':'Geranium','peony':'Paeonia_(plant)',
  'lily':'Lilium','lily of the valley':'Lily_of_the_valley','magnolia':'Magnolia',
  'freesia':'Freesia','orange blossom':'Orange_blossom','mimosa':'Mimosa',
  'heliotrope':'Heliotropium','carnation':'Carnation','gardenia':'Gardenia',
  'hyacinth':'Hyacinth_(plant)','cherry blossom':'Cherry_blossom',
  'sandalwood':'Sandalwood','cedarwood':'Cedar','cedar':'Cedar',
  'vetiver':'Vetiver','patchouli':'Patchouli','oud':'Agarwood',
  'agarwood':'Agarwood','frankincense':'Frankincense','incense':'Incense',
  'myrrh':'Myrrh','benzoin':'Benzoin_resin','labdanum':'Labdanum',
  'pine':'Pine','birch':'Birch','oak':'Oak','guaiac wood':'Guaiacum',
  'musk':'Musk','ambergris':'Ambergris','amber':'Amber','castoreum':'Castoreum',
  'vanilla':'Vanilla','cinnamon':'Cinnamon','cardamom':'Cardamom',
  'pepper':'Black_pepper','black pepper':'Black_pepper','ginger':'Ginger',
  'nutmeg':'Nutmeg','clove':'Clove','saffron':'Saffron',
  'tonka bean':'Dipteryx_odorata','tonka':'Dipteryx_odorata','star anise':'Illicium_verum',
  'anise':'Anise','peach':'Peach','apple':'Apple','pear':'Pear',
  'raspberry':'Raspberry','strawberry':'Strawberry','blackcurrant':'Blackcurrant',
  'blackberry':'Blackberry','plum':'Plum','cherry':'Cherry','mango':'Mango',
  'coconut':'Coconut','fig':'Common_fig','lychee':'Lychee',
  'pomegranate':'Pomegranate','mint':'Mentha','spearmint':'Spearmint',
  'basil':'Basil','oakmoss':'Evernia_prunastri','eucalyptus':'Eucalyptus',
  'green tea':'Green_tea','tea':'Tea','coffee':'Coffee','chocolate':'Chocolate',
  'caramel':'Caramel','honey':'Honey','tobacco':'Tobacco','hay':'Hay',
  'leather':'Leather','moss':'Moss','fern':'Fern','pine needle':'Pine',
  'muslin':'Musk','white musk':'Musk','ambrette':'Ambrette_seed',
  'cistus':'Cistus','orris':'Iris_(plant)','orris root':'Iris_(plant)',
  'iso e super':'Cedar','hedione':'Jasmine','calone':'Watermelon',
  'aldehydes':'Aldehydes','aldehyde':'Aldehydes','marine':'Water',
  'sea salt':'Salt','salt':'Salt','water':'Water','smoke':'Smoke',
  'birch tar':'Birch','beeswax':'Beeswax','immortelle':'Helichrysum',
  'helichrysum':'Helichrysum','violet leaf':'Violet_(plant)',
  'rose water':'Rose','rosewater':'Rose','apple blossom':'Apple',
  'linden blossom':'Tilia','linden':'Tilia','wisteria':'Wisteria',
  'cyclamen':'Cyclamen','daffodil':'Narcissus','narcissus':'Narcissus',
  'muguet':'Lily_of_the_valley','vetivert':'Vetiver','woods':'Wood',
  'wood':'Wood','mosswood':'Moss','amber wood':'Agarwood','rose wood':'Rosewood',
  'rosewood':'Rosewood','teak wood':'Teak','teak':'Teak',
  'ebony':'Ebony_wood','ebony wood':'Ebony_wood',
};

const _noteImgCache = {};

async function loadNoteImages(noteNames) {
  const toFetch = [];
  const results = {};

  for (const raw of noteNames) {
    const name = (typeof raw === 'string' ? raw : (raw.name || '')).toLowerCase().trim();
    if (!name) continue;
    const cached = sessionStorage.getItem('ni_' + name);
    if (cached) { results[name] = cached === 'none' ? null : cached; continue; }
    const page = NOTE_WIKI_PAGES[name];
    if (page) toFetch.push({ name, page });
    else { results[name] = null; sessionStorage.setItem('ni_' + name, 'none'); }
  }

  if (!toFetch.length) return results;

  await Promise.allSettled(toFetch.map(async ({ name, page }) => {
    try {
      const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page)}`, { headers: { 'Accept': 'application/json' } });
      const d = await r.json();
      const url = d?.thumbnail?.source || null;
      results[name] = url;
      sessionStorage.setItem('ni_' + name, url || 'none');
    } catch {
      results[name] = null;
      sessionStorage.setItem('ni_' + name, 'none');
    }
  }));

  return results;
}

function buildNoteTile(n, noteImgs) {
  var name = typeof n === 'string' ? n : (n.name || String(n));
  var nameKey = name.toLowerCase().trim();
  var em = noteEmoji(name) || '🌿';
  var imgUrl = noteImgs && noteImgs[nameKey];
  var inner = imgUrl
    ? '<img src="' + escapeAttr(imgUrl) + '" alt="' + escapeHtml(name) + '" onerror="this.outerHTML=\'<div class=&quot;note-tile-emoji&quot;>' + em + '</div>\'">'
    : '<div class="note-tile-emoji">' + em + '</div>';
  return '<div class="note-tile" data-note="' + escapeAttr(nameKey) + '" title="' + escapeHtml(name) + '">' + inner + '<div class="note-tile-label">' + escapeHtml(name) + '</div></div>';
}

function buildHexNotes(notes, tier, noteImgs) {
  if (!notes || !notes.length) return '';
  return notes.slice(0, 14).map(n => buildNoteTile(n, noteImgs)).join('');
}

// ═══════ COMMUNITY VOTES ═══════
const LONGEVITY_OPTS = [
  { v:'weak', label:'Weak' }, { v:'moderate', label:'Moderate' },
  { v:'long', label:'Long' }, { v:'very_long', label:'Very Long' },
  { v:'beast', label:'Beast 🔥' }
];
const SILLAGE_OPTS = [
  { v:'intimate', label:'Intimate' }, { v:'soft', label:'Soft' },
  { v:'moderate', label:'Moderate' }, { v:'strong', label:'Strong' },
  { v:'beast', label:'Beast 🔥' }
];
const SEASON_OPTS = [
  { v:'spring', label:'🌸 Spring', cls:'voted-spring' },
  { v:'summer', label:'☀️ Summer', cls:'voted-summer' },
  { v:'fall',   label:'🍂 Fall',   cls:'voted-fall' },
  { v:'winter', label:'❄️ Winter', cls:'voted-winter' }
];

function tallyVotes(rows) {
  // Returns { season:{spring:N,...}, longevity:{weak:N,...}, sillage:{...} }
  const t = { season:{spring:0,summer:0,fall:0,winter:0}, longevity:{}, sillage:{} };
  const my = { season:[], longevity:null, sillage:null };
  for (const r of rows) {
    if (r.vote_type.startsWith('season_')) {
      const s = r.vote_type.slice(7);
      t.season[s] = (t.season[s]||0) + 1;
      if (r.is_mine) my.season.push(s);
    } else if (r.vote_type === 'longevity') {
      t.longevity[r.vote_value] = (t.longevity[r.vote_value]||0) + 1;
      if (r.is_mine) my.longevity = r.vote_value;
    } else if (r.vote_type === 'sillage') {
      t.sillage[r.vote_value] = (t.sillage[r.vote_value]||0) + 1;
      if (r.is_mine) my.sillage = r.vote_value;
    }
  }
  return { t, my };
}

function buildSeasonVoteHtml(tally, my, fragella_id) {
  const total = Object.values(tally).reduce((s,n)=>s+n,0);
  const hint = user ? 'Tap to vote' : 'Sign in to vote';
  const btns = SEASON_OPTS.map(opt => {
    const n = tally[opt.v] || 0;
    const voted = my.includes(opt.v);
    return `<button class="svote-btn${voted?' '+opt.cls:''}" data-fid="${escapeAttr(fragella_id||'')}" data-stype="season_${opt.v}">${opt.label} <span class="svote-count">${n||''}</span></button>`;
  }).join('');
  return `<div class="season-wrap">${btns}</div><div class="vote-hint">${total} vote${total!==1?'s':''} · ${hint}</div>`;
}

function buildPerfVoteHtml(tally, my, fragella_id, apiLongevity, apiSillage) {
  const lTotal = Object.values(tally.longevity).reduce((s,n)=>s+n,0);
  const sTotal = Object.values(tally.sillage).reduce((s,n)=>s+n,0);

  const longevityWeights = {weak:1,moderate:2,long:3,very_long:4,beast:5};
  const sillageWeights   = {intimate:1,soft:2,moderate:3,strong:4,beast:5};

  function weightedPct(t, weights) {
    let sum = 0, total = 0;
    for (const [k,n] of Object.entries(t)) { sum += (weights[k]||0)*n; total += n; }
    return total ? Math.round(((sum/total - 1)/(5-1))*100) : 0;
  }

  const lPct = lTotal ? weightedPct(tally.longevity, longevityWeights) : textToPct(apiLongevity, LONGEVITY_MAP);
  const sPct = sTotal ? weightedPct(tally.sillage, sillageWeights) : textToPct(apiSillage, SILLAGE_MAP);

  const lBtns = LONGEVITY_OPTS.map(o => {
    const n = tally.longevity[o.v]||0;
    return `<button class="pvote-btn${my.longevity===o.v?' voted':''}" data-fid="${escapeAttr(fragella_id||'')}" data-ptype="longevity" data-pval="${o.v}">${o.label}<span class="pvote-count">${n}</span></button>`;
  }).join('');
  const sBtns = SILLAGE_OPTS.map(o => {
    const n = tally.sillage[o.v]||0;
    return `<button class="pvote-btn${my.sillage===o.v?' voted':''}" data-fid="${escapeAttr(fragella_id||'')}" data-ptype="sillage" data-pval="${o.v}">${o.label}<span class="pvote-count">${n}</span></button>`;
  }).join('');

  return `<div class="pvote-row">
    <div class="pvote-label">Longevity${lTotal?` · ${lTotal} votes`:''}</div>
    <div class="pvote-opts">${lBtns}</div>
    <div class="perf-track"><div class="perf-fill-gold" style="width:${lPct}%"></div></div>
  </div>
  <div class="pvote-row">
    <div class="pvote-label">Sillage${sTotal?` · ${sTotal} votes`:''}</div>
    <div class="pvote-opts">${sBtns}</div>
    <div class="perf-track"><div class="perf-fill-purple" style="width:${sPct}%"></div></div>
  </div>
  <div class="vote-hint">${user?'Tap to cast your vote':'Sign in to vote'}</div>`;
}

async function loadAndRenderVotes(f) {
  const fid = f.fragella_id;
  try {
    const query = sb.from('frag_votes').select('vote_type,vote_value,user_id');
    if (fid) query.eq('fragella_id', fid); else return;
    const { data: rows } = await query;
    if (!rows) return;

    // Tag which rows are mine
    const mine = rows.map(r => ({ ...r, is_mine: !!user && r.user_id === user.id }));
    const { t, my } = tallyVotes(mine);

    const sEl = document.getElementById('frag-seasons-inner');
    const pEl = document.getElementById('frag-perf-inner');
    if (sEl) {
      sEl.innerHTML = buildSeasonVoteHtml(t.season, my.season, fid);
      sEl.querySelectorAll('.svote-btn').forEach(btn => {
        btn.addEventListener('click', () => handleSeasonVote(btn, fid, my));
      });
    }
    if (pEl) {
      pEl.innerHTML = buildPerfVoteHtml(t, my, fid, f.longevity, f.sillage);
      pEl.querySelectorAll('.pvote-btn').forEach(btn => {
        btn.addEventListener('click', () => handlePerfVote(btn, fid, f));
      });
    }
  } catch(e) {}
}

async function handleSeasonVote(btn, fid, my) {
  if (!user) { toast('Sign in to vote'); return; }
  const stype = btn.getAttribute('data-stype');
  const season = stype.replace('season_','');
  const already = my.season.includes(season);
  try {
    if (already) {
      await sb.from('frag_votes').delete()
        .eq('user_id', user.id).eq('fragella_id', fid).eq('vote_type', stype);
    } else {
      await sb.from('frag_votes').upsert(
        { user_id: user.id, fragella_id: fid, vote_type: stype, vote_value: '1' },
        { onConflict: 'user_id,fragella_id,vote_type' }
      );
    }
    const fragKey = Object.keys(fragStore).find(k => fragStore[k]?.fragella_id === fid);
    if (fragKey) await loadAndRenderVotes(fragStore[fragKey]);
  } catch(e) { toast('Vote failed'); }
}

async function handlePerfVote(btn, fid, f) {
  if (!user) { toast('Sign in to vote'); return; }
  const ptype = btn.getAttribute('data-ptype');
  const pval = btn.getAttribute('data-pval');
  try {
    await sb.from('frag_votes').upsert(
      { user_id: user.id, fragella_id: fid, vote_type: ptype, vote_value: pval },
      { onConflict: 'user_id,fragella_id,vote_type' }
    );
    await loadAndRenderVotes(f);
  } catch(e) { toast('Vote failed'); }
}

// ═══════ FRAGRANCE DETAIL HELPERS ═══════
const LONGEVITY_MAP = {
  'extremely long': 100, 'very long lasting': 92, 'long lasting': 75, 'long-lasting': 75,
  'moderate': 50, 'average': 50, 'weak': 28, 'poor': 20, 'very weak': 10
};
const SILLAGE_MAP = {
  'enormous': 95, 'overwhelming': 100, 'heavy': 80, 'strong': 72,
  'moderate': 52, 'average': 52, 'light': 32, 'soft': 24, 'intimate': 15, 'very soft': 10
};

function textToPct(text, map) {
  if (!text) return 0;
  const lower = text.toLowerCase();
  for (const [key, val] of Object.entries(map)) {
    if (lower.includes(key)) return val;
  }
  return 0;
}

function getSeasons(f) {
  const src = [f.family, ...(f.accords || []).map(a => typeof a === 'string' ? a : (a.name || ''))].join(' ').toLowerCase();
  const match = terms => terms.some(t => src.includes(t));
  return [
    { label: '☀️ Summer', active: match(['citrus','fresh','aquatic','marine','light','clean','oceanic','green']), cls: 'active-summer' },
    { label: '🌸 Spring', active: match(['floral','rose','jasmin','violet','iris','lilac','lily','neroli','peony']), cls: 'active-summer' },
    { label: '🍂 Fall',   active: match(['wood','spic','leather','tobacco','oriental','amber','resin','earthy','vetiver']), cls: 'active-season' },
    { label: '❄️ Winter', active: match(['oud','incense','vanilla','warm','sweet','gourmand','balsam','smoky','heavy','musk']), cls: 'active-season' }
  ];
}

async function loadSimilarFragrances(f) {
  const el = document.getElementById('frag-similar');
  if (!el) return;
  const label = el.querySelector('.detail-label');

  const familyQuery = f.family || '';
  const houseQuery = f.house || '';
  const currentName = (f.name || '').toLowerCase();

  let results = [];
  if (familyQuery) {
    try {
      results = (await searchFragella(familyQuery)) || [];
    } catch(e) {}
  }
  if (results.length < 4 && houseQuery) {
    try {
      const byHouse = (await searchFragella(houseQuery)) || [];
      const seen = new Set(results.map(r => (r.name || '').toLowerCase()));
      for (const r of byHouse) {
        const key = (r.name || '').toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          results.push(r);
        }
      }
    } catch(e) {}
  }

  const filtered = results
    .filter(r => (r.name || '').toLowerCase() !== currentName)
    .slice(0, 8);

  if (!filtered.length) { el.style.display = 'none'; return; }

  if (label) label.textContent = 'You might also like';
  const shelf = el.querySelector('.poster-row');
  if (shelf) {
    shelf.innerHTML = filtered.map(r => buildPosterCard(r)).join('');
    shelf.querySelectorAll('.poster-card').forEach(c => {
      c.addEventListener('click', () => openFrag(c.getAttribute('data-key')));
    });
  }
}

const FAMILY_OCCASIONS = {
  woody: ['Office', 'Casual', 'Autumn'],
  oriental: ['Evening', 'Date night', 'Winter'],
  fresh: ['Office', 'Sport', 'Spring', 'Summer'],
  floral: ['Date night', 'Weekend', 'Spring'],
  gourmand: ['Evening', 'Autumn', 'Winter'],
  aquatic: ['Sport', 'Summer', 'Casual'],
  fougere: ['Office', 'Sport'],
  chypre: ['Evening', 'Weekend'],
  citrus: ['Morning', 'Summer', 'Sport'],
  aromatic: ['Office', 'Casual'],
  leather: ['Evening', 'Autumn'],
  musk: ['Casual', 'Weekend']
};

function sameFragName(a, b) {
  return (a || '').toLowerCase() === (b || '').toLowerCase();
}

function getFamilyOccasions(family) {
  const familyKey = (family || '').toLowerCase().split(/[\s/,]/)[0];
  return FAMILY_OCCASIONS[familyKey] || [];
}

function buildFragStatus(f) {
  const diaryEntries = diary.filter(e => sameFragName(e.fragrance_name, f.name));
  const inHive = collection.some(c => sameFragName(c.name, f.name));
  const wornCount = diaryEntries.length;
  const lastEntry = diaryEntries[0];
  const avgRating = wornCount
    ? Math.round(diaryEntries.reduce((s, e) => s + (e.rating || 0), 0) / wornCount)
    : 0;

  const statusBadges = [];
  if (inHive) statusBadges.push('<span class="fd-badge fd-badge-hive">🐝 In your hive</span>');
  if (wornCount > 0) {
    const starsHtml = avgRating
      ? '<span class="fd-badge-stars">' + '★'.repeat(avgRating) + '<span style="color:var(--grey2)">' + '★'.repeat(5 - avgRating) + '</span></span>'
      : '';
    const lastDate = lastEntry?.worn_at
      ? new Date(lastEntry.worn_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : '';
    statusBadges.push('<span class="fd-badge fd-badge-worn">Worn ' + wornCount + 'x ' + starsHtml + '</span>');
    if (lastDate) statusBadges.push('<span class="fd-badge fd-badge-date">Last: ' + lastDate + '</span>');
  }

  return {
    inHive,
    wornCount,
    statusBar: statusBadges.length ? '<div class="fd-status">' + statusBadges.join('') + '</div>' : ''
  };
}

function buildFragActionsHtml(f, inHive, wornCount) {
  return '<div class="frag-actions">' +
    '<button class="frag-btn frag-btn-primary" data-act="log" data-name="' + escapeAttr(f.name||'') + '" data-house="' + escapeAttr(f.house||'') + '" data-img="' + escapeAttr(f.image_url||'') + '">' +
      (wornCount > 0 ? 'Log again' : 'Log &amp; rate') +
    '</button>' +
    '<div class="frag-actions-row2">' +
      '<button class="frag-btn frag-btn-secondary" data-act="add" data-name="' + escapeAttr(f.name||'') + '" data-house="' + escapeAttr(f.house||'') + '" data-img="' + escapeAttr(f.image_url||'') + '" data-fid="' + escapeAttr(f.fragella_id||'') + '">' +
        (inHive ? '🐝 In hive' : '🐝 Add to hive') +
      '</button>' +
      '<button class="frag-btn frag-btn-secondary" data-act="wish" data-name="' + escapeAttr(f.name||'') + '" data-house="' + escapeAttr(f.house||'') + '" data-img="' + escapeAttr(f.image_url||'') + '" data-fid="' + escapeAttr(f.fragella_id||'') + '">' +
        '✨ Wishlist' +
      '</button>' +
    '</div>' +
  '</div>';
}

function buildWhenHtml(f) {
  const occasionChips = getFamilyOccasions(f.family)
    .map(o => '<span class="fd-when-chip">' + o + '</span>')
    .join('');

  return '<div class="detail-sec">' +
    '<div class="detail-label">When to wear</div>' +
    (occasionChips ? '<div class="fd-when-chips">' + occasionChips + '</div>' : '') +
    '<div class="fd-when-votes">' +
      '<div class="detail-sublabel">Community seasons</div>' +
      '<div id="frag-seasons-inner"><div class="season-wrap"><div style="color:var(--grey);font-size:11px">Loading votes…</div></div></div>' +
    '</div>' +
  '</div>';
}

function getFragSignalText(f) {
  const accords = (f.accords || f['Main Accords'] || []).map(getAccordName);
  const notes = [
    ...(f.notes_top || f['Top Notes'] || []),
    ...(f.notes_heart || f['Middle Notes'] || []),
    ...(f.notes_base || f['Base Notes'] || []),
    ...(f['General Notes'] || [])
  ];
  return [f.name, f.house, f.family, f.gender, f.oil_type, ...accords, ...notes]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function scoreBlindBuyAdvisor(f) {
  const profile = getTasteProfile();
  const text = getFragSignalText(f);
  const contains = terms => terms.some(t => text.includes(t));
  const matchTerms = {
    CLEAN_SLATE: ['fresh','aquatic','citrus','bergamot','lemon','clean','marine','green','neroli','office','blue'],
    SPRING_GARDEN: ['floral','rose','jasmine','gardenia','violet','iris','green','fresh','peony','spring'],
    NIGHT_WATCH: ['smoke','smoky','leather','incense','dark','vetiver','moss','oud','patchouli','dry'],
    VELVET_CAVE: ['vanilla','amber','oud','tobacco','sweet','gourmand','cherry','rum','resin','oriental'],
    GOLDEN_HOUR: ['amber','vanilla','honey','musk','tonka','warm','sweet','saffron','skin','cashmere'],
    FOREST_WALKER: ['woody','wood','cedar','sandalwood','vetiver','moss','green','earthy','patchouli'],
    THE_STATEMENT: ['elixir','intense','oud','amber','smoke','leather','saffron','spicy','projection','powerful'],
    THE_CURATOR: ['woody','aromatic','fresh','amber','citrus','musk','iris','vetiver','balanced','classic']
  };
  const riskTerms = [
    ['oud', 10], ['animalic', 12], ['cumin', 14], ['indolic', 12], ['smoke', 9],
    ['leather', 8], ['patchouli', 7], ['sweet', 6], ['vanilla', 5], ['powdery', 7],
    ['aldehydic', 8], ['intense', 7], ['elixir', 9], ['tobacco', 7], ['incense', 7]
  ];
  const easyTerms = ['fresh','citrus','clean','musk','aromatic','aquatic','green','office'];

  const profileTerms = profile ? (matchTerms[profile.key] || []) : [];
  const hits = profileTerms.filter(t => text.includes(t)).length;
  const easyBonus = easyTerms.filter(t => text.includes(t)).length * 2;
  const profileScore = profile ? Math.min(34, hits * 7) : 10;
  let risk = riskTerms.reduce((sum, [term, val]) => sum + (text.includes(term) ? val : 0), 0);
  risk = Math.max(8, Math.min(84, risk + (contains(['parfum','extrait','elixir','intense']) ? 8 : 0)));
  const match = Math.max(42, Math.min(94, 58 + profileScore + easyBonus - Math.floor(risk / 6)));

  let verdict = 'Sample first';
  if (match >= 82 && risk < 42) verdict = 'Safe sample';
  if (match >= 88 && risk < 30) verdict = 'Low-risk buy';
  if (risk >= 58) verdict = 'Do not blind buy';

  let riskLabel = 'Moderate';
  if (risk < 30) riskLabel = 'Low';
  if (risk >= 58) riskLabel = 'High';

  const occasions = getFamilyOccasions(f.family);
  const bestUse = occasions[0] || (contains(['fresh','citrus','clean']) ? 'Daytime' : contains(['vanilla','amber','oud','tobacco']) ? 'Evening' : 'Everyday test wear');
  const reason = profile
    ? (hits ? 'Matches your ' + profile.name + ' profile through ' + profileTerms.filter(t => text.includes(t)).slice(0, 2).join(' + ') + '.' : 'Your profile has weak overlap here, so test on skin before buying.')
    : 'Take the taste test to turn this preview into a personal match score.';
  const caution = contains(['sweet','vanilla','amber']) ? 'May lean sweet.'
    : contains(['oud','smoke','leather','incense']) ? 'May read dark or polarising.'
    : contains(['powdery','iris','aldehydic']) ? 'May feel powdery or classic.'
    : 'Main risk is projection and drydown on skin.';

  return { profile, match, risk, verdict, riskLabel, bestUse, reason, caution };
}

function buildBlindBuyAdvisorHtml(f) {
  const a = scoreBlindBuyAdvisor(f);
  const locked = !a.profile;
  return '<div class="detail-sec blind-advisor">' +
    '<div class="blind-advisor-top">' +
      '<div>' +
        '<div class="detail-label">Blind Buy Advisor <span class="pro-badge mini">Pro preview</span></div>' +
        '<div class="blind-advisor-verdict">' + escapeHtml(a.verdict) + '</div>' +
      '</div>' +
      '<div class="blind-score ' + (locked ? 'is-locked' : '') + '">' +
        '<span>' + (locked ? '—' : a.match) + '</span><small>' + (locked ? 'Preview' : '% match') + '</small>' +
      '</div>' +
    '</div>' +
    '<div class="blind-advisor-grid">' +
      '<div><span>Risk</span><strong>' + escapeHtml(a.riskLabel) + '</strong></div>' +
      '<div><span>Best use</span><strong>' + escapeHtml(a.bestUse) + '</strong></div>' +
      '<div><span>Next move</span><strong>' + (a.riskLabel === 'High' ? 'Order sample' : 'Skin test') + '</strong></div>' +
    '</div>' +
    '<div class="blind-advisor-copy">' + escapeHtml(a.reason) + ' ' + escapeHtml(a.caution) + '</div>' +
    '<div class="blind-advisor-actions">' +
      (locked
        ? '<button onclick="openTasteTest()">Take taste test</button>'
        : '<button onclick="openUpgrade()">Unlock full advisor</button>') +
      '<button onclick="openSampleBuilder()">Build sample set</button>' +
    '</div>' +
  '</div>';
}

// ═══════ FRAGRANCE DETAIL ═══════
function openFrag(key) {
  const f = fragStore[key];
  if (!f) return;
  saveRecent(f);
  const top = f.notes_top || f['Top Notes'] || [];
  const heart = f.notes_heart || f['Middle Notes'] || [];
  const base = f.notes_base || f['Base Notes'] || [];
  const general = f['General Notes'] || [];
  const hasNotes = top.length || heart.length || base.length || general.length;
  const accords = f.accords || [];
  const buyQ = encodeURIComponent((f.name || '') + ' ' + (f.house || ''));
  const safeName = escapeHtml(f.name || '');
  const safeHouse = escapeHtml(f.house || '');
  const { inHive, wornCount, statusBar } = buildFragStatus(f);
  const fragActionsHtml = buildFragActionsHtml(f, inHive, wornCount);
  const descHtml = f.description
    ? '<div class="detail-sec fd-desc">' +
        '<div class="detail-label">About this fragrance</div>' +
        '<p class="fd-desc-text">' + escapeHtml(f.description) + '</p>' +
      '</div>'
    : '';
  const whenHtml = buildWhenHtml(f);
  const blindBuyHtml = buildBlindBuyAdvisorHtml(f);

  // Performance — community voted
  const perfHtml = '<div class="detail-sec"><div class="detail-label">Performance <span style="font-size:9px;color:var(--grey);font-weight:400">(community voted)</span></div><div id="frag-perf-inner"><div class="pvote-row"><div style="color:var(--grey);font-size:11px">Loading votes…</div></div></div></div>';

  document.getElementById('frag-content').innerHTML =
    '<div class="frag-hero">' +
      '<div class="frag-hero-img">' + (f.image_url ? '<img src="' + escapeAttr(f.image_url) + '" alt="' + safeName + '">' : '<div class="frag-hero-img-emoji">🏺</div>') + '</div>' +
      '<div class="frag-hero-body">' +
        '<div class="frag-hero-eyebrow">' + safeHouse + '</div>' +
        '<div class="frag-hero-name">' + safeName + '</div>' +
        '<div class="frag-hero-meta">' + [f.family, f.oil_type, f.launch_year, f.gender].filter(Boolean).map(escapeHtml).join(' · ') + '</div>' +
        statusBar +
        fragActionsHtml +
      '</div>' +
    '</div>' +
    ((f.gender || f.launch_year) ?
      '<div class="frag-stats-grid">' +
        (f.gender ? '<div class="frag-stat-cell"><span class="frag-stat-val">' + escapeHtml(f.gender) + '</span><span class="frag-stat-key">Gender</span></div>' : '') +
        (f.launch_year ? '<div class="frag-stat-cell"><span class="frag-stat-val">' + f.launch_year + '</span><span class="frag-stat-key">Year</span></div>' : '') +
        (f.price_range ? '<div class="frag-stat-cell"><span class="frag-stat-val">' + escapeHtml(f.price_range) + '</span><span class="frag-stat-key">Price</span></div>' : '') +
        (f.oil_type ? '<div class="frag-stat-cell"><span class="frag-stat-val">' + escapeHtml(f.oil_type) + '</span><span class="frag-stat-key">Type</span></div>' : '') +
      '</div>' : '') +
    blindBuyHtml +
    descHtml +
    whenHtml +
    perfHtml +
    (hasNotes ? '<div class="detail-sec"><div class="detail-label">Fragrance notes <span style="font-size:9px;color:var(--grey);font-weight:400;cursor:help" title="Notes sourced from community databases — accuracy is similar to Fragrantica. Niche fragrances may have gaps.">ⓘ</span></div>' +
      (top.length ? '<div class="note-tier-head note-tier-top">Top notes</div><div class="note-tile-grid">' + buildHexNotes(top, 'top') + '</div>' : '') +
      (heart.length ? '<div class="note-tier-head note-tier-heart">Heart notes</div><div class="note-tile-grid">' + buildHexNotes(heart, 'heart') + '</div>' : '') +
      (base.length ? '<div class="note-tier-head note-tier-base">Base notes</div><div class="note-tile-grid">' + buildHexNotes(base, 'base') + '</div>' : '') +
      (!top.length && !heart.length && !base.length && general.length ? '<div class="note-tier-head note-tier-base">Notes</div><div class="note-tile-grid">' + buildHexNotes(general.slice(0,12), 'base') + '</div>' : '') +
    '</div>' : '') +
    (accords && accords.length ? '<div class="detail-sec"><div class="detail-label">Scent character</div>' +
      accords.slice(0,7).map(function(a, ai) {
        var nm = typeof a === 'string' ? a : (a.name || String(a));
        var pct = typeof a === 'object' ? (a.percentage || a.pct || 70) : 70;
        var fillCls = ai % 2 === 0 ? 'accord-fill-purple' : 'accord-fill-gold';
        return '<div class="accord-bar-wrap"><div class="accord-bar-top"><span class="accord-bar-name">' + escapeHtml(nm) + '</span><span class="accord-bar-pct">' + Math.round(pct) + '%</span></div><div class="accord-track"><div class="' + fillCls + '" style="width:' + pct + '%"></div></div></div>';
      }).join('') + '</div>' : '') +
    '<div class="detail-sec" id="frag-reviews"><div class="detail-label">Reviews from the hive</div><div style="color:var(--grey);font-size:12px;font-style:italic">Loading…</div></div>' +
    '<div class="detail-sec" id="frag-similar">' +
      '<div class="detail-label">You might also like</div>' +
      '<div class="poster-row"><div class="loading-row"><div class="spinner"></div></div></div>' +
    '</div>' +
    '<div class="detail-sec"><div class="detail-label">Where to buy</div>' +
      '<div class="buy-section-label">Norway</div>' +
      '<div class="buy-grid">' +
        '<div class="buy-card" data-url="https://www.notino.no/search/?phrase=' + buyQ + '"><div class="buy-card-flag">🇳🇴</div><div class="buy-card-name">Notino</div><div class="buy-card-note">Free ship over 299 kr</div></div>' +
        '<div class="buy-card" data-url="https://www.kicks.no/search?q=' + buyQ + '"><div class="buy-card-flag">🇳🇴</div><div class="buy-card-name">Kicks</div><div class="buy-card-note">Same-day delivery</div></div>' +
        '<div class="buy-card" data-url="https://www.parfyme.no/?s=' + buyQ + '"><div class="buy-card-flag">🇳🇴</div><div class="buy-card-name">Parfyme.no</div><div class="buy-card-note">Norwegian specialist</div></div>' +
        '<div class="buy-card" data-url="https://www.parfumo.com/search?q=' + buyQ + '"><div class="buy-card-flag">🇩🇪</div><div class="buy-card-name">Parfumo</div><div class="buy-card-note">Community prices</div></div>' +
      '</div>' +
      '<div class="buy-section-label" style="margin-top:14px">Samples &amp; decants</div>' +
      '<div class="buy-grid">' +
        '<div class="buy-card" data-url="https://www.luckyscent.com/search?q=' + buyQ + '"><div class="buy-card-flag">🇺🇸</div><div class="buy-card-name">LuckyScent</div><div class="buy-card-note">Authorised samples</div></div>' +
        '<div class="buy-card" data-url="https://www.theperfumedcourt.com/search.aspx?q=' + buyQ + '"><div class="buy-card-flag">🇺🇸</div><div class="buy-card-name">Perfumed Court</div><div class="buy-card-note">Trusted decants</div></div>' +
      '</div>' +
      '<div class="buy-section-label" style="margin-top:14px">Community &amp; info</div>' +
      '<div class="buy-grid">' +
        '<div class="buy-card" data-url="https://www.fragrantica.com/search/?query=' + buyQ + '"><div class="buy-card-flag">🌐</div><div class="buy-card-name">Fragrantica</div><div class="buy-card-note">Community ratings</div></div>' +
        '<div class="buy-card" data-url="https://www.google.com/search?tbm=shop&q=' + buyQ + '"><div class="buy-card-flag">🔍</div><div class="buy-card-name">Google Shopping</div><div class="buy-card-note">Compare all prices</div></div>' +
      '</div>' +
    '</div><div style="height:40px"></div>';

  // Wire buttons
  document.querySelectorAll('#frag-content .frag-btn').forEach(b => {
    b.addEventListener('click', () => {
      const act = b.getAttribute('data-act');
      const name = b.getAttribute('data-name');
      const house = b.getAttribute('data-house');
      if (act === 'log') prefillLog(name, house, b.getAttribute('data-img'));
      else if (act === 'add') {
        if (collection.some(c => sameFragName(c.name, name))) { toast('Already in your hive'); return; }
        quickAdd(name, house, b.getAttribute('data-img'), b.getAttribute('data-fid'));
      }
      else if (act === 'wish') addToWishlist({ name, house, image_url: b.getAttribute('data-img'), fragella_id: b.getAttribute('data-fid') });
    });
  });
  document.querySelectorAll('#frag-content .buy-row, #frag-content .buy-card').forEach(b => {
    b.addEventListener('click', () => window.open(b.getAttribute('data-url'), '_blank', 'noopener'));
  });

  showScreen('frag');
  if (f.name) loadFragReviews(f.name);
  loadSimilarFragrances(f);
  // Async: load community votes + note images in parallel
  const allNotes = [...(f.notes_top||f['Top Notes']||[]), ...(f.notes_heart||f['Middle Notes']||[]), ...(f.notes_base||f['Base Notes']||[]), ...(f['General Notes']||[])];
  if (f.fragella_id) loadAndRenderVotes(f);
  if (allNotes.length) {
    loadNoteImages(allNotes).then(imgs => {
      document.querySelectorAll('#frag-content .note-tile[data-note]').forEach(tile => {
        const name = tile.getAttribute('data-note');
        const url = imgs[name];
        if (url && !tile.querySelector('img')) {
          const emojiDiv = tile.querySelector('.note-tile-emoji');
          if (emojiDiv) {
            const img = document.createElement('img');
            img.src = url;
            img.alt = name;
            img.onerror = () => img.remove();
            tile.insertBefore(img, emojiDiv);
            emojiDiv.remove();
          }
        }
      });
    });
  }
}

async function loadFragReviews(fragName) {
  const el = document.getElementById('frag-reviews');
  if (!el) return;
  try {
    const { data } = await sb.from('journal_entries')
      .select('rating, notes, worn_at')
      .ilike('fragrance_name', '%' + fragName.split(' ')[0] + '%')
      .not('notes', 'is', null)
      .order('worn_at', { ascending: false })
      .limit(5);
    if (!data || !data.length) {
      el.innerHTML = '<div class="detail-label">Reviews from the hive</div><div style="color:var(--grey);font-size:12px;font-style:italic;padding:4px 0">No reviews yet.</div>';
      return;
    }
    el.innerHTML = '<div class="detail-label">Reviews from the hive</div>' +
      data.map(r => {
        const stars = r.rating ? '★'.repeat(r.rating) + '<span style="color:var(--grey2)">' + '★'.repeat(5-r.rating) + '</span>' : '';
        const d = new Date(r.worn_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        return '<div style="padding:12px 0;border-bottom:1px solid var(--border2)">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:5px">' +
            (stars ? '<div style="font-size:12px;color:var(--honey)">' + stars + '</div>' : '') +
            '<div style="font-family:DM Mono,monospace;font-size:9px;color:var(--grey)">' + d + '</div>' +
          '</div>' +
          '<div style="font-size:12px;color:var(--white2);font-style:italic;line-height:1.6">"' + escapeHtml(r.notes) + '"</div>' +
        '</div>';
      }).join('');
  } catch (e) {}
}

function prefillLog(name, house, imageUrl) {
  openLog({ name, house, image_url: imageUrl || null });
}

async function quickAdd(name, house, imageUrl, fragellaId) {
  // If no image provided, try to fetch from fragella
  let resolvedImg = imageUrl || null;
  let resolvedFid = fragellaId || null;
  if (!resolvedImg && sb) {
    try {
      const term = (name || '').split(' ')[0];
      const { data } = await sb.from('fragella').select('name,house,image_url,id').ilike('name', '%' + term + '%').limit(8);
      if (data && data.length) {
        const match = data.find(r =>
          r.name && name && r.name.toLowerCase().includes(name.toLowerCase().split(' ')[0]) &&
          r.house && house && r.house.toLowerCase().includes(house.toLowerCase().split(' ')[0])
        ) || data.find(r => r.name && name && r.name.toLowerCase().includes(name.toLowerCase().split(' ')[0])) || data[0];
        if (match) {
          resolvedImg = match.image_url || null;
          resolvedFid = resolvedFid || match.id || null;
        }
      }
    } catch(e) {}
  }
  const entry = { name, house, image_url: resolvedImg, fragella_id: resolvedFid, created_at: new Date().toISOString() };
  if (user) {
    try {
      const { data } = await sb.from('collection').insert([{ user_id: user.id, name, house, image_url: resolvedImg, fragella_id: resolvedFid }]).select();
      if (data) collection.unshift(data[0]);
    } catch (e) { collection.unshift(entry); }
  } else {
    collection.unshift(entry);
    saveLocal();
  }
  toast('✓ Added to your hive 🐝');
}

// ═══════ LOG MODAL ═══════
// openLog defined in new block above

// saveLog defined in new block above


// ═══════ ADD COLLECTION ═══════
function openAdd() {
  selectedAddFrag = null;
  document.getElementById('add-step-1').style.display = 'block';
  document.getElementById('add-step-2').style.display = 'none';
  document.getElementById('add-search').value = '';
  document.getElementById('add-search-results').innerHTML = '';
  document.getElementById('add-name-manual').value = '';
  document.getElementById('add-house-manual').value = '';
  document.getElementById('add-size').value = '';
  document.getElementById('add-price').value = '';
  openModal('modal-add');
}

function resetAddStep() {
  selectedAddFrag = null;
  document.getElementById('add-step-1').style.display = 'block';
  document.getElementById('add-step-2').style.display = 'none';
  document.getElementById('add-search').focus();
}

function selectAddFrag(f) {
  selectedAddFrag = f;
  document.getElementById('add-step-1').style.display = 'none';
  document.getElementById('add-step-2').style.display = 'block';
  document.getElementById('add-selected-name').textContent = f.name || '';
  document.getElementById('add-selected-house').textContent = f.house || '';
  const imgWrap = document.getElementById('add-selected-img');
  if (f.image_url) {
    imgWrap.innerHTML = makeImg(f.image_url, f.name, '', 'width:100%;height:100%;object-fit:contain;mix-blend-mode:screen;padding:4px') || '🏺';
  } else {
    imgWrap.textContent = '🏺';
  }
}

function selectManualAdd() {
  const name = document.getElementById('add-name-manual').value.trim();
  const house = document.getElementById('add-house-manual').value.trim();
  if (!name) { toast('Please enter a fragrance name'); return; }
  selectAddFrag({ name, house, image_url: null, fragella_id: null });
}

function onAddSearch(q) {
  clearTimeout(addSearchTimer);
  const results = document.getElementById('add-search-results');
  const spinner = document.getElementById('add-search-spinner');
  if (!q.trim()) { results.innerHTML = ''; return; }
  spinner.style.display = 'block';
  addSearchTimer = setTimeout(async () => {
    const frags = await searchFragella(q);
    spinner.style.display = 'none';
    if (!frags.length) {
      results.innerHTML = '<div style="padding:12px;font-size:12px;color:var(--grey);font-style:italic">No results — try a different spelling or add manually below.</div>';
      return;
    }
    results.innerHTML = frags.slice(0, 6).map((f, i) => {
      const key = 'as' + i + Math.random().toString(36).slice(2, 6);
      fragStore[key] = f;
      const img = f.image_url ? makeImg(f.image_url, f.name) : '🏺';
      return '<div class="log-search-result" data-key="' + key + '" style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--border2);cursor:pointer">' +
        '<div style="width:36px;height:46px;background:var(--bg3);border-radius:2px;display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:18px;flex-shrink:0">' + img + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-family:Playfair Display,serif;font-size:15px;font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(f.name || '') + '</div>' +
          '<div style="font-family:DM Mono,monospace;font-size:9px;color:var(--gold);letter-spacing:0.08em;text-transform:uppercase;margin-top:3px">' + escapeHtml(f.house || '') + '</div>' +
        '</div>' +
        '<span style="color:var(--grey)">›</span>' +
      '</div>';
    }).join('');
    results.querySelectorAll('.log-search-result').forEach(r => {
      r.addEventListener('click', () => selectAddFrag(fragStore[r.getAttribute('data-key')]));
    });
  }, 350);
}

async function saveCollection() {
  if (!selectedAddFrag) { toast('Search and select a fragrance first'); return; }
  const size = document.getElementById('add-size').value;
  const price = document.getElementById('add-price').value;
  const entry = {
    name: selectedAddFrag.name || '',
    house: selectedAddFrag.house || '',
    image_url: selectedAddFrag.image_url || null,
    fragella_id: selectedAddFrag.fragella_id || null,
    size_ml: size || null,
    price_paid: price || null,
    created_at: new Date().toISOString()
  };
  if (user) {
    try {
      const { data, error } = await sb.from('collection').insert([{ user_id: user.id, ...entry }]).select();
      if (error) throw error;
      if (data) collection.unshift(data[0]);
    } catch (e) {
      collection.unshift({ ...entry, id: 'local_' + Date.now() });
    }
  } else {
    collection.unshift({ ...entry, id: 'local_' + Date.now() });
    saveLocal();
  }
  closeModal('modal-add');
  toast('✓ Added to your hive 🐝');
  renderCollection();
  updateRightSidebar();
}

// ═══════ DIARY (Letterboxd table) ═══════
function renderDiary() {
  renderDiaryExtras();
  const el = document.getElementById('diary-list');
  if (!el) return;
  if (diary.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-emoji">📖</div>
        <div class="empty-state-title">Your diary is empty</div>
        <div class="empty-state-sub">Every fragrance you wear gets logged here. Tap + Log to start.</div>
        <button class="btn-primary" onclick="openLog()">+ Log a fragrance</button>
      </div>`;
    return;
  }
  // Group by month
  const monthMap = {};
  diary.forEach((e, idx) => {
    const d = new Date(e.worn_at);
    const key = d.getFullYear() + '-' + String(d.getMonth()).padStart(2, '0');
    if (!monthMap[key]) monthMap[key] = { label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), entries: [] };
    monthMap[key].entries.push({ entry: e, idx });
  });
  const months = Object.keys(monthMap).sort().reverse();
  el.innerHTML = months.map(k => {
    const m = monthMap[k];
    return `<div class="diary-month-group">
        <div class="diary-month-label">${m.label}</div>
        ${m.entries.map(({ entry: e, idx }) => {
          const d = new Date(e.worn_at);
          const day = d.getDate();
          const dayName = d.toLocaleDateString('en-GB', { weekday: 'short' });
          const stars = e.rating ? '★'.repeat(e.rating) + '<span class="empty">' + '★'.repeat(5 - e.rating) + '</span>' : '';
          const reviewIcon = e.notes ? '<span class="diary-review-icon">≡</span>' : '';
          return `
            <div class="diary-row-item" style="cursor:pointer" data-idx="${idx}" data-id="${escapeAttr(String(e.id||''))}" data-name="${escapeAttr(e.fragrance_name||'')}" data-house="${escapeAttr(e.house||'')}">
              <div>
                <div class="diary-day">${day}</div>
                <div class="diary-day-sub">${dayName}</div>
              </div>
              <div class="diary-bottle">${e.image_url ? `<img src="${escapeAttr(e.image_url)}" alt="${escapeHtml(e.fragrance_name)}" onerror="this.outerHTML='<div class=&quot;diary-bottle-emoji&quot;>🏺</div>'">` : '<div class="diary-bottle-emoji">🏺</div>'}</div>
              <div class="diary-info">
                <div class="diary-name">${escapeHtml(e.fragrance_name)}</div>
                <div class="diary-house">${escapeHtml(e.house || '')}</div>
              </div>
              <div class="diary-rating-cell">
                ${stars ? `<div class="diary-stars">${stars}</div>` : ''}
                <button class="diary-del-btn" title="Remove">×</button>
              </div>
              ${e.notes ? `<div class="diary-review-text">"${escapeHtml(e.notes)}"</div>` : ''}
            </div>`;
        }).join('')}
      </div>`;
  }).join('');

  // Diary delete buttons
  el.querySelectorAll('.diary-del-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const row = btn.closest('.diary-row-item');
      const id = row?.getAttribute('data-id');
      if (id) deleteDiaryEntry(id);
    });
  });

  // Diary row click → entry detail sheet
  el.querySelectorAll('.diary-row-item').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      const idx = parseInt(row.getAttribute('data-idx'), 10);
      if (!isNaN(idx) && diary[idx]) openEntrySheet(diary[idx]);
    });
  });
}

function openEntrySheet(entry) {
  const body = document.getElementById('entry-sheet-body');
  const sheet = document.getElementById('entry-sheet');
  if (!body || !sheet || !entry) return;
  const rating = Math.max(0, Math.min(5, parseInt(entry.rating || 0, 10) || 0));
  const img = entry.image_url
    ? `<img class="entry-sheet-img" src="${escapeAttr(entry.image_url)}" alt="${escapeHtml(entry.fragrance_name || '')}" onerror="this.outerHTML='<div class=&quot;entry-sheet-emoji&quot;>🏺</div>'">`
    : '<div class="entry-sheet-emoji">🏺</div>';
  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
  const date = entry.worn_at
    ? new Date(entry.worn_at).toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
    : '';
  body.innerHTML = `
    ${img}
    <div class="entry-sheet-name">${escapeHtml(entry.fragrance_name || '')}</div>
    <div class="entry-sheet-house">${escapeHtml(entry.house || '')}</div>
    <div class="entry-sheet-meta">
      ${date ? `<span class="entry-sheet-date">${date}</span>` : ''}
      ${rating ? `<span class="entry-sheet-stars">${stars}</span>` : ''}
      ${entry.occasion ? `<span class="entry-sheet-occasion">${escapeHtml(entry.occasion)}</span>` : ''}
    </div>
    ${entry.notes ? `<div class="entry-sheet-notes">${escapeHtml(entry.notes)}</div>` : ''}
    <button class="entry-sheet-delete" onclick="deleteEntryFromSheet(${JSON.stringify(String(entry.id || ''))})">Delete entry</button>
  `;
  sheet.style.display = 'flex';
}

function closeEntrySheet() {
  const sheet = document.getElementById('entry-sheet');
  if (sheet) sheet.style.display = 'none';
}

function deleteEntryFromSheet(id) {
  closeEntrySheet();
  deleteDiaryEntry(id);
}

// ═══════ COLLECTION ═══════
function renderCollection() {
  const grid = document.getElementById('col-grid');
  if (!grid) return;
  const houses = [...new Set(collection.map(b => b.house).filter(Boolean))];
  const value = collection.reduce((s, b) => s + (parseFloat(b.price_paid) || 0), 0);
  document.getElementById('col-count').textContent = collection.length;
  document.getElementById('col-houses').textContent = houses.length;
  document.getElementById('col-value').textContent = value > 0 ? '€' + Math.round(value).toLocaleString() : '—';
  if (collection.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1">
        <div class="empty-state">
          <div class="empty-state-emoji">🐝</div>
          <div class="empty-state-title">Your hive is empty</div>
          <div class="empty-state-sub">Add fragrances you own to keep track of your collection.</div>
          <button class="btn-primary" onclick="showTab('home')">Browse &amp; add</button>
        </div>
      </div>`;
    return;
  }
  grid.innerHTML = collection.map((b, idx) => {
    const img = b.image_url
      ? `<img src="${escapeAttr(b.image_url)}" alt="${escapeHtml(b.name)}" onerror="this.outerHTML='<div class=&quot;col-cell-monogram&quot;>${escapeHtml((b.name||'?')[0].toUpperCase())}</div>'">`
      : `<div class="col-cell-monogram">${escapeHtml((b.name||'?')[0].toUpperCase())}</div>`;
    return `
      <div class="col-cell" data-idx="${idx}" data-name="${escapeAttr(b.name||'')}" data-house="${escapeAttr(b.house||'')}">
        ${img}
        <div class="col-cell-overlay">
          <div class="col-cell-name">${escapeHtml(b.name)}</div>
          <div class="col-cell-house">${escapeHtml(b.house || '')}</div>
        </div>
        <button class="col-quick-btn" data-quick-idx="${idx}" title="Quick log wear">⏱</button>
        <button class="col-del-btn" data-del-idx="${idx}" title="Remove">×</button>
      </div>`;
  }).join('');

  // Wire quick wear buttons
  grid.querySelectorAll('.col-quick-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-quick-idx'));
      const b = collection[idx];
      if (b) quickLog(b.name || '', b.house || '', b.image_url || null, b.fragella_id || null);
    });
  });

  // Wire delete buttons
  grid.querySelectorAll('.col-del-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-del-idx'));
      const b = collection[idx];
      if (b) deleteCollectionItem(String(b.id||''), b.name||'');
    });
  });

  // Auto-fetch missing bottle images from fragella
  const missingImgCells = [...grid.querySelectorAll('.col-cell[data-idx]')].filter(cell => {
    const idx = parseInt(cell.getAttribute('data-idx'));
    return collection[idx] && !collection[idx].image_url;
  });
  if (missingImgCells.length && sb) {
    missingImgCells.forEach(async cell => {
      const idx = parseInt(cell.getAttribute('data-idx'));
      const b = collection[idx];
      if (!b || b.image_url) return;
      try {
        const q = (b.name || '') + (b.house ? ' ' + b.house : '');
        const { data } = await sb.from('fragella').select('name,house,image_url').ilike('name', '%' + (b.name||'').split(' ')[0] + '%').limit(5);
        if (!data || !data.length) return;
        // Best match: same house
        const match = data.find(r => r.house && b.house && r.house.toLowerCase().includes(b.house.toLowerCase().split(' ')[0])) || data[0];
        if (!match || !match.image_url) return;
        // Update the cell
        const emojiDiv = cell.querySelector('.col-cell-emoji');
        if (emojiDiv) {
          const img = document.createElement('img');
          img.src = match.image_url;
          img.alt = escapeHtml(b.name);
          img.onerror = () => img.remove();
          img.style.cssText = 'width:100%;height:100%;object-fit:contain;mix-blend-mode:screen;padding:10px;transition:transform 0.2s';
          emojiDiv.replaceWith(img);
        }
        // Persist to DB if logged in
        collection[idx].image_url = match.image_url;
        if (user && b.id) {
          sb.from('collection').update({ image_url: match.image_url }).eq('id', b.id).then(() => {});
        }
      } catch(e) {}
    });
  }

  // Wire clicks: open fragrance detail
  grid.querySelectorAll('.col-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      const name = cell.getAttribute('data-name');
      const house = cell.getAttribute('data-house');
      const cached = Object.keys(fragStore).find(k => {
        const f = fragStore[k];
        return f.name && f.name.toLowerCase() === name.toLowerCase();
      });
      if (cached) { openFrag(cached); return; }
      searchFragella(name + (house ? ' ' + house : '')).then(frags => {
        if (!frags.length) { toast('Fragrance not found'); return; }
        const key = 'c' + Math.random().toString(36).slice(2, 8);
        fragStore[key] = frags[0];
        openFrag(key);
      });
    });
  });

  // Background enrichment for entries without images
  enrichImages(collection, 'name', 'collection').then(changed => {
    if (changed) renderCollection();
  });
}

// ═══════ TASTE PROFILE COMPUTE ═══════
function computeTasteProfile() {
  const CATS = {
    'Oriental':  ['oud','amber','oriental','incense','tobacco','opium','resin','bakhoor','smoky'],
    'Woody':     ['wood','cedar','sandalwood','vetiver','patchouli','birch','guaiac','forest','oakmoss'],
    'Fresh':     ['sauvage','cool water','bleu','aqua','fresh','citrus','lime','lemon','bergamot','marine','ocean','light blue','green','sport'],
    'Floral':    ['flower','floral','rose','jasmin','iris','violet','lily','neroli','peony','gardenia','ylang','lavender'],
    'Gourmand':  ['vanilla','chocolate','caramel','honey','sugar','tonka','praline','gourmand','marzipan','coffee'],
    'Spicy':     ['pepper','spice','cinnamon','cardamom','saffron','clove','ginger','chili','nutmeg']
  };
  const scores = Object.fromEntries(Object.keys(CATS).map(k => [k, 0]));
  const entries = [...diary, ...collection];
  if (!entries.length) return scores;

  entries.forEach(e => {
    const name  = (e.fragrance_name || e.name || '').toLowerCase();
    const house = (e.house || '').toLowerCase();
    const w     = e.rating || 1;
    // also check fragStore for richer accord data
    const cached = e.fragella_id
      ? Object.values(fragStore).find(fs => fs.fragella_id === e.fragella_id)
      : null;
    const extra = cached
      ? (cached.accords || []).map(a => typeof a === 'string' ? a : (a.name || '')).join(' ').toLowerCase()
        + ' ' + (cached.family || '').toLowerCase()
      : '';
    const text = name + ' ' + house + ' ' + extra;
    Object.entries(CATS).forEach(([cat, terms]) => {
      if (terms.some(t => text.includes(t))) scores[cat] += w;
    });
  });

  const max = Math.max(...Object.values(scores), 1);
  return Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, Math.round(v / max * 100)]));
}

function renderTasteBars() {
  const el = document.getElementById('taste-bars');
  if (!el) return;
  const profile = computeTasteProfile();
  const sorted  = Object.entries(profile).sort((a, b) => b[1] - a[1]);
  const hasData  = sorted.some(([, v]) => v > 0);
  if (!hasData) {
    el.innerHTML = '<div style="color:var(--grey);font-size:12px;font-style:italic;padding:4px 0">Log more fragrances to build your taste profile.</div>';
    return;
  }
  el.innerHTML = sorted.map(([name, pct]) => `
    <div class="taste-row">
      <div class="taste-top"><span class="taste-name">${name}</span><span class="taste-count">${pct}%</span></div>
      <div class="taste-track"><div class="taste-fill" style="width:${pct}%"></div></div>
    </div>`).join('');
}

function renderProfileTasteIdentity() {
  const el = document.getElementById('profile-taste-identity');
  if (!el) return;

  const profile = getTasteProfile();
  if (!profile) {
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 20px">
        <span style="font-size:11px;color:var(--grey);font-style:italic">No scent profile yet.</span>
        <button onclick="openTasteTest()" style="background:none;border:1px solid var(--border);border-radius:20px;color:var(--gold);font-size:10px;font-family:'DM Mono',monospace;letter-spacing:0.06em;padding:4px 12px;cursor:pointer;white-space:nowrap">Take taste test →</button>
      </div>`;
    return;
  }

  const traitsHtml = (profile.traits || []).slice(0, 3)
    .map(t => `<span class="tpc-trait">${escapeHtml(t)}</span>`)
    .join('');

  el.innerHTML = `
    <div class="profile-taste-card">
      <div class="profile-taste-top">
        <div class="profile-taste-emoji">${profile.emoji}</div>
        <div class="profile-taste-main">
          <div class="profile-taste-kicker">Scent identity</div>
          <div class="profile-taste-name">${escapeHtml(profile.name)}</div>
          <div class="profile-taste-tagline">${escapeHtml(profile.tagline || '')}</div>
        </div>
        <button class="profile-taste-retake" onclick="openTasteTest()">Retake</button>
      </div>
      ${traitsHtml ? `<div class="tpc-traits profile-taste-traits">${traitsHtml}</div>` : ''}
    </div>`;
}

// ═══════ PROFILE ═══════
function renderProfile() {
  // Account info
  if (user) {
    const name = user.user_metadata?.name || user.email?.split('@')[0] || 'User';
    document.getElementById('prof-name').textContent = name;
    document.getElementById('prof-handle').textContent = '@' + (user.email?.split('@')[0] || 'user');
    document.getElementById('prof-avatar').textContent = name[0]?.toUpperCase() || '👤';
    // Big initial in cover
    const cover = document.querySelector('.profile-cover');
    if (cover) {
      let ini = cover.querySelector('.profile-cover-initial');
      if (!ini) { ini = document.createElement('div'); ini.className = 'profile-cover-initial'; cover.appendChild(ini); }
      ini.textContent = name[0]?.toUpperCase() || '';
    }
    document.getElementById('account-name').textContent = 'Signed in';
    document.getElementById('account-sub').textContent = user.email;
    document.getElementById('signout-row').style.display = 'flex';
    document.getElementById('account-row').setAttribute('data-action', 'noop');
  } else {
    document.getElementById('prof-name').textContent = 'Guest';
    document.getElementById('prof-handle').textContent = '@guest';
    document.getElementById('prof-avatar').textContent = '👤';
    document.getElementById('account-name').textContent = 'Sign in';
    document.getElementById('account-sub').textContent = 'Save your data across devices';
    document.getElementById('signout-row').style.display = 'none';
    document.getElementById('account-row').setAttribute('data-action', 'signin');
  }

  // Show/hide guest vs member sections
  const isLoggedIn = !!user;
  const guestCta = document.getElementById('guest-cta');
  const upgradeStrip = document.getElementById('upgrade-strip');
  const favSection = document.getElementById('fav-section');
  if (guestCta) guestCta.style.display = isLoggedIn ? 'none' : 'block';
  if (upgradeStrip) upgradeStrip.style.display = isLoggedIn ? 'flex' : 'none';
  if (favSection) favSection.style.display = isLoggedIn ? 'block' : 'none';

  // Stats
  const houses = [...new Set(collection.map(b => b.house).filter(Boolean))];
  document.getElementById('prof-logged').textContent = diary.length;
  document.getElementById('prof-collection').textContent = collection.length;
  document.getElementById('prof-houses').textContent = houses.length;

  // Avg rating
  const rated = diary.filter(e => e.rating);
  const avg = rated.length ? (rated.reduce((s, e) => s + e.rating, 0) / rated.length).toFixed(1) : '—';
  document.getElementById('prof-avg').textContent = avg;

  // Favourites — manual picks stored in user metadata
  renderFavsGrid(user?.user_metadata?.favourites || null);

  // Recent reviews — last 3 with notes
  const recentReviews = diary.filter(e => e.notes).slice(0, 3);
  const reviewsEl = document.getElementById('profile-reviews');
  if (recentReviews.length === 0) {
    reviewsEl.innerHTML = `<div style="padding:0 20px;color:var(--grey);font-size:12px;font-style:italic">No reviews yet — log a fragrance and add a note.</div>`;
  } else {
    reviewsEl.innerHTML = recentReviews.map(r => {
      const d = new Date(r.worn_at);
      const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const stars = r.rating ? '★'.repeat(r.rating) + '<span style="color:var(--grey2)">' + '★'.repeat(5 - r.rating) + '</span>' : '';
      return `
        <div style="padding:14px 20px;border-bottom:1px solid var(--border2)">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <div style="font-family:'Playfair Display',serif;font-size:15px;font-style:italic">${escapeHtml(r.fragrance_name)}</div>
            ${stars ? `<div style="font-size:11px;color:var(--gold)">${stars}</div>` : ''}
          </div>
          <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--gold);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:5px">${escapeHtml(r.house || '')} · ${dateStr}</div>
          <div style="font-size:12px;color:var(--white2);font-style:italic;line-height:1.55">"${escapeHtml(r.notes)}"</div>
        </div>
      `;
    }).join('');
  }

  // Top houses
  const houseCounts = {};
  diary.forEach(e => {
    if (e.house) houseCounts[e.house] = (houseCounts[e.house] || 0) + 1;
  });
  collection.forEach(b => {
    if (b.house) houseCounts[b.house] = (houseCounts[b.house] || 0) + 1;
  });
  const topHouses = Object.entries(houseCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topHousesEl = document.getElementById('top-houses');
  if (topHouses.length === 0) {
    topHousesEl.innerHTML = `<div style="color:var(--grey);font-size:12px;font-style:italic">No houses yet — log fragrances to see your favourite houses appear here.</div>`;
  } else {
    topHousesEl.innerHTML = topHouses.map(([h, c]) => `
      <div class="house-row">
        <div class="house-name">${escapeHtml(h)}</div>
        <div class="house-count">${c} ${c === 1 ? 'entry' : 'entries'}</div>
      </div>
    `).join('');
  }

  // Bio
  const bio = user
    ? (user.user_metadata?.bio || 'Building my fragrance diary one wear at a time.')
    : 'Welcome — sign in to save your diary and build your taste profile.';
  document.getElementById('prof-bio').textContent = bio;

  // Taste profile
  renderProfileTasteIdentity();
  renderTasteBars();
}

// ═══════ ARTICLES ═══════
const ARTICLES = {
  'niche-guide': {
    title: "A beginner's guide to <em>niche fragrance</em>",
    meta: '12 min read · By the ScentHive team',
    body: `
      <p>If you've spent time on fragrance TikTok, you've heard the word "niche" thrown around as if it's a value judgment. It isn't. Niche fragrances are simply those produced outside the major designer labels — usually by smaller houses with bigger budgets per bottle. They're not always better. They're often weirder. And that's the point.</p>
      <p>Here are the houses you should know.</p>
      <h3>1. Xerjoff</h3>
      <p>Italian luxury. Their Naxos and Erba Pura have become modern classics. Bottles are heavy enough to use as paperweights. Pricing is steep but resale value holds.</p>
      <h3>2. Maison Francis Kurkdjian</h3>
      <p>Home of Baccarat Rouge 540 — the most polarising fragrance of the last decade. You'll either love the metallic sweetness or hate it. Try a sample first.</p>
      <h3>3. Amouage</h3>
      <p>Omani house with a focus on opulence. Interlude Man and Reflection Man are both highly regarded. Their fragrances are loud, complex, and not for everyone.</p>
      <h3>4. Parfums de Marly</h3>
      <p>French house riding a wave of popularity. Layton and Herod are gateway niche scents that designer wearers tend to love.</p>
      <p>The above is a starting point. Real niche exploration takes years and a lot of sampling. Decant sites like Lucky Scent and The Perfumed Court let you try before committing to a full bottle.</p>
      <p style="color:var(--grey);font-style:italic;margin-top:24px">More articles coming as we build out the ScentHive Journal.</p>
    `
  },
  'reformulation': {
    title: 'The truth about reformulations',
    meta: '3 min read',
    body: `
      <p>Your favourite fragrance smells different now. You're not imagining it. Reformulations happen for one of three reasons.</p>
      <p><strong>1. IFRA regulations.</strong> The International Fragrance Association periodically restricts ingredients deemed allergenic. Oakmoss, certain musks, and natural extracts have all been hit. When restricted, perfumers must reformulate using synthetic substitutes.</p>
      <p><strong>2. Cost reduction.</strong> When a fragrance becomes wildly successful, brands often quietly swap expensive naturals for cheaper alternatives. The bottle and price stay the same. The smell changes.</p>
      <p><strong>3. Brand acquisition.</strong> When a niche house is acquired by a conglomerate, formulations often shift to align with corporate sourcing.</p>
      <p>How do you tell? Look for batch codes. Older codes typically indicate older formulations. ScentHive's batch checker can help you date a bottle before you buy.</p>
    `
  },
  'layering': {
    title: 'A guide to layering fragrances properly',
    meta: '5 min read',
    body: `
      <p>Most layering advice online is wrong. People recommend pairing two fragrances that already share notes. This produces a muddy, unfocused result.</p>
      <p>Good layering follows one principle — <em>contrast creates clarity</em>.</p>
      <p>Pair a rich, dark base (Tobacco Vanille, Naxos) with a bright top (lemon cologne, neroli soliflore). Pair a clean white musk with a smoky oud. The contrast lets each fragrance breathe.</p>
      <p>Application matters too. Spray the deeper fragrance first on the body, the brighter one above it on clothing. The order changes how they meet your nose.</p>
      <p>Three combinations that always work:</p>
      <p>Naxos + Mandarin (or any citrus EDC)<br>Tobacco Vanille + Cologne Indélébile by Frederic Malle<br>Oud Wood + Mojave Ghost</p>
      <p>Avoid layering two big fragrances. Avoid layering two of the same family. The whole point is a third dimension neither fragrance has alone.</p>
    `
  },
  'decants': {
    title: 'How decants saved fragrance collecting',
    meta: '4 min read',
    body: `
      <p>A decade ago, sampling expensive fragrances meant either visiting a department store with a knowledgeable SA or buying a full bottle and hoping. Decanting changed everything.</p>
      <p>A decant is a small sample of a fragrance — usually 5ml or 10ml — split off from a full bottle. Decant communities (most famously the splits on Basenotes and Reddit) made expensive niche houses accessible to people who couldn't justify €300 bottles.</p>
      <p>The benefits are obvious. You can sample 20 fragrances for the price of a single bottle. You can carry travel sizes without committing your daily wear. You can build a "wardrobe" of dozens of scents without breaking your budget.</p>
      <p>The risks are real too. Counterfeit decants are common. Buy from established sites (LuckyScent, The Perfumed Court, MicroParfums) or trusted community sellers with reputation systems.</p>
      <p>Decants are how serious noses are built. There's no other way to smell 100 fragrances in a year on a normal budget.</p>
    `
  },
  'summer': {
    title: '10 summer fragrances that aren\'t generic',
    meta: '6 min read',
    body: `
      <p>Acqua di Gio Profumo. Bleu de Chanel. Sauvage. You already know these. They're popular for a reason but they're also everywhere. Here are ten less-obvious summer fragrances that won't smell like everyone else at the beach.</p>
      <p><strong>1. Mandarino di Amalfi by Tom Ford</strong> — bright Italian citrus done with elegance.</p>
      <p><strong>2. Erba Pura by Xerjoff</strong> — sunshine in a bottle. Universally loved.</p>
      <p><strong>3. Eau Sauvage by Dior (the original)</strong> — a 1966 cologne that still feels modern.</p>
      <p><strong>4. Cologne Indélébile by Frederic Malle</strong> — citrus and white musk done luxuriously.</p>
      <p><strong>5. Reflection Man by Amouage</strong> — clean elegance taken to the extreme.</p>
      <p><strong>6. Mojave Ghost by Byredo</strong> — desert flowers, dry and ethereal.</p>
      <p><strong>7. Fucking Fabulous by Tom Ford</strong> — yes the name. Yes the price. The leather is unreal.</p>
      <p><strong>8. Nishane Hacivat</strong> — pineapple done seriously.</p>
      <p><strong>9. L'Eau d'Issey Pour Homme</strong> — aquatic without being basic.</p>
      <p><strong>10. Eau de Sport by Dolce & Gabbana</strong> — cheap, fresh, perfect for the gym.</p>
    `
  }
};

function openArticle(id) {
  const a = ARTICLES[id];
  if (!a) return;
  document.getElementById('article-content').innerHTML = `
    <div style="font-family:'DM Mono',monospace;font-size:10px;color:var(--gold);letter-spacing:0.16em;text-transform:uppercase;margin-bottom:12px">ScentHive Journal</div>
    <h1 style="font-family:'Playfair Display',serif;font-size:32px;line-height:1.1;font-weight:400;margin-bottom:12px">${a.title}</h1>
    <div style="font-family:'DM Mono',monospace;font-size:11px;color:var(--grey);margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid var(--border2)">${a.meta}</div>
    <div style="font-size:15px;line-height:1.75;color:var(--white2)" id="article-body">${a.body}</div>
  `;
  // Style elements inside
  document.querySelectorAll('#article-body p').forEach(p => p.style.marginBottom = '16px');
  document.querySelectorAll('#article-body h3').forEach(h => {
    h.style.fontFamily = "'Playfair Display', serif";
    h.style.fontSize = '20px';
    h.style.fontStyle = 'italic';
    h.style.color = 'var(--gold-light)';
    h.style.marginTop = '24px';
    h.style.marginBottom = '12px';
    h.style.fontWeight = '400';
  });
  document.querySelectorAll('#article-body strong').forEach(s => {
    s.style.color = 'var(--white)';
    s.style.fontWeight = '500';
  });
  showScreen('article');
}

// ═══════ MODAL ═══════
function openModal(id) { document.getElementById(id).classList.add('open') }
function closeModal(id) { document.getElementById(id).classList.remove('open') }

// ═══════ TOAST ═══════
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

// ═══════ FRAGELLA SEARCH + SUPABASE CACHE ═══════
// In-memory dedup: same query never hits the server twice in one session.
// Stores resolved results (arrays) and in-flight promises so concurrent
// callers share one request rather than firing N identical ones.
const _searchMemo = {};

async function searchFragella(q) {
  if (!q || q.trim().length < 2) return [];
  const qq = q.trim();
  const key = qq.toLowerCase();

  if (_searchMemo[key] !== undefined) {
    // Already resolved or in-flight — return the same promise/value
    return _searchMemo[key];
  }

  // Store the promise immediately so concurrent callers await the same fetch
  _searchMemo[key] = (async () => {
    try {
      const res = await fetch(SEARCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: qq })
      });
      if (!res.ok) throw new Error('API ' + res.status);
      const json = await res.json();
      const frags = Array.isArray(json.fragrances) ? json.fragrances : [];
      if (frags.length > 0) {
        cacheFragrances(frags).catch(() => {});
        return frags;
      }
    } catch (e) {}
    // Fallback: Supabase cache directly
    try {
      const { data } = await sb.from('fragrances_cache')
        .select('*').ilike('name', '%' + qq + '%').limit(10);
      return Array.isArray(data) ? data : [];
    } catch (e) { return []; }
  })();

  return _searchMemo[key];
}

// ═══════ BACKGROUND IMAGE ENRICHMENT ═══════
async function enrichImages(items, nameKey, tableKey) {
  const noImg = items.filter(b => !b.image_url && b[nameKey]);
  if (!noImg.length) return false;
  const toFetch = noImg.slice(0, 8);
  const results = await Promise.allSettled(
    toFetch.map(b => searchFragella((b[nameKey] || '') + (b.house ? ' ' + b.house : '')))
  );
  let changed = false;
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled' || !r.value.length) return;
    const match = r.value.find(f => f.image_url) || r.value[0];
    if (!match || !match.image_url) return;
    const item = toFetch[i];
    const idx = items.indexOf(item);
    if (idx < 0) return;
    items[idx].image_url = match.image_url;
    if (!items[idx].fragella_id && match.fragella_id) items[idx].fragella_id = match.fragella_id;
    if (user && items[idx].id && tableKey) {
      sb.from(tableKey).update({ image_url: match.image_url }).eq('id', items[idx].id).catch(() => {});
    }
    changed = true;
  });
  return changed;
}

async function cacheFragrances(frags) {
  try {
    const rows = frags.map(f => ({
      fragella_id: String(f.fragella_id || f.id || Math.random()),
      name: f.name || '',
      house: f.house || '',
      family: f.family || '',
      notes_top: f.notes_top || f['Top Notes'] || [],
      notes_heart: f.notes_heart || f['Middle Notes'] || [],
      notes_base: f.notes_base || f['Base Notes'] || [],
      accords: f.accords || f['Main Accords'] || [],
      longevity: f.longevity || '',
      sillage: f.sillage || '',
      gender: f.gender || '',
      image_url: f.image_url || f['Image URL'] || '',
      launch_year: f.launch_year || f.Year || null,
      price_range: f.price_range || '',
    }));
    await sb.from('fragrances_cache')
      .upsert(rows, { onConflict: 'fragella_id', ignoreDuplicates: true });
  } catch (e) {}
}

// ═══════ LOG MODAL — search-first flow ═══════
let selectedFrag = null;
let logSearchTimer = null;
let selectedAddFrag = null;
let addSearchTimer = null;

let logIsPublic = false;

function toggleLogPublic() {
  logIsPublic = !logIsPublic;
  const pill = document.getElementById('log-public-pill');
  const dot = document.getElementById('log-public-dot');
  if (pill) pill.style.background = logIsPublic ? 'var(--gold)' : 'var(--bg4)';
  if (dot) { dot.style.background = logIsPublic ? 'var(--bg)' : 'var(--grey2)'; dot.style.left = logIsPublic ? '20px' : '2px'; }
}

function openLog(prefilled) {
  selectedFrag = null;
  logRating = 0;
  logIsPublic = false;
  document.getElementById('log-step-1').style.display = 'block';
  document.getElementById('log-step-2').style.display = 'none';
  document.getElementById('log-search').value = prefilled ? (prefilled.name || '') : '';
  document.getElementById('log-search-results').innerHTML = '';
  document.getElementById('log-review').value = '';
  document.querySelectorAll('#star-picker .star-pick').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('#log-occ .occ-chip').forEach(c => c.classList.remove('selected'));
  // Reset toggle UI
  const pill = document.getElementById('log-public-pill');
  const dot = document.getElementById('log-public-dot');
  if (pill) pill.style.background = 'var(--bg4)';
  if (dot) { dot.style.background = 'var(--grey2)'; dot.style.left = '2px'; }
  if (prefilled) selectFrag(prefilled);
  openModal('modal-log');
}

function resetLogStep() {
  selectedFrag = null;
  document.getElementById('log-step-1').style.display = 'block';
  document.getElementById('log-step-2').style.display = 'none';
  document.getElementById('log-search').focus();
}

function selectFrag(f) {
  selectedFrag = f;
  document.getElementById('log-step-1').style.display = 'none';
  document.getElementById('log-step-2').style.display = 'block';
  document.getElementById('log-selected-name').textContent = f.name || '';
  document.getElementById('log-selected-house').textContent = f.house || '';
  // Show image
  const imgWrap = document.getElementById('log-selected-img');
  if (f.image_url) {
    imgWrap.innerHTML = makeImg(f.image_url, f.name, '', 'width:100%;height:100%;object-fit:contain;mix-blend-mode:screen;padding:4px') || '🏺';
  } else {
    imgWrap.textContent = '🏺';
  }
}

function selectManualFrag() {
  const name = document.getElementById('log-name-manual').value.trim();
  const house = document.getElementById('log-house-manual').value.trim();
  if (!name) { toast('Please enter a fragrance name'); return; }
  selectFrag({ name, house, image_url: null });
}

function onLogSearch(q) {
  clearTimeout(logSearchTimer);
  const results = document.getElementById('log-search-results');
  const spinner = document.getElementById('log-search-spinner');
  if (!q.trim()) { results.innerHTML = ''; return; }
  spinner.style.display = 'block';
  logSearchTimer = setTimeout(async () => {
    const frags = await searchFragella(q);
    spinner.style.display = 'none';
    if (!frags.length) {
      results.innerHTML = '<div style="padding:12px;font-size:12px;color:var(--grey);font-style:italic">No results — try a different spelling or add manually below.</div>';
      return;
    }
    results.innerHTML = frags.slice(0, 6).map((f, i) => {
      const key = 'ls' + i + Math.random().toString(36).slice(2,6);
      fragStore[key] = f;
      const img = f.image_url
        ? makeImg(f.image_url, f.name)
        : '🏺';
      return '<div class="log-search-result" data-key="' + key + '" style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--border2);cursor:pointer">' +
        '<div style="width:36px;height:46px;background:var(--bg3);border-radius:2px;display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:18px;flex-shrink:0">' + img + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-family:Playfair Display,serif;font-size:15px;font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(f.name || '') + '</div>' +
          '<div style="font-family:DM Mono,monospace;font-size:9px;color:var(--gold);letter-spacing:0.08em;text-transform:uppercase;margin-top:3px">' + escapeHtml(f.house || '') + '</div>' +
        '</div>' +
        '<span style="color:var(--grey)">›</span>' +
      '</div>';
    }).join('');
    // Wire clicks
    results.querySelectorAll('.log-search-result').forEach(r => {
      r.addEventListener('click', () => selectFrag(fragStore[r.getAttribute('data-key')]));
    });
  }, 350);
}

async function saveLog() {
  if (!selectedFrag) { toast('Search and select a fragrance first'); return; }
  const review = document.getElementById('log-review').value.trim();
  const occChip = document.querySelector('#log-occ .occ-chip.selected');
  const occ = occChip ? occChip.getAttribute('data-v') : '';
  const entry = {
    fragrance_name: selectedFrag.name || '',
    house: selectedFrag.house || '',
    notes: review,
    rating: logRating,
    occasion: occ,
    image_url: selectedFrag.image_url || null,
    fragella_id: selectedFrag.fragella_id || null,
    worn_at: new Date().toISOString(),
    is_public: logIsPublic
  };
  if (user) {
    try {
      const { data, error } = await sb.from('journal_entries')
        .insert([{ user_id: user.id, ...entry }]).select();
      if (error) throw error;
      if (data) diary.unshift(data[0]);
    } catch (e) {
      diary.unshift({ ...entry, id: 'local_' + Date.now() });
    }
  } else {
    diary.unshift({ ...entry, id: 'local_' + Date.now() });
    saveLocal();
  }
  closeModal('modal-log');
  toast(logIsPublic ? '✓ Logged & shared with community' : '✓ Logged to diary');
  renderDiary();
  updateRightSidebar();
  loadCommunityFeed();
}

async function quickLog(name, house, imageUrl, fragellaId) {
  if (!name) { toast('Choose a fragrance first'); return; }
  const entry = {
    fragrance_name: name,
    house: house || '',
    notes: '',
    rating: 0,
    occasion: '',
    image_url: imageUrl || null,
    fragella_id: fragellaId || null,
    worn_at: new Date().toISOString(),
    is_public: false
  };

  if (user) {
    try {
      const { data, error } = await sb.from('journal_entries')
        .insert([{ user_id: user.id, ...entry }]).select();
      if (error) throw error;
      diary.unshift(data?.[0] || { ...entry, id: 'local_' + Date.now() });
    } catch (e) {
      diary.unshift({ ...entry, id: 'local_' + Date.now() });
    }
  } else {
    diary.unshift({ ...entry, id: 'local_' + Date.now() });
    saveLocal();
  }

  toast('Logged: ' + name);
  renderDiary();
  renderDiaryExtras();
  updateHero();
  updateRightSidebar();
  loadCommunityFeed();
}

// ═══════ UPGRADE ═══════
function openUpgrade() { openModal('modal-upgrade'); }

// ═══════ MANUAL FAVOURITES ═══════
let pickFavSlot = 0;
let pickFavTimer = null;

function openPickFav(slot) {
  if (!user) { toast('Sign in to set favourites'); return; }
  pickFavSlot = slot;
  document.getElementById('pick-fav-search').value = '';
  document.getElementById('pick-fav-results').innerHTML = '';
  openModal('modal-pick-fav');
  setTimeout(() => document.getElementById('pick-fav-search').focus(), 200);
}

function onPickFavSearch(q) {
  clearTimeout(pickFavTimer);
  const results = document.getElementById('pick-fav-results');
  const spinner = document.getElementById('pick-fav-spinner');
  if (!q.trim()) { results.innerHTML = ''; return; }
  spinner.style.display = 'block';
  pickFavTimer = setTimeout(async () => {
    const frags = await searchFragella(q);
    spinner.style.display = 'none';
    if (!frags.length) {
      results.innerHTML = '<div style="padding:12px;font-size:12px;color:var(--grey);font-style:italic">No results found.</div>';
      return;
    }
    results.innerHTML = frags.slice(0, 6).map((f, i) => {
      const key = 'pf' + i + Math.random().toString(36).slice(2, 5);
      fragStore[key] = f;
      const img = f.image_url ? makeImg(f.image_url, f.name) : '🏺';
      return '<div class="log-search-result" data-key="' + key + '" style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--border2);cursor:pointer">' +
        '<div style="width:36px;height:46px;background:var(--bg3);border-radius:2px;display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:18px;flex-shrink:0">' + img + '</div>' +
        '<div style="flex:1;min-width:0"><div style="font-family:Playfair Display,serif;font-size:15px;font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(f.name || '') + '</div>' +
        '<div style="font-family:DM Mono,monospace;font-size:9px;color:var(--gold);letter-spacing:0.08em;text-transform:uppercase;margin-top:3px">' + escapeHtml(f.house || '') + '</div></div>' +
        '<span style="color:var(--grey)">+</span></div>';
    }).join('');
    results.querySelectorAll('.log-search-result').forEach(r => {
      r.addEventListener('click', () => setFavourite(fragStore[r.getAttribute('data-key')]));
    });
  }, 350);
}

async function setFavourite(f) {
  const favs = Array(4).fill(null).map((_, i) => (user?.user_metadata?.favourites || [])[i] || null);
  favs[pickFavSlot] = { name: f.name, house: f.house, image_url: f.image_url || null, fragella_id: f.fragella_id || null };
  try {
    await sb.auth.updateUser({ data: { favourites: favs } });
    if (user?.user_metadata) user.user_metadata.favourites = favs;
  } catch (e) {}
  closeModal('modal-pick-fav');
  renderFavsGrid(favs);
  toast('✓ Added to favourites');
}

async function removeFavourite(slot) {
  const favs = Array(4).fill(null).map((_, i) => (user?.user_metadata?.favourites || [])[i] || null);
  favs[slot] = null;
  try {
    await sb.auth.updateUser({ data: { favourites: favs } });
    if (user?.user_metadata) user.user_metadata.favourites = favs;
  } catch (e) {}
  renderFavsGrid(favs);
  toast('Removed from favourites');
}

function renderFavsGrid(favs) {
  const grid = document.getElementById('favourites-grid');
  if (!grid) return;
  const slots = Array(4).fill(null).map((_, i) => (favs || [])[i] || null);
  grid.innerHTML = slots.map((f, i) => {
    if (f && f.name) {
      const img = f.image_url
        ? `<img src="${escapeAttr(f.image_url)}" alt="${escapeHtml(f.name)}" onerror="this.outerHTML='<div class=&quot;fav-cell-empty&quot;>🏺</div>'">`
        : `<div class="fav-cell-empty" style="font-family:'Playfair Display',serif;font-size:24px;color:var(--gold-dim);font-style:italic">${escapeHtml(f.name[0])}</div>`;
      return `<div class="fav-cell" data-favslot="${i}" data-name="${escapeAttr(f.name)}" data-house="${escapeAttr(f.house||'')}">
        ${img}
        <div class="fav-cell-overlay">${escapeHtml(f.name)}</div>
        <button class="col-del-btn" style="opacity:0.7" onclick="event.stopPropagation();removeFavourite(${i})" title="Remove">×</button>
      </div>`;
    }
    return `<div class="fav-cell" onclick="${user ? 'openPickFav(' + i + ')' : 'toast(\'Sign in to set favourites\')'}"><div class="fav-cell-empty">Pick</div></div>`;
  }).join('');
  // Wire clicks on filled cells → open frag detail
  grid.querySelectorAll('.fav-cell[data-favslot]').forEach(cell => {
    cell.addEventListener('click', () => {
      const name = cell.getAttribute('data-name');
      const house = cell.getAttribute('data-house');
      const cached = Object.keys(fragStore).find(k => fragStore[k].name && fragStore[k].name.toLowerCase() === name.toLowerCase());
      if (cached) { openFrag(cached); return; }
      searchFragella(name + (house ? ' ' + house : '')).then(frags => {
        if (!frags.length) return;
        const key = 'fav' + Math.random().toString(36).slice(2, 8);
        fragStore[key] = frags[0];
        openFrag(key);
      });
    });
  });
}

// ═══════ DELETE ENTRIES ═══════
async function deleteDiaryEntry(id) {
  if (!id) return;
  diary = diary.filter(e => String(e.id) !== String(id));
  if (user) sb.from('journal_entries').delete().eq('id', id).catch(() => {});
  else saveLocal();
  renderDiary();
  updateRightSidebar();
  toast('Entry removed');
}

async function deleteCollectionItem(id, name) {
  if (!id && !name) return;
  collection = id
    ? collection.filter(b => String(b.id) !== String(id))
    : collection.filter(b => b.name !== name);
  if (user && id) sb.from('collection').delete().eq('id', id).catch(() => {});
  else saveLocal();
  renderCollection();
  updateRightSidebar();
  toast('Removed from hive');
}

// ═══════ PROFILE EDIT ═══════
function openEditProfile() {
  if (!user) { toast('Sign in to edit your profile'); return; }
  const name = user.user_metadata?.name || user.email?.split('@')[0] || '';
  const bio = user.user_metadata?.bio || '';
  document.getElementById('edit-display-name').value = name;
  document.getElementById('edit-bio').value = bio;
  openModal('modal-profile-edit');
}

async function saveProfileName() {
  const name = document.getElementById('edit-display-name').value.trim();
  const bio = document.getElementById('edit-bio').value.trim();
  if (!name) { toast('Please enter a name'); return; }
  try {
    const { error } = await sb.auth.updateUser({ data: { name, bio } });
    if (error) throw error;
    if (user && user.user_metadata) { user.user_metadata.name = name; user.user_metadata.bio = bio; }
    closeModal('modal-profile-edit');
    renderProfile();
    toast('✓ Profile updated');
  } catch (e) {
    toast('Could not save — please try again');
  }
}

// ═══════ REAL COMMUNITY FEED ═══════
async function loadCommunityFeed() {
  const el = document.getElementById('community-diary-feed') || document.getElementById('review-feed');
  if (!el) return;
  try {
    const { data } = await sb.from('journal_entries')
      .select('fragrance_name, house, image_url, rating, notes, worn_at')
      .not('notes', 'is', null)
      .neq('notes', '')
      .order('worn_at', { ascending: false })
      .limit(12);
    if (!data || data.length === 0) {
      el.innerHTML = '<div style="padding:20px 24px;font-size:13px;color:var(--grey);font-style:italic">No entries yet — be the first to log a fragrance.</div>';
      return;
    }
    el.innerHTML = data.map(e => {
      const d = new Date(e.worn_at);
      const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const stars = e.rating ? '★'.repeat(e.rating) + '<span style="color:var(--grey2)">' + '★'.repeat(5-e.rating) + '</span>' : '';
      const imgHtml = e.image_url
        ? makeImg(e.image_url, e.fragrance_name)
        : '<span style="font-size:20px;opacity:0.4">🏺</span>';
      return '<div class="review-card">' +
        '<div class="review-bottle">' + imgHtml + '</div>' +
        '<div class="review-content">' +
          '<div class="review-top">' +
            '<div class="review-frag">' + escapeHtml(e.fragrance_name) + '</div>' +
            (stars ? '<div class="review-stars">' + stars + '</div>' : '') +
          '</div>' +
          '<div class="review-house">' + escapeHtml(e.house || '') + ' · ' + dateStr + '</div>' +
          (e.notes ? '<div class="review-text">"' + escapeHtml(e.notes) + '"</div>' : '') +
        '</div>' +
      '</div>';
    }).join('');
  } catch (e) {
    el.innerHTML = '<div style="padding:20px;font-size:12px;color:var(--grey)">Could not load community entries.</div>';
  }
}

// ═══════ ARTICLES — Supabase powered ═══════
function renderJournalGuides() {
  const el = document.getElementById('journal-guide-row');
  if (!el) return;
  const guides = [
    {
      kicker: 'Starter guide',
      title: 'Find your signature',
      sub: 'Begin with versatile scents people actually wear daily.',
      query: 'signature fragrance versatile'
    },
    {
      kicker: 'Work rotation',
      title: 'Smell expensive at the office',
      sub: 'Clean, polished picks that stay close and professional.',
      query: 'office fragrance clean professional'
    },
    {
      kicker: 'Evening picks',
      title: 'Date-night without shouting',
      sub: 'Warm, memorable scents with controlled projection.',
      query: 'date night fragrance warm'
    }
  ];
  el.innerHTML = guides.map(g =>
    '<div class="journal-guide-card" data-query="' + escapeAttr(g.query) + '">' +
      '<div class="journal-guide-kicker">' + escapeHtml(g.kicker) + '</div>' +
      '<div class="journal-guide-title">' + escapeHtml(g.title) + '</div>' +
      '<div class="journal-guide-sub">' + escapeHtml(g.sub) + '</div>' +
      '<div class="journal-guide-cta">Open shelf →</div>' +
    '</div>'
  ).join('');
  el.querySelectorAll('.journal-guide-card').forEach(card => {
    card.addEventListener('click', () => triggerSearch(card.getAttribute('data-query') || 'fragrance guide'));
  });
}

async function loadArticlesList() {
  const el = document.getElementById('article-list');
  const featuredEl = document.getElementById('article-featured');
  if (!el) return;
  try {
    const { data } = await sb
      .from('articles')
      .select('id, title, slug, excerpt, author, read_time, published_at')
      .eq('published', true)
      .order('published_at', { ascending: false })
      .limit(10);

    if (!data || data.length === 0) {
      if (loadArticlesList._seeding) { el.innerHTML = '<div style="padding:20px;color:var(--grey);font-size:12px;font-style:italic">Articles coming soon.</div>'; return; }
      loadArticlesList._seeding = true;
      await seedArticles();
      loadArticlesList._seeding = false;
      return loadArticlesList();
    }

    // Featured = most recent
    const featured = data[0];
    if (featuredEl) {
      featuredEl.innerHTML =
        '<div class="article-feature" data-slug="' + escapeAttr(featured.slug) + '">' +
          '<div class="article-feature-tag">ScentHive Journal · ' + escapeHtml(featured.read_time || '5 min read') + '</div>' +
          '<div class="article-feature-title">' + escapeHtml(featured.title) + '</div>' +
          '<div class="article-feature-excerpt">' + escapeHtml(featured.excerpt || '') + '</div>' +
          '<div class="article-feature-meta">By ' + escapeHtml(featured.author || 'ScentHive') + '</div>' +
        '</div>';
      featuredEl.querySelector('.article-feature').addEventListener('click', function() {
        openArticleFromDb(this.getAttribute('data-slug'));
      });
    }

    // Rest of articles
    const rest = data.slice(1);
    el.innerHTML = rest.length ? rest.map(a =>
      '<div class="article-card" data-slug="' + escapeAttr(a.slug) + '">' +
        '<div class="article-card-source">ScentHive Journal · ' + escapeHtml(a.read_time || '5 min read') + '</div>' +
        '<div class="article-card-title">' + escapeHtml(a.title) + '</div>' +
        '<div class="article-card-meta">' + escapeHtml(a.excerpt || '') + '</div>' +
      '</div>'
    ).join('') : '<div style="padding:20px;color:var(--grey);font-size:13px;font-style:italic">More articles coming soon.</div>';

    el.querySelectorAll('.article-card').forEach(card => {
      card.addEventListener('click', function() {
        openArticleFromDb(this.getAttribute('data-slug'));
      });
    });

  } catch (e) {
    el.innerHTML = '<div style="padding:20px;color:var(--grey);font-size:12px">Could not load articles.</div>';
  }
}

async function openArticleFromDb(slug) {
  try {
    const { data } = await sb
      .from('articles')
      .select('*')
      .eq('slug', slug)
      .single();
    if (!data) return;
    const d = new Date(data.published_at);
    const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('article-content').innerHTML =
      '<div style="font-family:DM Mono,monospace;font-size:10px;color:var(--gold);letter-spacing:0.16em;text-transform:uppercase;margin-bottom:12px">ScentHive Journal</div>' +
      '<h1 style="font-family:Playfair Display,serif;font-size:32px;line-height:1.1;font-weight:400;margin-bottom:12px">' + escapeHtml(data.title) + '</h1>' +
      '<div style="font-family:DM Mono,monospace;font-size:11px;color:var(--grey);margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid var(--border2)">' +
        escapeHtml(data.read_time || '5 min read') + ' · By ' + escapeHtml(data.author || 'ScentHive') + ' · ' + dateStr +
      '</div>' +
      '<div style="font-size:15px;line-height:1.8;color:var(--white2)" id="article-body">' + data.body + '</div>';
    // Style paragraphs
    document.querySelectorAll('#article-body p').forEach(p => p.style.marginBottom = '18px');
    document.querySelectorAll('#article-body h2,#article-body h3').forEach(h => {
      h.style.fontFamily = 'Playfair Display,serif';
      h.style.fontSize = h.tagName === 'H2' ? '24px' : '20px';
      h.style.fontStyle = 'italic';
      h.style.color = 'var(--gold-light)';
      h.style.margin = '28px 0 12px';
      h.style.fontWeight = '400';
    });
    document.querySelectorAll('#article-body strong').forEach(s => {
      s.style.color = 'var(--white)';
      s.style.fontWeight = '500';
    });
    showScreen('article');
  } catch (e) {
    console.error('Article load error:', e);
  }
}

async function seedArticles() {
  const articles = [
    {
      title: "A beginner's guide to niche fragrance",
      slug: "niche-guide",
      excerpt: "If you have outgrown designer fragrance and want to explore niche, here are the houses that matter.",
      read_time: "12 min read",
      author: "ScentHive",
      body: "<p>Niche fragrances are produced outside the major designer labels. Smaller houses, bigger budgets per bottle. Not always better. Often weirder.</p><h3>Xerjoff</h3><p>Italian luxury. Naxos and Erba Pura are modern classics. Pricing is steep but justified.</p><h3>Maison Francis Kurkdjian</h3><p>Home of Baccarat Rouge 540. The most polarising fragrance of the last decade. Try a sample before buying.</p><h3>Amouage</h3><p>Omani house focused on opulence. Interlude Man and Reflection Man are both highly regarded.</p><h3>Parfums de Marly</h3><p>Layton and Herod are gateway niche scents that designer wearers tend to love.</p><p>Niche exploration takes years and a lot of sampling. Decant sites like Lucky Scent let you try before committing.</p>"
    },
    {
      title: "The truth about reformulations",
      slug: "reformulations",
      excerpt: "Your favourite fragrance smells different now. You are not imagining it.",
      read_time: "3 min read",
      author: "ScentHive",
      body: "<p>Reformulations happen for three reasons.</p><h3>1. IFRA regulations</h3><p>The International Fragrance Association restricts ingredients deemed allergenic. Oakmoss, certain musks, and natural extracts have all been hit. Perfumers must reformulate using synthetic substitutes.</p><h3>2. Cost reduction</h3><p>When a fragrance becomes wildly successful, brands often quietly swap expensive naturals for cheaper alternatives. The bottle stays the same. The smell changes.</p><h3>3. Brand acquisition</h3><p>When a niche house is acquired by a conglomerate, formulations shift to align with corporate sourcing.</p><p>How do you tell? Look for batch codes. Older codes typically indicate older formulations. ScentHive can help you date a bottle before you buy.</p>"
    },
    {
      title: "A guide to layering fragrances properly",
      slug: "layering",
      excerpt: "Most layering advice is bad. Here is what actually works.",
      read_time: "5 min read",
      author: "ScentHive",
      body: "<p>Most layering advice online is wrong. People recommend pairing fragrances that already share notes. This produces a muddy, unfocused result.</p><p>Good layering follows one principle: <strong>contrast creates clarity</strong>.</p><p>Pair a rich dark base (Tobacco Vanille, Naxos) with a bright top (lemon cologne, neroli). Pair a clean white musk with a smoky oud. The contrast lets each fragrance breathe.</p><h3>Three combinations that work</h3><p>Naxos + any citrus EDC</p><p>Tobacco Vanille + Cologne Indelébile by Frederic Malle</p><p>Oud Wood + Mojave Ghost</p><p>Avoid layering two heavy fragrances. Avoid layering two of the same family. The point is a third dimension neither has alone.</p>"
    },
    {
      title: "10 summer fragrances that are not generic",
      slug: "summer",
      excerpt: "Beyond Acqua di Gio — what to wear when it is hot.",
      read_time: "6 min read",
      author: "ScentHive",
      body: "<p>Acqua di Gio. Bleu de Chanel. Sauvage. You already know these. Here are ten less-obvious summer fragrances that will not smell like everyone else at the beach.</p><p><strong>1. Mandarino di Amalfi by Tom Ford</strong> — bright Italian citrus done with elegance.</p><p><strong>2. Erba Pura by Xerjoff</strong> — sunshine in a bottle.</p><p><strong>3. Eau Sauvage by Dior</strong> — a 1966 cologne that still feels modern.</p><p><strong>4. Cologne Indelébile by Frederic Malle</strong> — citrus and white musk done luxuriously.</p><p><strong>5. Reflection Man by Amouage</strong> — clean elegance to the extreme.</p><p><strong>6. Mojave Ghost by Byredo</strong> — desert flowers, dry and ethereal.</p><p><strong>7. Nishane Hacivat</strong> — pineapple done seriously.</p><p><strong>8. L'Eau d'Issey Pour Homme</strong> — aquatic without being basic.</p><p><strong>9. Viking by Creed</strong> — bold and adventurous.</p><p><strong>10. Erba Pura by Xerjoff</strong> — pure joy, hot weather perfected.</p>"
    },
    {
      title: "How decants saved fragrance collecting",
      slug: "decants",
      excerpt: "Why splitting a bottle changed everything for the community.",
      read_time: "4 min read",
      author: "ScentHive",
      body: "<p>A decade ago, sampling expensive fragrances meant visiting a department store or buying a full bottle and hoping. Decanting changed everything.</p><p>A decant is a small sample — usually 5ml or 10ml — split from a full bottle. Decant communities made expensive niche houses accessible to people who could not justify spending hundreds on a bottle.</p><h3>The benefits</h3><p>You can sample 20 fragrances for the price of a single bottle. Build a wardrobe of dozens of scents without breaking your budget.</p><h3>The risks</h3><p>Counterfeit decants are common. Buy from established sites like LuckyScent and The Perfumed Court, or trusted community sellers.</p><p>Decants are how serious noses are built. There is no other way to smell 100 fragrances in a year on a normal budget.</p>"
    }
  ];
  try {
    await sb.from("articles").upsert(articles, { onConflict: "slug", ignoreDuplicates: true });
  } catch (e) {
    console.error("Seed error:", e);
  }
}



// Keep openArticle for backwards compat
function openArticle(slug) {
  openArticleFromDb(slug);
}

// ═══════ AI RECOMMENDATIONS ═══════
const AI_URL = '/api/ai';
let aiUsageCount = 0;
const AI_FREE_LIMIT = 3;

// ── TASTE TEST DATA ──
const TASTE_QUESTIONS = [
  {
    id: 'mood',
    q: 'What feeling are you chasing when you reach for a fragrance?',
    choices: [
      { label: '🌿 Fresh & clean — I want to feel put-together', value: 'fresh', weights: { freshness: 3, darkness: 0, sweetness: 0 } },
      { label: '🔥 Bold & intense — I want to leave an impression', value: 'bold', weights: { freshness: 0, darkness: 2, sweetness: 0 } },
      { label: '🌸 Soft & intimate — warm, close, personal', value: 'soft', weights: { freshness: 1, darkness: 0, sweetness: 2 } },
      { label: '🌙 Dark & mysterious — edgy, complex, unexpected', value: 'dark', weights: { freshness: 0, darkness: 3, sweetness: 1 } }
    ]
  },
  {
    id: 'season',
    q: 'Which season feels most like your signature?',
    choices: [
      { label: '❄️ Winter — cold air, heavy scents, long nights', value: 'winter', weights: { freshness: 0, darkness: 2, sweetness: 1 } },
      { label: '🍂 Autumn — warm spice, woodsmoke, falling leaves', value: 'autumn', weights: { freshness: 0, darkness: 1, sweetness: 2 } },
      { label: '🌸 Spring — green, optimistic, lightly floral', value: 'spring', weights: { freshness: 2, darkness: 0, sweetness: 1 } },
      { label: '☀️ Summer — clean sweat, citrus, sea breeze', value: 'summer', weights: { freshness: 3, darkness: 0, sweetness: 0 } }
    ]
  },
  {
    id: 'intensity',
    q: 'How loud should your fragrance be?',
    choices: [
      { label: '🤫 Skin-close — only I can smell it', value: 'quiet', weights: { intensity: 0 } },
      { label: '💬 Noticeable — people get a hint when close', value: 'moderate', weights: { intensity: 1 } },
      { label: '📣 Presence — the room knows you\'re wearing it', value: 'loud', weights: { intensity: 2 } },
      { label: '⚡ Statement — unforgettable, a little dangerous', value: 'beast', weights: { intensity: 3 } }
    ]
  },
  {
    id: 'sweetness',
    q: 'How sweet do you like it?',
    choices: [
      { label: '🍋 Zero sugar — dry, sharp, mineral', value: 'dry', weights: { sweetness: 0, freshness: 1 } },
      { label: '🌿 Barely there — a light rounded edge', value: 'light', weights: { sweetness: 1 } },
      { label: '🍯 Warm & rounded — amber, soft vanilla', value: 'warm', weights: { sweetness: 3 } },
      { label: '🍫 Full dessert — rich, deep, borderline edible', value: 'sweet', weights: { sweetness: 4, darkness: 1 } }
    ]
  },
  {
    id: 'memory',
    q: 'Which smell instantly triggers a memory?',
    choices: [
      { label: '🌲 Forests, rain on earth, damp wood', value: 'wood', weights: { freshness: 1, darkness: 2 } },
      { label: '🌊 Ocean, sea breeze, clean open air', value: 'aquatic', weights: { freshness: 4, darkness: 0 } },
      { label: '🕯️ Leather, smoke, old books, incense', value: 'leather', weights: { freshness: 0, darkness: 4 } },
      { label: '🌹 Flowers, clean laundry, garden in the morning', value: 'floral', weights: { freshness: 2, sweetness: 1 } },
      { label: '🍰 Bakery, vanilla, warm spices, amber', value: 'gourmand', weights: { sweetness: 4, darkness: 1 } }
    ]
  }
];

const TASTE_PROFILES = {
  CLEAN_SLATE: { name: 'The Clean Slate', emoji: '🌿', tagline: 'Your nose craves clarity. Fresh, crisp, and effortlessly modern.', traits: ['Fresh & aquatic', 'Citrus-forward', 'Office-ready'], queries: ['Acqua di Gio Profumo', 'Bleu de Chanel EDP', 'Light Blue Dolce Gabbana', 'Terre Hermes', 'Reflection Man Amouage'] },
  SPRING_GARDEN: { name: 'The Spring Garden', emoji: '🌸', tagline: 'Optimistic, approachable, and quietly beautiful.', traits: ['Floral & green', 'Lightly sweet', 'Daytime signature'], queries: ['Chloe EDP', 'Miss Dior Blooming Bouquet', 'Daisy Marc Jacobs', 'Erba Pura Xerjoff', 'Lime Basil Mandarin Jo Malone'] },
  NIGHT_WATCH: { name: 'The Night Watch', emoji: '🌙', tagline: 'You wear the dark with precision. Intense, dry, and impossible to ignore.', traits: ['Smoky & leathery', 'Low sweetness', 'High projection'], queries: ['Encre Noire Lalique', 'Black Afgano Nasomatto', 'Memoir Man Amouage', 'Sycomore Chanel', 'Fahrenheit Dior'] },
  VELVET_CAVE: { name: 'The Velvet Cave', emoji: '🖤', tagline: 'Rich, enveloping, and unapologetically seductive. You don\'t walk in — you arrive.', traits: ['Oriental & dark', 'Deeply sweet', 'Long-lasting sillage'], queries: ['Tobacco Vanille Tom Ford', 'Black Phantom Kilian', 'Lost Cherry Tom Ford', 'Interlude Man Amouage', 'Oud Wood Tom Ford'] },
  GOLDEN_HOUR: { name: 'The Golden Hour', emoji: '🍯', tagline: 'Warm, magnetic, and skin-flattering. The scent people ask about.', traits: ['Warm oriental', 'Amber & vanilla', 'Intimate sillage'], queries: ['Baccarat Rouge 540', 'Naxos Xerjoff', 'Bal d\'Afrique Byredo', 'Portrait of a Lady Frederic Malle', 'Libre YSL'] },
  FOREST_WALKER: { name: 'The Forest Walker', emoji: '🌲', tagline: 'Grounded, complex, and quietly confident. You earn compliments rather than demanding them.', traits: ['Woody & earthy', 'Balanced intensity', 'All-season'], queries: ['Santal 33 Le Labo', 'Vetiver Guerlain', 'Tam Dao Diptyque', 'Herod Parfums de Marly', 'Terre Hermes EDT'] },
  THE_STATEMENT: { name: 'The Statement', emoji: '⚡', tagline: 'Your fragrance walks into the room before you do — and that\'s exactly the plan.', traits: ['Maximum projection', 'Complex & unusual', 'Conversation-starter'], queries: ['Aventus Creed', 'Sauvage Elixir Dior', 'Viking Creed', 'Interlude Man Amouage', 'Musc Ravageur Frederic Malle'] },
  THE_CURATOR: { name: 'The Curator', emoji: '🏺', tagline: 'Refined and versatile. You have strong taste and the restraint not to shout about it.', traits: ['Classic structure', 'Refined balance', 'Occasion-agnostic'], queries: ['Bleu de Chanel EDP', 'Y EDP YSL', 'Oud Wood Tom Ford', 'Naxos Xerjoff', 'Silver Mountain Water Creed'] }
};

let _tasteAnswers = {};
let _tasteStep = 0;

function openAI() {
  const prompt = document.getElementById('ai-prompt');
  if (prompt) prompt.value = '';
  const results = document.getElementById('ai-results');
  if (results) results.innerHTML = '';
  // Pre-fill context chips from collection + diary
  const chips = document.getElementById('ai-context-chips');
  if (chips) {
    const top = [...collection].slice(0, 4).map(b => b.name).filter(Boolean);
    chips.innerHTML = top.length
      ? top.map(n => `<span class="ai-context-chip">🏺 ${escapeHtml(n)}</span>`).join('') +
        `<span class="ai-context-chip" style="color:var(--grey);border-style:dashed">from your hive</span>`
      : '';
  }
  openModal('modal-ai');
  setTimeout(() => document.getElementById('ai-prompt')?.focus(), 200);
}

let _sampleVibe = 'signature';
let _sampleBudget = '35';

const SAMPLE_SET_POOLS = {
  signature: [
    ['Bleu de Chanel EDP', 'Control: polished designer benchmark'],
    ['Gris Charnel BDK', 'Modern woody comfort with niche character'],
    ['Naxos Xerjoff', 'Warm statement without going fully loud'],
    ['Terre Hermes EDT', 'Dry citrus/wood classic with grown-up structure'],
    ['Gentle Fluidity Silver Maison Francis Kurkdjian', 'Clean metallic-musky daily signature']
  ],
  office: [
    ['Prada L Homme', 'Clean iris and soap, easy professional wear'],
    ['Reflection Man Amouage', 'Polished white floral freshness'],
    ['Molecule 01 Escentric Molecules', 'Minimal skin scent benchmark'],
    ['Grey Vetiver Tom Ford', 'Dry vetiver, crisp shirt energy'],
    ['L Eau d Issey Pour Homme Issey Miyake', 'Transparent citrus-aquatic classic']
  ],
  date: [
    ['La Nuit de l Homme YSL', 'Cardamom warmth, intimate and familiar'],
    ['Grand Soir Maison Francis Kurkdjian', 'Amber glow with dressed-up confidence'],
    ['Angels Share Kilian', 'Boozy cinnamon sweetness for evening'],
    ['Musc Ravageur Frederic Malle', 'Warm musk and spice, sensual but adult'],
    ['Dior Homme Intense', 'Iris, woods, and soft projection']
  ],
  summer: [
    ['Imagination Louis Vuitton', 'Premium citrus tea freshness'],
    ['Wulong Cha Nishane', 'Tea-citrus lift with niche polish'],
    ['Light Blue Eau Intense Dolce Gabbana', 'Salty summer freshness benchmark'],
    ['Neroli Portofino Tom Ford', 'Clean Mediterranean neroli'],
    ['Virgin Island Water Creed', 'Lime coconut vacation profile']
  ],
  wildcard: [
    ['Ganymede Marc-Antoine Barrois', 'Mineral leather wildcard'],
    ['Philosykos Diptyque', 'Green fig and woody milkiness'],
    ['Portrait of a Lady Frederic Malle', 'Rose-patchouli power reference'],
    ['Mojave Ghost Byredo', 'Soft musky floral with easy niche appeal'],
    ['Hacivat Nishane', 'Bright mossy pineapple structure']
  ]
};

function setupSampleBuilderOptions() {
  document.querySelectorAll('#sample-vibe-options .sample-option').forEach(btn => {
    btn.onclick = () => {
      _sampleVibe = btn.getAttribute('data-value') || 'signature';
      document.querySelectorAll('#sample-vibe-options .sample-option').forEach(b => b.classList.toggle('active', b === btn));
    };
  });
  document.querySelectorAll('#sample-budget-options .sample-option').forEach(btn => {
    btn.onclick = () => {
      _sampleBudget = btn.getAttribute('data-value') || '35';
      document.querySelectorAll('#sample-budget-options .sample-option').forEach(b => b.classList.toggle('active', b === btn));
    };
  });
}

function openSampleBuilder(vibe) {
  if (vibe && SAMPLE_SET_POOLS[vibe]) _sampleVibe = vibe;
  const results = document.getElementById('sample-builder-results');
  if (results) {
    results.innerHTML = '<div class="sample-builder-empty">Choose a mission, then build your 5-sample path.</div>';
  }
  openModal('modal-sample-builder');
  setupSampleBuilderOptions();
  document.querySelectorAll('#sample-vibe-options .sample-option').forEach(b => b.classList.toggle('active', b.getAttribute('data-value') === _sampleVibe));
  document.querySelectorAll('#sample-budget-options .sample-option').forEach(b => b.classList.toggle('active', b.getAttribute('data-value') === _sampleBudget));
}

async function buildSampleSet() {
  const el = document.getElementById('sample-builder-results');
  if (!el) return;
  const profile = getTasteProfile();
  const pool = SAMPLE_SET_POOLS[_sampleVibe] || SAMPLE_SET_POOLS.signature;
  const profileExtra = profile?.queries?.[0] ? [[profile.queries[0], 'Personal taste-profile anchor']] : [];
  const plan = [...profileExtra, ...pool].slice(0, 5);
  const budgetLabel = _sampleBudget === '100' ? 'flexible budget' : 'target under €' + _sampleBudget;

  el.innerHTML = '<div class="sample-builder-empty"><div class="spinner" style="margin:0 auto 10px"></div>Building your set…</div>';
  const cards = [];
  for (const [query, reason] of plan) {
    try {
      const results = await searchFragella(query);
      const f = results?.[0];
      if (!f) continue;
      const key = 'ss' + Math.random().toString(36).slice(2, 8);
      fragStore[key] = f;
      cards.push({ key, f, reason });
    } catch (e) {}
  }

  if (!cards.length) {
    el.innerHTML = '<div class="sample-builder-empty">Could not build the set right now. Try again in a moment.</div>';
    return;
  }

  el.innerHTML =
    '<div class="sample-builder-summary">' +
      '<strong>5-sample path</strong><span>' + escapeHtml(budgetLabel) + ' · sample before bottle</span>' +
    '</div>' +
    cards.map(({ key, f, reason }, i) => `
      <div class="sample-set-card" data-key="${key}">
        <div class="sample-set-num">${String(i + 1).padStart(2, '0')}</div>
        <div class="sample-set-body">
          <div class="sample-set-name">${escapeHtml(f.name || '')}</div>
          <div class="sample-set-house">${escapeHtml(f.house || '')}</div>
          <div class="sample-set-reason">${escapeHtml(reason)}</div>
        </div>
        <button class="sample-set-open">Open</button>
      </div>
    `).join('') +
    '<button class="sample-builder-pro" onclick="openUpgrade()">Unlock full Pro set with blind-buy risk and shop links</button>';

  el.querySelectorAll('.sample-set-card').forEach(card => {
    card.addEventListener('click', () => openFrag(card.getAttribute('data-key')));
  });
}

function openTasteTest() {
  _tasteAnswers = {};
  _tasteStep = 0;
  const stepEl = document.getElementById('taste-step');
  const loadEl = document.getElementById('taste-loading');
  const resEl = document.getElementById('taste-result');
  if (stepEl) stepEl.style.display = '';
  if (loadEl) loadEl.style.display = 'none';
  if (resEl) resEl.style.display = 'none';
  openModal('modal-taste');
  renderTasteStep();
}

function renderTasteStep() {
  const q = TASTE_QUESTIONS[_tasteStep];
  const fill = document.getElementById('taste-progress-fill');
  const label = document.getElementById('taste-progress-label');
  const qEl = document.getElementById('taste-question');
  const cEl = document.getElementById('taste-choices');
  if (!q || !cEl) return;

  const pct = Math.round((_tasteStep / TASTE_QUESTIONS.length) * 100);
  if (fill) fill.style.width = pct + '%';
  if (label) label.textContent = (_tasteStep + 1) + ' / ' + TASTE_QUESTIONS.length;
  if (qEl) qEl.textContent = q.q;

  cEl.innerHTML = q.choices
    .map(c => `<button class="taste-choice-btn" data-val="${escapeAttr(c.value)}">${c.label}</button>`)
    .join('');

  cEl.querySelectorAll('.taste-choice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _tasteAnswers[q.id] = btn.getAttribute('data-val');
      _tasteStep++;
      if (_tasteStep >= TASTE_QUESTIONS.length) finishTasteTest();
      else renderTasteStep();
    });
  });
}

function deriveTasteProfile(answers) {
  const s = { freshness: 0, darkness: 0, sweetness: 0, intensity: 0 };
  for (const [qId, val] of Object.entries(answers)) {
    const q = TASTE_QUESTIONS.find(q => q.id === qId);
    const c = q?.choices.find(c => c.value === val);
    if (c?.weights) {
      for (const [k, v] of Object.entries(c.weights)) s[k] = (s[k] || 0) + v;
    }
  }
  const f = s.freshness, d = s.darkness, sw = s.sweetness, i = s.intensity;
  if (i >= 3) return { key: 'THE_STATEMENT', ...TASTE_PROFILES.THE_STATEMENT };
  if (f >= 5 && sw <= 2) return { key: 'CLEAN_SLATE', ...TASTE_PROFILES.CLEAN_SLATE };
  if (f >= 4 && sw >= 3) return { key: 'SPRING_GARDEN', ...TASTE_PROFILES.SPRING_GARDEN };
  if (d >= 5 && sw <= 2) return { key: 'NIGHT_WATCH', ...TASTE_PROFILES.NIGHT_WATCH };
  if (d >= 4 && sw >= 5) return { key: 'VELVET_CAVE', ...TASTE_PROFILES.VELVET_CAVE };
  if (sw >= 5 && d >= 2) return { key: 'GOLDEN_HOUR', ...TASTE_PROFILES.GOLDEN_HOUR };
  if (d >= 3 && f >= 3) return { key: 'FOREST_WALKER', ...TASTE_PROFILES.FOREST_WALKER };
  return { key: 'THE_CURATOR', ...TASTE_PROFILES.THE_CURATOR };
}

async function finishTasteTest() {
  const stepEl = document.getElementById('taste-step');
  const loadEl = document.getElementById('taste-loading');
  const fill = document.getElementById('taste-progress-fill');
  if (fill) fill.style.width = '100%';
  if (stepEl) stepEl.style.display = 'none';
  if (loadEl) loadEl.style.display = '';

  const profile = deriveTasteProfile(_tasteAnswers);
  try {
    localStorage.setItem('sh_taste_profile', JSON.stringify({
      key: profile.key,
      name: profile.name,
      traits: profile.traits,
      queries: profile.queries,
      answers: _tasteAnswers,
      createdAt: new Date().toISOString()
    }));
  } catch(e) {}

  let aiRecs = null;
  try {
    const summary = Object.entries(_tasteAnswers).map(([qId, val]) => {
      const q = TASTE_QUESTIONS.find(q => q.id === qId);
      const c = q?.choices.find(c => c.value === val);
      return c ? c.label.replace(/^[^\w]+\s/, '').replace(/ —.*$/, '') : val;
    }).join(', ');
    const aiPrompt = `My scent profile is "${profile.name}". My preferences: ${summary}. Recommend 5 specific fragrances that match this profile. Include the exact house name.`;
    const col = collection.slice(0, 8).map(b => ({ name: b.name, house: b.house }));
    const res = await fetch(AI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: aiPrompt, collection: col })
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.recommendations) && data.recommendations.length) aiRecs = data.recommendations;
    }
  } catch(e) {}

  if (user && sb) {
    try {
      const tasteProfile = { key: profile.key, name: profile.name, updatedAt: new Date().toISOString() };
      await sb.auth.updateUser({ data: { taste_profile: tasteProfile } });
      if (user.user_metadata) user.user_metadata.taste_profile = tasteProfile;
    } catch(e) {}
  }

  if (loadEl) loadEl.style.display = 'none';
  renderTasteResult(profile, aiRecs);
}

function renderTasteResult(profile, aiRecs) {
  const el = document.getElementById('taste-result');
  if (!el) return;

  const matchRows = aiRecs
    ? aiRecs.slice(0, 5).map(r => {
        const n = escapeHtml(r.name || ''), h = escapeHtml(r.house || '');
        return `<button class="taste-match-btn" onclick="searchAndOpen(${JSON.stringify(r.name || '')},${JSON.stringify(r.house || '')});closeModal('modal-taste')">
          <span><span style="color:var(--white)">${n}</span>${h ? ` <span style="font-size:11px;color:var(--grey)">${h}</span>` : ''}</span>
          <span class="taste-match-arrow">→</span></button>`;
      }).join('')
    : profile.queries.map(q =>
        `<button class="taste-match-btn" onclick="triggerSearch(${JSON.stringify(q)});closeModal('modal-taste')">
          <span style="color:var(--white)">${escapeHtml(q)}</span>
          <span class="taste-match-arrow">→</span></button>`
      ).join('');

  el.innerHTML = `
    <div class="taste-result-hero">
      <div class="taste-result-emoji">${profile.emoji}</div>
      <div class="taste-result-name">${escapeHtml(profile.name)}</div>
      <div class="taste-result-tagline">${escapeHtml(profile.tagline)}</div>
      <div class="taste-result-traits">
        ${profile.traits.map(t => `<span class="taste-result-trait">${escapeHtml(t)}</span>`).join('')}
      </div>
    </div>
    <div class="taste-matches-label">Your fragrance matches</div>
    ${matchRows}
    <div class="taste-result-actions">
      <button class="modal-submit" onclick="openTasteTest()">↩ Retake the test</button>
      <button class="modal-cancel" onclick="closeModal('modal-taste')">Close</button>
    </div>`;
  el.style.display = '';
}

async function askAI() {
  if (!user && aiUsageCount >= AI_FREE_LIMIT) {
    toast('Sign in to get unlimited recommendations');
    return;
  }
  const promptEl = document.getElementById('ai-prompt');
  const q = (promptEl?.value || '').trim();
  if (!q) { toast('Describe what you love first'); return; }

  const btn = document.getElementById('ai-ask-btn');
  const resultsEl = document.getElementById('ai-results');
  if (btn) { btn.disabled = true; btn.textContent = '✨ Thinking…'; }
  if (resultsEl) resultsEl.innerHTML = '<div style="text-align:center;padding:24px 0"><div class="spinner"></div><div style="font-size:11px;color:var(--grey);margin-top:10px;font-style:italic">Consulting the nose…</div></div>';

  try {
    const col = collection.slice(0, 10).map(b => ({ name: b.name, house: b.house }));
    const diaryCtx = diary.filter(e => e.rating >= 4).slice(0, 6).map(e => e.fragrance_name).filter(Boolean);
    const prompt = q + (diaryCtx.length ? '\n\nI rate these highly: ' + diaryCtx.join(', ') : '');

    const res = await fetch(AI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, collection: col })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    aiUsageCount++;
    renderAIResults(data, resultsEl);
  } catch (e) {
    if (resultsEl) resultsEl.innerHTML = '<div style="padding:14px;font-size:12px;color:var(--red);font-style:italic">Error: ' + escapeHtml(e.message || 'Unknown error') + '</div>';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✨ Get recommendations'; }
  }
}

function renderAIResults(data, el) {
  if (!el) return;
  const intro = data.intro ? `<div class="ai-intro">${escapeHtml(data.intro)}</div>` : '';
  const recs = Array.isArray(data.recommendations) ? data.recommendations : [];
  if (!recs.length) {
    el.innerHTML = intro + '<div style="font-size:12px;color:var(--grey);font-style:italic;padding:8px 0">No recommendations returned — try rephrasing.</div>';
    return;
  }
  el.innerHTML = intro + recs.map(r => {
    const notes = Array.isArray(r.notes) ? r.notes.slice(0, 4) : [];
    const notesHtml = notes.map(n => `<span class="ai-rec-chip">${escapeHtml(n)}</span>`).join('');
    const occ = r.occasion ? `<span class="ai-rec-chip occ">${escapeHtml(r.occasion)}</span>` : '';
    const price = r.price ? `<span class="ai-rec-chip price">${escapeHtml(r.price)}</span>` : '';
    const dupe = r.is_dupe ? '<span class="ai-dupe-badge">dupe</span>' : '';
    const buyQ = encodeURIComponent((r.name || '') + ' ' + (r.house || ''));
    return `<div class="ai-rec-card">
      <div class="ai-rec-top">
        <div>
          <div class="ai-rec-name">${escapeHtml(r.name || '')}</div>
          <div class="ai-rec-house">${escapeHtml(r.house || '')}</div>
        </div>
        ${dupe}
      </div>
      <div class="ai-rec-why">"${escapeHtml(r.why || '')}"</div>
      <div class="ai-rec-meta">${notesHtml}${occ}${price}</div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="frag-btn frag-btn-primary" style="flex:1;font-size:11px;padding:8px 0" onclick="searchAndOpen(${JSON.stringify(r.name)},${JSON.stringify(r.house||'')})">View details</button>
        <a class="frag-btn frag-btn-secondary" style="flex:1;font-size:11px;padding:8px 0;text-align:center;text-decoration:none" href="https://www.notino.no/search/?phrase=${buyQ}" target="_blank" rel="noopener">Buy →</a>
      </div>
    </div>`;
  }).join('');
}

function searchAndOpen(name, house) {
  closeModal('modal-ai');
  searchFragella(name + (house ? ' ' + house : '')).then(frags => {
    if (!frags.length) { toast('Searching…'); return; }
    const key = 'ai' + Math.random().toString(36).slice(2, 8);
    fragStore[key] = frags[0];
    openFrag(key);
  });
}

// ═══════ EVENT WIRING ═══════
function wireEvents() {
  // Modal close on overlay click
  document.querySelectorAll('.modal-overlay').forEach(o => {
    o.addEventListener('click', function(e) {
      if (e.target === this) this.classList.remove('open');
    });
  });

  // Modal cancel buttons
  document.querySelectorAll('[data-close]').forEach(b => {
    b.addEventListener('click', () => closeModal(b.getAttribute('data-close')));
  });

  // Main search
  const si = document.getElementById('search-input');
  if (si) si.addEventListener('input', e => onSearch(e.target.value));

  // Log search
  const ls = document.getElementById('log-search');
  if (ls) ls.addEventListener('input', e => onLogSearch(e.target.value));

  // Add-to-collection search
  const as = document.getElementById('add-search');
  if (as) as.addEventListener('input', e => onAddSearch(e.target.value));

  // Pick-favourite search
  const pfs = document.getElementById('pick-fav-search');
  if (pfs) pfs.addEventListener('input', e => onPickFavSearch(e.target.value));

  // Wishlist search
  const wls = document.getElementById('wishlist-search');
  if (wls) wls.addEventListener('input', e => onWishlistSearch(e.target.value));

  // Poster card quick-action buttons (global delegation)
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('.pca-btn');
    if (!btn) return;
    e.stopPropagation();
    const act = btn.getAttribute('data-pca');
    const name = btn.getAttribute('data-name');
    const house = btn.getAttribute('data-house');
    const img = btn.getAttribute('data-img');
    const fid = btn.getAttribute('data-fid');
    if (act === 'log') prefillLog(name, house, img);
    else if (act === 'hive') quickAdd(name, house, img, fid);
    else if (act === 'wish') addToWishlist({ name, house, image_url: img || null, fragella_id: fid || null });
  });

  // Star picker
  document.querySelectorAll('#star-picker .star-pick').forEach(s => {
    s.addEventListener('click', () => {
      logRating = parseInt(s.getAttribute('data-r'));
      document.querySelectorAll('#star-picker .star-pick').forEach((x, i) => x.classList.toggle('active', i < logRating));
    });
  });

  // Occasion chips
  document.querySelectorAll('#log-occ .occ-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#log-occ .occ-chip').forEach(x => x.classList.remove('selected'));
      chip.classList.add('selected');
    });
  });

  // Save buttons
  const logSave = document.getElementById('log-save-btn');
  if (logSave) logSave.addEventListener('click', saveLog);
  const addSave = document.getElementById('add-save-btn');
  if (addSave) addSave.addEventListener('click', saveCollection);

  // Collection add button
  const colAdd = document.getElementById('col-add-btn');
  if (colAdd) colAdd.addEventListener('click', openAdd);

  // Auth tabs
  const tabSignin = document.getElementById('tab-signin');
  const tabSignup = document.getElementById('tab-signup');
  if (tabSignin) tabSignin.addEventListener('click', () => setAuthMode('signin'));
  if (tabSignup) tabSignup.addEventListener('click', () => setAuthMode('signup'));

  // Auth button
  const authBtn = document.getElementById('auth-btn');
  if (authBtn) authBtn.addEventListener('click', handleAuth);

  // Auth skip
  const authSkip = document.querySelector('.auth-skip');
  if (authSkip) authSkip.addEventListener('click', enterAsGuest);

  // Sidebar navigation
  document.querySelectorAll('.desktop-sidebar .sidebar-item[data-tab]').forEach(item => {
    item.addEventListener('click', () => showTab(item.getAttribute('data-tab')));
  });

  // Wire global top nav links
  document.querySelectorAll('.gtnav-link[data-tab]').forEach(link => {
    link.addEventListener('click', () => {
      const tab = link.getAttribute('data-tab');
      showTab(tab);
    });
  });
  document.querySelectorAll('.sidebar-log-btn').forEach(b => {
    b.addEventListener('click', openLog);
  });

  // Settings rows
  document.querySelectorAll('#modal-settings [data-action]').forEach(r => {
    r.addEventListener('click', () => {
      const a = r.getAttribute('data-action');
      if (a === 'signin') { closeModal('modal-settings'); showScreen('auth'); }
      else if (a === 'signout') doSignOut();
      else if (a === 'privacy') { toast('We only store data you provide. Never sold. hello@scenthive.app for deletion.'); }
      else if (a === 'about') { toast('ScentHive Beta 🐝 · Your fragrance diary · scenthive.app'); }
    });
  });

  // Right panel buttons
  const rpLog = document.getElementById('rp-log-btn');
  if (rpLog) rpLog.addEventListener('click', openLog);
  const rpAdd = document.getElementById('rp-add-btn');
  if (rpAdd) rpAdd.addEventListener('click', openAdd);
}

// ═══════ STREAK & HEATMAP ═══════
function computeStreak() {
  if (!diary.length) return { current: 0, longest: 0 };
  const dateSet = new Set(diary.map(e => (e.worn_at || '').slice(0, 10)).filter(Boolean));
  const today = new Date(); today.setHours(0,0,0,0);
  const toStr = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const todayStr = toStr(today);
  const yest = new Date(today); yest.setDate(yest.getDate()-1);
  const yesterdayStr = toStr(yest);

  // Current streak
  let current = 0;
  if (dateSet.has(todayStr) || dateSet.has(yesterdayStr)) {
    const startStr = dateSet.has(todayStr) ? todayStr : yesterdayStr;
    const d = new Date(startStr);
    while (dateSet.has(toStr(d))) { current++; d.setDate(d.getDate()-1); }
  }

  // Longest streak
  const sorted = [...dateSet].sort();
  let longest = 0, run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const diff = (new Date(sorted[i]) - new Date(sorted[i-1])) / 86400000;
    if (diff === 1) { run++; longest = Math.max(longest, run); }
    else run = 1;
  }
  if (sorted.length) longest = Math.max(longest, run, current);
  return { current, longest };
}

function renderStreakBar() {
  const { current, longest } = computeStreak();
  const tc = document.getElementById('streak-current');
  const tl = document.getElementById('streak-longest');
  const tt = document.getElementById('streak-total');
  if (tc) tc.textContent = current;
  if (tl) tl.textContent = longest;
  if (tt) tt.textContent = diary.length;
  // colour the current streak number
  if (tc) tc.className = 'streak-num' + (current >= 3 ? ' fire' : '');
}

function renderHeatmap() {
  const colsEl = document.getElementById('heatmap-cols');
  const monthsEl = document.getElementById('heatmap-months');
  const yearCountEl = document.getElementById('heatmap-year-count');
  if (!colsEl) return;

  const WEEKS = 26;
  const today = new Date(); today.setHours(0,0,0,0);
  const toStr = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  // Build count map
  const dayMap = {};
  diary.forEach(e => {
    const k = (e.worn_at||'').slice(0,10);
    if (k) dayMap[k] = (dayMap[k]||0) + 1;
  });

  // Year count
  const thisYear = today.getFullYear();
  const yearCount = Object.entries(dayMap).filter(([k])=>k.startsWith(thisYear)).reduce((s,[,v])=>s+v,0);
  if (yearCountEl) yearCountEl.textContent = yearCount ? yearCount + ' logged in ' + thisYear : '';

  // Start: WEEKS*7 days ago, adjusted back to Monday
  const start = new Date(today);
  start.setDate(today.getDate() - WEEKS * 7 + 1);
  const dow = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dow);

  const weeks = [];
  const cur = new Date(start);
  while (weeks.length < WEEKS) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const str = toStr(cur);
      const count = dayMap[str] || 0;
      const isFuture = cur > today;
      const lv = isFuture ? 'future' : count === 0 ? 'lv0' : count === 1 ? 'lv1' : count === 2 ? 'lv2' : count < 5 ? 'lv3' : 'lv4';
      week.push({ str, count, lv, month: cur.getMonth(), date: cur.getDate() });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }

  // Month labels — show label when month changes
  let lastMonth = -1;
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  monthsEl.innerHTML = weeks.map(w => {
    const m = w[0].month;
    if (m !== lastMonth) { lastMonth = m; return `<div class="heatmap-month-label" style="min-width:${WEEKS > 0 ? 13 : 11}px">${monthNames[m]}</div>`; }
    return `<div class="heatmap-month-label"></div>`;
  }).join('');

  // Cells
  colsEl.innerHTML = weeks.map(w =>
    `<div class="heatmap-col">${w.map(c =>
      `<div class="heatmap-cell ${c.lv}" title="${c.str}: ${c.count} sprayed"></div>`
    ).join('')}</div>`
  ).join('');

  // Scroll to end (today)
  const scroll = colsEl.closest('.heatmap-scroll');
  if (scroll) setTimeout(() => { scroll.scrollLeft = scroll.scrollWidth; }, 50);
}

function renderDiaryExtras() {
  renderStreakBar();
  renderHeatmap();
}

// ═══════ YEAR IN REVIEW ═══════
function openYearReview() {
  const content = document.getElementById('yr-content');
  if (!content) return;
  const year = new Date().getFullYear();
  const entries = diary.filter(e => (e.worn_at||'').startsWith(year));

  // Totals
  const total = entries.length;
  const unique = new Set(entries.map(e=>e.fragrance_name)).size;
  const rated = entries.filter(e=>e.rating);
  const avg = rated.length ? (rated.reduce((s,e)=>s+e.rating,0)/rated.length).toFixed(1) : '—';
  const { current, longest } = computeStreak();

  // Top fragrance
  const fragCount = {};
  entries.forEach(e => { fragCount[e.fragrance_name] = (fragCount[e.fragrance_name]||0)+1; });
  const topFrag = Object.entries(fragCount).sort((a,b)=>b[1]-a[1])[0];

  // Top house
  const houseCount = {};
  entries.forEach(e => { if(e.house) houseCount[e.house] = (houseCount[e.house]||0)+1; });
  const topHouse = Object.entries(houseCount).sort((a,b)=>b[1]-a[1])[0];

  // Monthly bars
  const months = Array(12).fill(0);
  entries.forEach(e => { const m = new Date(e.worn_at).getMonth(); if(m>=0) months[m]++; });
  const maxM = Math.max(...months, 1);
  const monthNames = ['J','F','M','A','M','J','J','A','S','O','N','D'];
  const monthLong = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const bestMonthIdx = months.indexOf(Math.max(...months));

  if (total === 0) {
    content.innerHTML = `<div style="text-align:center;padding:40px 20px">
      <div style="font-size:40px;margin-bottom:12px">📔</div>
      <div style="font-family:'Playfair Display',serif;font-size:20px;font-style:italic;margin-bottom:8px">No entries yet in ${year}</div>
      <div style="font-size:13px;color:var(--grey)">Start logging and come back to see your year unfold.</div>
    </div>`;
  } else {
    content.innerHTML = `
      <div class="yr-hero">
        <div class="yr-hero-year">${year} in scent</div>
        <div class="yr-hero-num">${total}</div>
        <div class="yr-hero-label">fragrance${total !== 1 ? 's' : ''} logged this year</div>
      </div>
      <div class="yr-grid">
        <div class="yr-cell">
          <div class="yr-cell-val">${unique}</div>
          <div class="yr-cell-key">Unique scents</div>
        </div>
        <div class="yr-cell">
          <div class="yr-cell-val">${avg}${avg !== '—' ? ' ★' : ''}</div>
          <div class="yr-cell-key">Avg rating</div>
        </div>
        <div class="yr-cell">
          <div class="yr-cell-val">${current}${current >= 3 ? ' 🔥' : ''}</div>
          <div class="yr-cell-key">Current streak</div>
        </div>
        <div class="yr-cell">
          <div class="yr-cell-val">${longest}</div>
          <div class="yr-cell-key">Best streak</div>
        </div>
      </div>
      ${topFrag ? `<div class="yr-best">
        <div class="yr-best-label">Most worn this year</div>
        <div class="yr-best-name">${escapeHtml(topFrag[0])}</div>
        <div class="yr-best-sub">${topFrag[1]} time${topFrag[1]!==1?'s':''} ${topHouse ? '· ' + escapeHtml(topHouse[0]) : ''}</div>
      </div>` : ''}
      <div class="yr-months">
        ${months.map((n,i)=>`<div class="yr-month-bar">
          <div class="yr-month-track"><div class="yr-month-fill" style="height:${Math.round((n/maxM)*100)}%"></div></div>
          <div class="yr-month-name" style="${i===bestMonthIdx?'color:var(--gold)':''}">${monthNames[i]}</div>
        </div>`).join('')}
      </div>
      <div style="padding:14px 20px;background:var(--bg2);border-top:1px solid var(--border2);font-size:11px;color:var(--grey);text-align:center;font-style:italic">
        ${bestMonthIdx >= 0 && months[bestMonthIdx] > 0 ? `Your most active month: <span style="color:var(--white2)">${monthLong[bestMonthIdx]}</span> with ${months[bestMonthIdx]} logs.` : ''}
      </div>`;
  }
  openModal('modal-yr');
}

function shareYearReview() {
  const year = new Date().getFullYear();
  const entries = diary.filter(e => (e.worn_at||'').startsWith(year));
  const { current } = computeStreak();
  const text = `My ${year} in fragrance:\n🏺 ${entries.length} scents logged\n🔥 ${current} day streak\nTracked on ScentHive — scenthive.app`;
  if (navigator.share) {
    navigator.share({ title: 'My ScentHive Year in Review', text }).catch(()=>{});
  } else {
    navigator.clipboard?.writeText(text).then(() => toast('Copied to clipboard!')).catch(()=>{});
  }
}

// ═══════ WISHLIST ═══════
let wishlist = [];
let wlSearchTimer = null;

function saveWishlist() {
  if (user) {
    sb.auth.updateUser({ data: { wishlist } }).catch(()=>{});
  } else {
    try { localStorage.setItem('sh_wishlist', JSON.stringify(wishlist)); } catch(e) {}
  }
}

function loadWishlist() {
  if (user) {
    wishlist = user.user_metadata?.wishlist || [];
  } else {
    try { wishlist = JSON.parse(localStorage.getItem('sh_wishlist') || '[]'); } catch(e) { wishlist = []; }
  }
}

function openAddWishlist() {
  document.getElementById('wishlist-search').value = '';
  document.getElementById('wishlist-results').innerHTML = '';
  openModal('modal-wishlist');
  setTimeout(() => document.getElementById('wishlist-search').focus(), 200);
}

function onWishlistSearch(q) {
  clearTimeout(wlSearchTimer);
  const results = document.getElementById('wishlist-results');
  const spinner = document.getElementById('wishlist-spinner');
  if (!q.trim()) { results.innerHTML = ''; return; }
  spinner.style.display = 'block';
  wlSearchTimer = setTimeout(async () => {
    const frags = await searchFragella(q);
    spinner.style.display = 'none';
    if (!frags.length) { results.innerHTML = '<div style="padding:12px;font-size:12px;color:var(--grey);font-style:italic">No results found.</div>'; return; }
    results.innerHTML = frags.slice(0,6).map((f,i) => {
      const key = 'wl'+i+Math.random().toString(36).slice(2,5);
      fragStore[key] = f;
      const img = f.image_url ? makeImg(f.image_url, f.name) : '🏺';
      return `<div class="log-search-result" data-key="${key}" style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--border2);cursor:pointer">
        <div style="width:36px;height:46px;background:var(--bg3);border-radius:2px;display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:18px;flex-shrink:0">${img}</div>
        <div style="flex:1;min-width:0">
          <div style="font-family:Playfair Display,serif;font-size:15px;font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(f.name||'')}</div>
          <div style="font-family:DM Mono,monospace;font-size:9px;color:var(--gold);letter-spacing:0.08em;text-transform:uppercase;margin-top:3px">${escapeHtml(f.house||'')}</div>
        </div>
        <span style="color:var(--grey)">+</span>
      </div>`;
    }).join('');
    results.querySelectorAll('.log-search-result').forEach(r => {
      r.addEventListener('click', () => addToWishlist(fragStore[r.getAttribute('data-key')]));
    });
  }, 350);
}

function addToWishlist(f) {
  if (wishlist.some(w => w.name === f.name && w.house === f.house)) { toast('Already on your wishlist'); return; }
  wishlist.unshift({ name: f.name, house: f.house||'', image_url: f.image_url||null, fragella_id: f.fragella_id||null });
  saveWishlist();
  closeModal('modal-wishlist');
  renderWishlist();
  toast('✓ Added to want-to-try');
}

function removeFromWishlist(idx) {
  wishlist.splice(idx, 1);
  saveWishlist();
  renderWishlist();
  toast('Removed from wishlist');
}

function renderWishlist() {
  const grid = document.getElementById('wishlist-grid');
  if (!grid) return;
  if (!wishlist.length) {
    grid.innerHTML = `<div style="grid-column:1/-1">
      <div class="empty-state">
        <div class="empty-state-emoji">✨</div>
        <div class="empty-state-title">Nothing on your wishlist yet</div>
        <div class="empty-state-sub">Tap ✨ Wish on any fragrance to save it here.</div>
      </div>
    </div>`;
    return;
  }
  grid.innerHTML = wishlist.map((w,i) => {
    const img = w.image_url
      ? `<img class="wl-cell-img" src="${escapeAttr(w.image_url)}" alt="${escapeHtml(w.name)}" onerror="this.outerHTML='<div class=&quot;wl-cell-empty&quot;>🏺</div>'">`
      : `<div class="wl-cell-empty">🏺</div>`;
    return `<div class="wl-cell" data-wl-idx="${i}">
      ${img}
      <div class="wl-cell-overlay">
        <div class="wl-cell-house">${escapeHtml(w.house)}</div>
        ${escapeHtml(w.name)}
      </div>
      <button class="col-del-btn" data-wl-del="${i}" title="Remove">×</button>
    </div>`;
  }).join('');

  // Wire events via JS (no inline onclick = no escaping bugs)
  grid.querySelectorAll('.wl-cell').forEach(cell => {
    cell.addEventListener('click', () => openWishlistFrag(parseInt(cell.getAttribute('data-wl-idx'))));
  });
  grid.querySelectorAll('[data-wl-del]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      removeFromWishlist(parseInt(btn.getAttribute('data-wl-del')));
    });
  });
}

function openWishlistFrag(idx) {
  const w = wishlist[idx];
  if (!w) return;
  const cached = Object.keys(fragStore).find(k => fragStore[k].name?.toLowerCase() === w.name?.toLowerCase());
  if (cached) { openFrag(cached); return; }
  searchFragella(w.name + (w.house ? ' '+w.house : '')).then(frags => {
    if (!frags.length) return;
    const key = 'wl'+Math.random().toString(36).slice(2,8);
    fragStore[key] = frags[0];
    openFrag(key);
  });
}

function switchColTab(tab) {
  document.getElementById('tab-hive').classList.toggle('active', tab==='hive');
  document.getElementById('tab-wishlist').classList.toggle('active', tab==='wishlist');
  document.getElementById('col-hive-view').style.display = tab==='hive' ? '' : 'none';
  document.getElementById('col-wishlist-view').style.display = tab==='wishlist' ? '' : 'none';
  if (tab==='wishlist') { loadWishlist(); renderWishlist(); }
}

// ═══════ SHARE PROFILE ═══════
function openShareProfile() {
  if (!user) { toast('Sign in to share your profile'); return; }
  const name = user.user_metadata?.name || user.email?.split('@')[0] || 'Scenthead';
  const url = `https://scenthive.app/?u=${encodeURIComponent(user.id)}`;
  const statsStr = `${diary.length} logged · ${collection.length} in hive`;
  document.getElementById('share-card-name').textContent = name;
  document.getElementById('share-card-stats').textContent = statsStr;
  document.getElementById('share-url').textContent = url;
  openModal('modal-share');
}

function copyShareUrl() {
  const url = document.getElementById('share-url').textContent;
  if (navigator.share) {
    navigator.share({ title: 'My ScentHive profile', url }).catch(()=>{});
  } else {
    navigator.clipboard?.writeText(url).then(() => toast('Link copied!')).catch(() => {
      const el = document.getElementById('share-url');
      const r = document.createRange(); r.selectNode(el);
      window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
      toast('Select and copy the link above');
    });
  }
}

// ═══════ PUBLIC PROFILE ═══════
async function checkPublicUrl() {
  const params = new URLSearchParams(window.location.search);
  const uid = params.get('u');
  if (!uid) return false;
  showScreen('public');
  document.getElementById('pub-name').textContent = 'Loading…';
  document.getElementById('pub-reviews').innerHTML = '<div style="color:var(--grey);font-size:13px;font-style:italic">Fetching profile…</div>';
  try {
    const { data: entries, error } = await sb.from('journal_entries')
      .select('fragrance_name,house,notes,rating,occasion,worn_at,image_url')
      .eq('user_id', uid)
      .eq('is_public', true)
      .order('worn_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    const count = entries?.length || 0;
    const handle = uid.slice(0, 8);
    document.getElementById('pub-name').textContent = 'Scenthead';
    document.getElementById('pub-avatar').textContent = '🐝';
    document.getElementById('pub-sub').textContent = `@${handle} · SCENTHIVE MEMBER`;
    // Mini stats
    const houses = [...new Set((entries||[]).map(e => e.house).filter(Boolean))];
    const avgRating = entries?.filter(e=>e.rating).length
      ? (entries.filter(e=>e.rating).reduce((s,e)=>s+e.rating,0)/entries.filter(e=>e.rating).length).toFixed(1)
      : null;
    document.getElementById('pub-stats').innerHTML = [
      `<div style="flex:1;text-align:center;padding:12px 8px;background:var(--bg3);border:1px solid var(--border2);border-radius:4px"><div style="font-family:'Playfair Display',serif;font-size:20px;font-style:italic">${count}</div><div style="font-family:'DM Mono',monospace;font-size:8px;color:var(--grey);letter-spacing:0.07em;margin-top:2px">REVIEWS</div></div>`,
      `<div style="flex:1;text-align:center;padding:12px 8px;background:var(--bg3);border:1px solid var(--border2);border-radius:4px"><div style="font-family:'Playfair Display',serif;font-size:20px;font-style:italic">${houses.length}</div><div style="font-family:'DM Mono',monospace;font-size:8px;color:var(--grey);letter-spacing:0.07em;margin-top:2px">HOUSES</div></div>`,
      avgRating ? `<div style="flex:1;text-align:center;padding:12px 8px;background:var(--bg3);border:1px solid var(--border2);border-radius:4px"><div style="font-family:'Playfair Display',serif;font-size:20px;font-style:italic;color:var(--gold)">${avgRating}★</div><div style="font-family:'DM Mono',monospace;font-size:8px;color:var(--grey);letter-spacing:0.07em;margin-top:2px">AVG RATING</div></div>` : ''
    ].join('');
    if (!count) {
      document.getElementById('pub-reviews').innerHTML = '<div style="color:var(--grey);font-size:13px;font-style:italic;padding:20px 0">No public reviews yet.</div>';
      return true;
    }
    document.getElementById('pub-reviews').innerHTML = entries.map(r => {
      const d = new Date(r.worn_at);
      const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      const stars = r.rating ? '★'.repeat(r.rating) + '<span style="color:var(--grey2)">' + '★'.repeat(5-r.rating) + '</span>' : '';
      return `<div style="padding:14px 0;border-bottom:1px solid var(--border2)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
          <div>
            <div style="font-family:'Playfair Display',serif;font-size:15px;font-style:italic">${escapeHtml(r.fragrance_name||'')}</div>
            <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--gold);letter-spacing:0.07em;margin-top:2px">${escapeHtml(r.house||'')} · ${dateStr}</div>
          </div>
          ${stars ? `<div style="font-size:11px;color:var(--gold);flex-shrink:0;padding-top:2px">${stars}</div>` : ''}
        </div>
        ${r.notes ? `<div style="font-size:12px;color:var(--white2);font-style:italic;line-height:1.55;margin-top:6px">"${escapeHtml(r.notes)}"</div>` : ''}
      </div>`;
    }).join('');
  } catch(e) {
    document.getElementById('pub-reviews').innerHTML = '<div style="color:var(--grey);font-size:13px">Could not load profile.</div>';
  }
  return true;
}

// ═══════ ONBOARDING ═══════
function maybeShowOnboarding() {
  if (!user) return;
  const key = 'sh_onboarded_' + user.id;
  if (localStorage.getItem(key)) return;
  localStorage.setItem(key, '1');
  setTimeout(() => openModal('modal-onboard'), 800);
}

// ═══════ HERO PERSONALISATION ═══════
function updateHero() {
  const greeting = document.getElementById('home-greeting');
  const greetingName = document.getElementById('greeting-name');
  const greetingStats = document.getElementById('greeting-stats');
  const greetingStreak = document.getElementById('greeting-streak');
  const greetingStreakNum = document.getElementById('greeting-streak-num');
  if (!greeting) return;

  if (user) {
    const name = user.user_metadata?.name || user.email?.split('@')[0] || 'there';
    const firstName = name.split(' ')[0];
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    const streak = computeStreak();

    if (greetingName) greetingName.textContent = `Good ${timeOfDay}, ${firstName}`;
    if (greetingStats) greetingStats.textContent = `${diary.length} logged · ${collection.length} in hive`;

    if (greetingStreak && greetingStreakNum && streak.current >= 2) {
      greetingStreak.style.display = '';
      greetingStreakNum.textContent = streak.current;
    } else {
      if (greetingStreak) greetingStreak.style.display = 'none';
    }
    greeting.style.display = '';
  } else {
    greeting.style.display = 'none';
  }
}

// ═══════ BOTTLE SCAN ═══════
let _scanBase64 = null;
let _scanMediaType = null;

function openScan() {
  _scanBase64 = null;
  _scanMediaType = null;
  document.getElementById('scan-preview').style.display = 'none';
  document.getElementById('scan-result').innerHTML = '';
  document.getElementById('scan-btn').style.display = 'none';
  document.getElementById('scan-drop').style.display = 'block';
  openModal('modal-scan');
}

document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('scan-file');
  if (fileInput) {
    fileInput.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (!file) return;
      _scanMediaType = file.type || 'image/jpeg';
      const reader = new FileReader();
      reader.onload = ev => {
        const dataUrl = ev.target.result;
        _scanBase64 = dataUrl.split(',')[1];
        document.getElementById('scan-img').src = dataUrl;
        document.getElementById('scan-preview').style.display = 'block';
        document.getElementById('scan-drop').style.display = 'none';
        document.getElementById('scan-btn').style.display = 'block';
        document.getElementById('scan-result').innerHTML = '';
      };
      reader.readAsDataURL(file);
    });
  }
});

async function runScan() {
  if (!_scanBase64) { toast('Choose a photo first'); return; }
  const btn = document.getElementById('scan-btn');
  const resultEl = document.getElementById('scan-result');
  btn.disabled = true; btn.textContent = '🔍 Identifying…';
  resultEl.innerHTML = '<div style="text-align:center;padding:16px"><div class="spinner"></div><div style="font-size:11px;color:var(--grey);margin-top:8px;font-style:italic">Consulting the nose…</div></div>';

  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: _scanBase64, mediaType: _scanMediaType })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    if (!data.name) {
      resultEl.innerHTML = `<div style="padding:14px;background:var(--bg3);border-radius:4px;border:1px solid var(--border2)">
        <div style="font-size:13px;color:var(--grey);font-style:italic;margin-bottom:10px">Couldn't identify this bottle. ${escapeHtml(data.description||'Try a clearer photo with the label fully visible.')}</div>
        <button class="modal-cancel" style="width:100%" onclick="resetScan()">Try another photo</button>
      </div>`;
    } else {
      const conf = data.confidence === 'high' ? '✓ Identified' : data.confidence === 'medium' ? '~ Probably' : '? Best guess';
      const confColor = data.confidence === 'high' ? 'var(--gold)' : data.confidence === 'medium' ? 'var(--white2)' : 'var(--grey)';
      const alreadyOwned = collection.some(c => c.name?.toLowerCase() === data.name?.toLowerCase());
      resultEl.innerHTML = `<div style="padding:16px;background:var(--gold-pale);border:1px solid rgba(240,192,64,0.25);border-radius:4px;margin-bottom:10px">
        <div style="font-family:'DM Mono',monospace;font-size:8px;color:${confColor};letter-spacing:0.1em;margin-bottom:8px">${conf}</div>
        <div style="font-family:'Playfair Display',serif;font-size:20px;font-style:italic;margin-bottom:2px">${escapeHtml(data.name)}</div>
        <div style="font-family:'DM Mono',monospace;font-size:10px;color:var(--gold);margin-bottom:10px">${escapeHtml(data.house||'')}${data.family?' · '+escapeHtml(data.family):''}</div>
        ${alreadyOwned ? '<div style="font-family:\'DM Mono\',monospace;font-size:9px;color:var(--gold);margin-bottom:10px">✓ Already in your hive</div>' : ''}
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <button class="modal-submit" style="flex:2;font-size:11px;padding:10px 0" onclick="scanAddToHive(${JSON.stringify(data.name)},${JSON.stringify(data.house||'')},${JSON.stringify(data.image_url||null)})">${alreadyOwned ? '+ Add again' : '🐝 Add to hive'}</button>
          <button class="frag-btn frag-btn-secondary" style="flex:1;font-size:11px;padding:10px 0" onclick="prefillLog(${JSON.stringify(data.name)},${JSON.stringify(data.house||'')},null);closeModal('modal-scan')">Log it</button>
        </div>
        <button class="modal-cancel" style="width:100%;margin-top:0" onclick="resetScan()">📷 Scan another bottle</button>
      </div>`;
    }
  } catch (e) {
    resultEl.innerHTML = `<div style="padding:12px;font-size:12px;color:var(--red);font-style:italic">${escapeHtml(e.message||'Something went wrong')}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = '🔍 Identify & add to hive';
  }
}

function resetScan() {
  _scanBase64 = null; _scanMediaType = null;
  document.getElementById('scan-preview').style.display = 'none';
  document.getElementById('scan-drop').style.display = 'block';
  document.getElementById('scan-btn').style.display = 'none';
  document.getElementById('scan-result').innerHTML = '';
  document.getElementById('scan-file').value = '';
}

async function scanAddToHive(name, house, imageUrl) {
  await quickAdd(name, house, imageUrl, null);
  // Keep modal open so user can scan another
  document.getElementById('scan-result').innerHTML += `<div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--gold);padding:8px 0;letter-spacing:0.06em">✓ Added to your hive! Scan another bottle or close.</div>`;
  setTimeout(resetScan, 1800);
}

// ═══════ SEARCH TRIGGER ═══════
function triggerSearch(q) {
  const input = document.getElementById('search-input');
  if (!input) return;
  input.value = q;
  input.dispatchEvent(new Event('input'));
  input.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => input.focus(), 400);
}

// ═══════ PWA INSTALL ═══════
let _pwaPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _pwaPrompt = e;
  if (!sessionStorage.getItem('pwa-dismissed')) {
    const banner = document.getElementById('pwa-banner');
    if (banner) banner.style.display = 'flex';
  }
});
function installPWA() {
  if (!_pwaPrompt) return;
  _pwaPrompt.prompt();
  _pwaPrompt.userChoice.then(() => { _pwaPrompt = null; dismissPWA(); });
}
function dismissPWA() {
  sessionStorage.setItem('pwa-dismissed', '1');
  const banner = document.getElementById('pwa-banner');
  if (banner) banner.style.display = 'none';
}

// ═══════ KEYBOARD ═══════
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
});

// ═══════ STARTUP ═══════
(async () => {
  injectNavs();
  wireEvents();

  // Public profile URL takes priority — show it without auth
  const isPublic = await checkPublicUrl();
  if (isPublic) return;

  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session?.user) {
      user = session.user;
      await initApp();
    }
  } catch (e) {}
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      user = session.user;
      await initApp();
    }
    if (event === 'SIGNED_OUT') {
      user = null;
      diary = [];
      collection = [];
      showScreen('auth');
    }
  });
})();
