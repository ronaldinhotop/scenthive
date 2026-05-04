# ScentHive — Agent Handoff

Shared working document between **Claude** (planning, specs, review) and **Codex** (implementation).
Human owner: Frode. Push via GitHub Desktop when terminal auth is unavailable.

---

## Project Overview

**ScentHive** — fragrance diary + discovery app.
- **Frontend:** static `index.html` shell, `styles.css`, and `app.js`. No framework. Vanilla JS + CSS.
- **Backend:** Vercel serverless functions in `api/` (Node ESM).
  - `api/search.js` — queries Fragella (fragrance DB) via Supabase.
  - `api/ai.js` — Claude AI recommendations via Anthropic API.
  - `api/scan.js` — Claude Vision bottle identification.
- **Auth + DB:** Supabase. Tables: `journal_entries`, `collection`, `wishlist`, `fragella`.
- **Production:** https://scenthive-ten.vercel.app
- **Env vars (Vercel):** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ANTHROPIC_KEY`.

### Key CSS variables (`:root` in `index.html`)
```
--bg:#080810  --bg2:#0e0e1c  --bg3:#141422  --bg4:#1b1b2c
--gold:#f0c040  --purple:#8b5cf6  --white:#f0f0fa  --white2:#9898b8
--border:#22223a  --border2:#181828
```

### Important JS globals
- `fragStore{}` — temporary frag data keyed by random IDs used in poster cards.
- `diary[]`, `collection[]`, `wishlist[]` — in-memory arrays loaded from Supabase.
- `user` — current Supabase auth user object.
- `sb` — Supabase client instance.
- `_shelfCache{}` — caches rendered shelf HTML to avoid repeat API calls.

---

## Current Product Direction

Read `REDESIGN.md` before starting major UI work.

ScentHive should move toward a Spotify/Letterboxd/Fragrantica-inspired fragrance experience:
- Home as an endless discovery feed, not a marketing landing page.
- Clean, minimal, dark, premium, with light color coding.
- Lots of fragrance shelves: new releases, for you, similar to, taste test, recent, editorial.
- AI should become a quiet personalization layer: taste test, smart shelves, fragrance summaries, and editorial support.
- Monetization should unlock deeper taste intelligence, not basic diary usage.

---

## Recently Completed

- ✅ Full layout redesign: global fixed top nav (Spotify-style), no sidebar, two-column fragrance detail (Letterboxd-style).
- ✅ Poster card UI (138×184px bottle tiles with gradient overlay + quick-action buttons).
- ✅ Note tiles with Wikipedia ingredient photos.
- ✅ Logo click → home, "ScentHive" renders as one word.
- ✅ Shelf randomization: 18-item dark/fresh pools shuffled + 8 picked per visit.
- ✅ Image error handling: broken images swap to 🏺 emoji fallback.
- ✅ Bottle image auto-fetch on scan add (looks up Fragella DB by name/house).
- ✅ mix-blend-mode changed from `screen` → `luminosity` so white bottles are visible.
- ✅ Empty states: diary 📖, hive 🐝, wishlist ✨ all show friendly messages when empty.
- ✅ Quick wear: ⏱ button on hive cards logs a wear instantly with a toast, no modal.
- ✅ Search aliases: alias results now always surface first and merge with direct results.

---

## Task Queue

Tasks are ordered by priority. Codex should pick **Task 1** unless told otherwise.

---

### TASK 1 — Better empty states
**Status:** ✅ DONE (ccec6e2)

**Why:** When a new user opens the app for the first time (no diary, no hive, no wishlist), every section shows a loading spinner or blank space. This feels broken.

**What to build:** A friendly illustrated empty state for each of the four main screens.

**Files:** `index.html` only.

**Specs per screen:**

#### Diary (empty)
- Container id: `#screen-diary`
- Show when `diary.length === 0`
- Content:
  ```
  Large emoji: 📖
  Heading: "Your diary is empty"
  Sub: "Every fragrance you wear gets logged here. Tap + Log to start."
  Button: "+ Log a fragrance" → calls openLog()
  ```

#### Hive / Collection (empty)
- Container id: `#screen-col`
- Show when `collection.length === 0`
- Content:
  ```
  Large emoji: 🐝
  Heading: "Your hive is empty"
  Sub: "Add fragrances you own to keep track of your collection."
  Button: "Browse & add" → calls showTab('home')
  ```

#### Wishlist (empty, inside profile screen)
- The wishlist tab on the profile screen
- Show when `wishlist.length === 0`
- Content:
  ```
  Large emoji: ✨
  Heading: "Nothing on your wishlist yet"
  Sub: "Tap ✨ Wish on any fragrance to save it here."
  ```

#### Home — no diary/collection yet (features grid already exists, just needs polish)
- The `#features-grid` is already shown when the user has no data. No change needed here.

**Empty state HTML pattern to use:**
```html
<div class="empty-state">
  <div class="empty-state-emoji">📖</div>
  <div class="empty-state-title">Your diary is empty</div>
  <div class="empty-state-sub">Every fragrance you wear gets logged here.</div>
  <button class="btn-primary" onclick="openLog()">+ Log a fragrance</button>
</div>
```

**CSS to add:**
```css
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 64px 24px;
  text-align: center;
  color: var(--white2);
}
.empty-state-emoji { font-size: 48px; margin-bottom: 4px; }
.empty-state-title { font-family: 'Playfair Display', serif; font-size: 20px; color: var(--white); font-style: italic; }
.empty-state-sub { font-size: 13px; max-width: 260px; line-height: 1.5; }
.empty-state .btn-primary {
  margin-top: 12px;
  background: var(--gold);
  color: #080810;
  border: none;
  border-radius: 20px;
  padding: 10px 22px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
```

**Acceptance criteria:**
- [ ] Fresh account (no diary/collection/wishlist) shows friendly empty states on all three screens.
- [ ] Empty states disappear once data exists.
- [ ] Buttons in empty states work (openLog, showTab).
- [ ] No layout shift on screens that already have data.

---

### TASK 2 — Faster log flow
**Status:** ✅ DONE (724d13c)

Quick wear ⏱ button added to hive cards. Logs instantly, shows toast, updates diary in memory.
Known minor issue: calls `loadCommunityFeed()` on every quick log — unnecessary network call, can be removed later.

---

### TASK 3 — Diary entry detail view
**Status:** ready for implementation

**Why:** Tapping a diary entry does nothing. Users want to see what they wrote, edit the rating, or delete an entry.

**What to build:** A slide-up bottom sheet (mobile) / modal (desktop) that shows the full entry when a diary card is tapped.

**Files:** `index.html` only.

**Spec:**

#### Trigger
- Tapping anywhere on a `.diary-card` element opens the sheet for that entry.
- `e.stopPropagation()` so nested buttons (delete, etc.) don't also open it.

#### Sheet HTML (append once to `<body>`, toggle visibility)
```html
<div id="entry-sheet" class="entry-sheet" style="display:none">
  <div class="entry-sheet-backdrop" onclick="closeEntrySheet()"></div>
  <div class="entry-sheet-panel">
    <button class="entry-sheet-close" onclick="closeEntrySheet()">✕</button>
    <div id="entry-sheet-body"></div>
  </div>
</div>
```

#### Sheet content (rendered into `#entry-sheet-body`)
```
[Bottle image or emoji — 80px]
[Fragrance name — Playfair Display, italic, 22px]
[House name — DM Mono, uppercase, gold-dim, 11px]
[Date worn — e.g. "Monday 4 May 2026"]
[Star rating — read-only display: ★★★☆☆]
[Occasion badge — e.g. "Evening"]
[Notes — full text, white2, 14px, line-height 1.6]
[Delete button — red, bottom of panel]
```

#### CSS
```css
.entry-sheet { position:fixed;inset:0;z-index:500;display:flex;flex-direction:column;justify-content:flex-end }
.entry-sheet-backdrop { position:absolute;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px) }
.entry-sheet-panel {
  position:relative;z-index:1;
  background:var(--bg2);border-top:1px solid var(--border);
  border-radius:16px 16px 0 0;
  padding:24px 24px 40px;
  max-height:80vh;overflow-y:auto;
  animation: slideUp 0.22s ease;
}
@keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
.entry-sheet-close { position:absolute;top:16px;right:16px;background:none;border:none;color:var(--white2);font-size:18px;cursor:pointer }
.entry-sheet-img { width:80px;height:80px;object-fit:contain;mix-blend-mode:luminosity;filter:brightness(1.3);margin-bottom:12px }
.entry-sheet-name { font-family:'Playfair Display',serif;font-size:22px;font-style:italic;color:var(--white);line-height:1.2 }
.entry-sheet-house { font-family:'DM Mono',monospace;font-size:11px;color:var(--gold-dim);letter-spacing:0.08em;text-transform:uppercase;margin:4px 0 12px }
.entry-sheet-meta { display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px }
.entry-sheet-date { font-size:12px;color:var(--white2) }
.entry-sheet-stars { font-size:15px;color:var(--gold) }
.entry-sheet-occasion { font-size:11px;background:var(--purple-pale);color:var(--purple-light);border-radius:10px;padding:2px 10px }
.entry-sheet-notes { font-size:14px;color:var(--white2);line-height:1.6;white-space:pre-wrap;margin-bottom:20px }
.entry-sheet-delete { background:none;border:1px solid var(--red);color:var(--red);border-radius:20px;padding:8px 20px;font-size:13px;cursor:pointer }
.entry-sheet-delete:hover { background:rgba(248,113,113,0.1) }
```

#### JS functions
```javascript
function openEntrySheet(entry) {
  const b = document.getElementById('entry-sheet-body');
  const img = entry.image_url
    ? `<img class="entry-sheet-img" src="${escapeAttr(entry.image_url)}" onerror="this.style.display='none'">`
    : '<div style="font-size:48px;margin-bottom:12px">🏺</div>';
  const stars = '★'.repeat(entry.rating || 0) + '☆'.repeat(5 - (entry.rating || 0));
  const date = new Date(entry.worn_at).toLocaleDateString('en-GB', {weekday:'long',day:'numeric',month:'long',year:'numeric'});
  b.innerHTML = `
    ${img}
    <div class="entry-sheet-name">${escapeHtml(entry.fragrance_name || '')}</div>
    <div class="entry-sheet-house">${escapeHtml(entry.house || '')}</div>
    <div class="entry-sheet-meta">
      <span class="entry-sheet-date">${date}</span>
      ${entry.rating ? `<span class="entry-sheet-stars">${stars}</span>` : ''}
      ${entry.occasion ? `<span class="entry-sheet-occasion">${escapeHtml(entry.occasion)}</span>` : ''}
    </div>
    ${entry.notes ? `<div class="entry-sheet-notes">${escapeHtml(entry.notes)}</div>` : ''}
    <button class="entry-sheet-delete" onclick="deleteEntry('${entry.id}')">Delete entry</button>
  `;
  document.getElementById('entry-sheet').style.display = 'flex';
}

function closeEntrySheet() {
  document.getElementById('entry-sheet').style.display = 'none';
}
```

#### Wire up in `renderDiary()`
After rendering diary cards, add:
```javascript
document.querySelectorAll('.diary-card').forEach(card => {
  card.style.cursor = 'pointer';
  card.addEventListener('click', e => {
    if (e.target.closest('button')) return; // don't open if tapping a button
    const idx = parseInt(card.getAttribute('data-idx'));
    if (!isNaN(idx) && diary[idx]) openEntrySheet(diary[idx]);
  });
});
```
Each `.diary-card` needs `data-idx="${index}"` added to its HTML during render.

**Acceptance criteria:**
- [ ] Tapping a diary card opens the bottom sheet with full entry details.
- [ ] Date is formatted nicely (e.g. "Monday 4 May 2026").
- [ ] Rating shows stars if present, hidden if 0.
- [ ] Occasion badge shows if present, hidden if empty.
- [ ] Notes show if present, hidden if empty.
- [ ] Delete button removes the entry (calls existing `deleteEntry()` function or equivalent).
- [ ] Backdrop tap and ✕ button both close the sheet.
- [ ] Tapping action buttons on cards (edit, delete, etc.) does NOT open the sheet.

---

### TASK 4 — Split index.html into css + js files
**Status:** ✅ DONE (already split — project now has `index.html`, `styles.css`, `app.js`)

Update coding rules: CSS goes in `styles.css`, JS goes in `app.js`, HTML shell in `index.html`.

---

### TASK 5 — Home v1: Spotify/Letterboxd feed
**Status:** ready for implementation

**Why:** The current home is a marketing landing page with a big hero, generic copy, and only two curated shelves. It should feel like an actual product: dense, discoverable, personal.

**Goal:** Multiple scrollable shelf rows, a slim greeting bar, a "Continue" strip, a personalised "For You" shelf, a new Warm & Oriental shelf, and a Taste Test CTA card. No marketing hero. No features grid.

**Files:** `index.html`, `styles.css`, `app.js`

---

#### A. Remove and replace in `index.html`

**Remove** the entire `<div class="hero" id="home-hero">…</div>` block (including the hex bg and bees).

**Remove** the `<div class="features-grid" id="features-grid">…</div>` block.

**Replace `#home-content` with this structure** (put it inside `.home-screen`, after the search wrap and PWA banner):

```html
<div id="home-content">

  <!-- Greeting bar (slim, replaces hero) -->
  <div class="home-greeting" id="home-greeting" style="display:none">
    <div class="home-greeting-text">
      <span class="home-greeting-name" id="greeting-name"></span>
      <span class="home-greeting-stats" id="greeting-stats"></span>
    </div>
    <div class="home-greeting-streak" id="greeting-streak" style="display:none">
      <span class="greeting-streak-num" id="greeting-streak-num">0</span>
      <span class="greeting-streak-label">day streak 🔥</span>
    </div>
  </div>

  <!-- Continue: last worn (logged-in + diary > 0) -->
  <div class="section" id="section-continue" style="display:none">
    <div class="section-header">
      <div>
        <div class="section-eyebrow">Pick up where you left off</div>
        <div class="section-title">Continue <em>wearing</em></div>
      </div>
    </div>
    <div class="continue-strip" id="continue-strip"></div>
  </div>

  <!-- For You: personalised from hive/diary, or curated for guests -->
  <div class="section" id="section-foryou">
    <div class="section-header">
      <div>
        <div class="section-eyebrow" id="foryou-eyebrow">Tuned to your taste</div>
        <div class="section-title" id="foryou-title">Picked <em>for you</em></div>
        <div class="section-sub" id="foryou-sub"></div>
      </div>
    </div>
    <div class="poster-row" id="shelf-foryou"><div class="loading-row">Loading…</div></div>
  </div>

  <!-- Recently worn by you -->
  <div class="section" id="section-recent-yours" style="display:none">
    <div class="section-header">
      <div>
        <div class="section-eyebrow">Your diary</div>
        <div class="section-title">Recently <em>worn</em></div>
      </div>
      <span class="section-more" onclick="showTab('diary')">See all →</span>
    </div>
    <div class="poster-row" id="shelf-yours"></div>
  </div>

  <!-- Popular: community-driven -->
  <div class="section">
    <div class="section-header">
      <div>
        <div class="section-eyebrow">Popular this week</div>
        <div class="section-title">Most logged <em>right now</em></div>
      </div>
      <span class="section-more" onclick="document.getElementById('search-input').focus();document.getElementById('search-input').scrollIntoView({behavior:'smooth'})">Search all →</span>
    </div>
    <div class="poster-row" id="shelf-popular"><div class="loading-row">Loading…</div></div>
  </div>

  <!-- Dark & Brooding -->
  <div class="section">
    <div class="section-header">
      <div>
        <div class="section-eyebrow">Curated shelf</div>
        <div class="section-title">Dark & <em>brooding</em></div>
        <div class="section-sub">Oud, tobacco, leather. For the cold months.</div>
      </div>
      <span class="section-more" onclick="triggerSearch('oud tobacco leather')">Explore →</span>
    </div>
    <div class="poster-row" id="shelf-dark"><div class="loading-row">Loading…</div></div>
  </div>

  <!-- Warm & Oriental (new) -->
  <div class="section tinted">
    <div class="section-header">
      <div>
        <div class="section-eyebrow">Curated shelf</div>
        <div class="section-title">Warm & <em>oriental</em></div>
        <div class="section-sub">Amber, vanilla, oud. Skin-close and seductive.</div>
      </div>
      <span class="section-more" onclick="triggerSearch('amber vanilla oriental')">Explore →</span>
    </div>
    <div class="poster-row" id="shelf-oriental"><div class="loading-row">Loading…</div></div>
  </div>

  <!-- Taste Test CTA -->
  <div class="section">
    <div class="taste-cta" id="taste-cta" onclick="openTasteTest()">
      <div class="taste-cta-hex"></div>
      <div class="taste-cta-body">
        <div class="taste-cta-eyebrow">Taste intelligence</div>
        <div class="taste-cta-title">What does your nose actually want?</div>
        <div class="taste-cta-sub">Answer 5 quick questions and get a personalised scent profile.</div>
        <div class="taste-cta-btn">Take the taste test →</div>
      </div>
    </div>
  </div>

  <!-- Fresh Classics -->
  <div class="section">
    <div class="section-header">
      <div>
        <div class="section-eyebrow">Curated shelf</div>
        <div class="section-title">Fresh <em>classics</em></div>
        <div class="section-sub">Office-friendly signatures that never fail.</div>
      </div>
      <span class="section-more" onclick="triggerSearch('fresh aquatic citrus')">Explore →</span>
    </div>
    <div class="poster-row" id="shelf-fresh"><div class="loading-row">Loading…</div></div>
  </div>

  <!-- Articles -->
  <div class="section">
    <div class="section-header">
      <div>
        <div class="section-eyebrow">From the journal</div>
        <div class="section-title"><em>Latest</em> articles</div>
      </div>
    </div>
    <div id="article-featured"></div>
    <div class="article-row" id="article-list"><div class="loading-row">Loading articles…</div></div>
  </div>

  <!-- Community -->
  <div class="section tinted" id="community-reviews-section">
    <div class="section-header">
      <div>
        <div class="section-eyebrow">The community diary</div>
        <div class="section-title">What people are <em>wearing</em></div>
      </div>
    </div>
    <div id="community-diary-feed">
      <div style="padding:32px 24px;text-align:center;color:var(--grey)">
        <div style="font-size:28px;opacity:0.4;margin-bottom:10px">🐝</div>
        <div style="font-size:13px;font-style:italic;margin-bottom:6px">The hive is quiet</div>
        <div style="font-family:'DM Mono',monospace;font-size:10px;letter-spacing:0.06em">Log a fragrance to appear in the community diary.</div>
      </div>
    </div>
  </div>

  <div style="text-align:center;padding:40px 20px 24px;border-top:1px solid var(--border2)">
    <div style="font-size:32px;margin-bottom:10px">🐝</div>
    <div style="font-family:'Playfair Display',serif;font-size:18px;font-style:italic;margin-bottom:4px">Built for serious noses</div>
    <div style="font-family:'DM Mono',monospace;font-size:10px;color:var(--grey);letter-spacing:0.12em">scenthive.app</div>
  </div>

</div>
```

---

#### B. New CSS to add to `styles.css`

Add after the existing `.section` rules:

```css
/* ── Greeting bar ── */
.home-greeting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 10px;
  gap: 12px;
}
.home-greeting-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.home-greeting-name {
  font-family: 'Playfair Display', serif;
  font-size: 20px;
  font-style: italic;
  color: var(--white);
  line-height: 1.1;
}
.home-greeting-stats {
  font-family: 'DM Mono', monospace;
  font-size: 9.5px;
  color: var(--grey);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.home-greeting-streak {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--gold-pale);
  border: 1px solid var(--gold-dim);
  border-radius: 8px;
  padding: 8px 14px;
  flex-shrink: 0;
}
.greeting-streak-num {
  font-family: 'Playfair Display', serif;
  font-size: 22px;
  color: var(--gold);
  line-height: 1;
}
.greeting-streak-label {
  font-family: 'DM Mono', monospace;
  font-size: 8px;
  color: var(--gold-dim);
  letter-spacing: 0.06em;
  margin-top: 2px;
}

/* ── Continue strip ── */
.continue-strip {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 0 20px 20px;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
}
.continue-strip::-webkit-scrollbar { display: none }
.continue-item {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  min-width: 200px;
  max-width: 220px;
  flex-shrink: 0;
  scroll-snap-align: start;
  cursor: pointer;
  transition: border-color 0.15s;
}
.continue-item:hover { border-color: var(--gold-dim); }
.continue-item-img {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  background: var(--bg4);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.continue-item-img img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  mix-blend-mode: luminosity;
  filter: brightness(1.3);
}
.continue-item-info { flex: 1; min-width: 0; }
.continue-item-name {
  font-size: 12px;
  color: var(--white);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.continue-item-house {
  font-family: 'DM Mono', monospace;
  font-size: 9px;
  color: var(--grey);
  letter-spacing: 0.05em;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.continue-item-ago {
  font-family: 'DM Mono', monospace;
  font-size: 8.5px;
  color: var(--gold-dim);
  margin-top: 4px;
}
.continue-item-btn {
  background: none;
  border: 1px solid var(--border);
  color: var(--gold);
  font-size: 14px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s;
}
.continue-item-btn:hover { background: var(--gold-pale); }

/* ── Taste Test CTA card ── */
.taste-cta {
  margin: 0 20px;
  border-radius: 10px;
  overflow: hidden;
  position: relative;
  background: linear-gradient(135deg, #1a0d36 0%, #0e1030 50%, #0a0818 100%);
  border: 1px solid var(--purple-dim);
  cursor: pointer;
  transition: border-color 0.2s, transform 0.15s;
  padding: 28px 24px;
}
.taste-cta:hover {
  border-color: var(--purple-light);
  transform: translateY(-2px);
}
.taste-cta-hex {
  position: absolute;
  inset: 0;
  opacity: 0.04;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='52'%3E%3Cpath d='M15,2 L45,2 L58,26 L45,50 L15,50 L2,26 Z' fill='none' stroke='%238b5cf6' stroke-width='1'/%3E%3C/svg%3E");
  background-size: 60px 52px;
  pointer-events: none;
}
.taste-cta-body { position: relative; z-index: 1; }
.taste-cta-eyebrow {
  font-family: 'DM Mono', monospace;
  font-size: 9px;
  color: var(--purple-light);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  margin-bottom: 10px;
  opacity: 0.85;
}
.taste-cta-title {
  font-family: 'Playfair Display', serif;
  font-size: 22px;
  font-style: italic;
  color: var(--white);
  line-height: 1.2;
  margin-bottom: 8px;
}
.taste-cta-sub {
  font-size: 13px;
  color: var(--white2);
  line-height: 1.55;
  max-width: 320px;
  margin-bottom: 18px;
}
.taste-cta-btn {
  display: inline-block;
  font-family: 'DM Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--purple-light);
  border: 1px solid var(--purple-dim);
  border-radius: 20px;
  padding: 9px 18px;
  transition: background 0.15s, color 0.15s;
}
.taste-cta:hover .taste-cta-btn {
  background: var(--purple-pale);
  color: var(--white);
}

/* ── Desktop padding for new elements ── */
@media (min-width: 768px) {
  .home-greeting { padding: 24px 40px 12px; }
  .continue-strip { padding: 0 40px 24px; }
  .taste-cta { margin: 0 40px; }
}
@media (min-width: 1200px) {
  .home-greeting { padding: 28px 60px 14px; }
  .continue-strip { padding: 0 60px 24px; }
  .taste-cta { margin: 0 60px; }
}
```

---

#### C. Changes to `app.js`

**1. Update `renderHome()`** — replace the entire function body:

```javascript
async function renderHome() {
  updateHero();           // updates greeting bar
  renderContinueStrip();  // "continue wearing" strip
  renderForYouShelf();    // personalised or curated

  // "Recently worn by you" shelf
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
  }

  loadPopularShelf();

  // Dark & brooding shelf
  const darkPool = [
    'Tobacco Vanille Tom Ford', 'Encre Noire Lalique', 'Black Orchid Tom Ford',
    'Interlude Man Amouage', 'Oud Wood Tom Ford', 'Lost Cherry Tom Ford',
    'Dior Homme Intense', 'Sauvage Elixir Dior', 'Black Afgano Nasomatto',
    'M7 Oud Absolu YSL', 'Kilian Black Phantom', 'Memoir Man Amouage',
    'Fahrenheit Dior', 'Sycomore Chanel', 'Jazz Club Maison Margiela',
    'Herod Parfums de Marly', 'Vetiver Guerlain', 'Pour Homme Yves Saint Laurent'
  ];
  // Warm & Oriental shelf (new)
  const orientalPool = [
    'Baccarat Rouge 540 Maison Francis Kurkdjian', 'Love Don't Be Shy Kilian',
    'Good Girl Carolina Herrera', 'La Nuit de l\'Homme YSL',
    'Black Opium YSL', 'Elixir Tom Ford',
    'Bal d\'Afrique Byredo', 'Portrait of a Lady Frederic Malle',
    'Libre YSL', 'Flowerbomb Viktor Rolf',
    'Shalimar Guerlain', 'Opium YSL',
    'Musc Ravageur Frederic Malle', 'Ambre Nuit Dior',
    'Spicebomb Viktor Rolf', 'Kenzo Amour'
  ];
  // Fresh Classics shelf
  const freshPool = [
    'Bleu de Chanel EDP', 'Acqua di Gio Profumo', 'Y EDP YSL',
    'Erba Pura Xerjoff', 'Light Blue Dolce', 'Terre Hermes',
    'Reflection Man Amouage', 'Viking Creed', 'Silver Mountain Water Creed',
    'Bvlgari Man in Black', 'Neroli Portofino Tom Ford',
    'Lime Basil Mandarin Jo Malone', 'Kouros YSL', 'Dior Homme Eau',
    'Cool Water Davidoff', 'L\'Eau d\'Issey Issey Miyake'
  ];
  const shuffle = arr => arr.slice().sort(() => Math.random() - 0.5);

  delete _shelfCache['shelf-dark'];
  delete _shelfCache['shelf-oriental'];
  delete _shelfCache['shelf-fresh'];

  loadShelf('shelf-dark', shuffle(darkPool).slice(0, 8));
  loadShelf('shelf-oriental', shuffle(orientalPool).slice(0, 8));
  loadShelf('shelf-fresh', shuffle(freshPool).slice(0, 8));
  loadCommunityFeed();
  loadArticlesList();
}
```

**2. Update `updateHero()`** — replace with this version that targets the new greeting bar IDs:

```javascript
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

    greetingName.textContent = `Good ${timeOfDay}, ${firstName}`;
    greetingStats.textContent = `${diary.length} logged · ${collection.length} in hive`;

    const streak = computeStreak();
    if (streak.current >= 2) {
      greetingStreak.style.display = '';
      greetingStreakNum.textContent = streak.current;
    } else {
      greetingStreak.style.display = 'none';
    }
    greeting.style.display = '';
  } else {
    greeting.style.display = 'none';
  }
}
```

**3. Add `renderContinueStrip()` function** (add after `renderHome()`):

```javascript
function renderContinueStrip() {
  const section = document.getElementById('section-continue');
  const strip = document.getElementById('continue-strip');
  if (!section || !strip) return;

  if (!user || diary.length === 0) {
    section.style.display = 'none';
    return;
  }

  // Show last 4 unique fragrances from diary
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
```

**4. Add `renderForYouShelf()` function** (add after `renderContinueStrip()`):

```javascript
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

  // Determine source fragrance
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
    // Guest or empty: curated gateway shelf
    if (eyebrow) eyebrow.textContent = 'Crowd favourites';
    if (title) title.innerHTML = 'Where to <em>start</em>';
    if (sub) sub.textContent = 'The fragrances everyone should smell at least once.';
    loadShelf('shelf-foryou', _nicheGatewayPool.slice().sort(() => Math.random() - 0.5).slice(0, 8));
    section.style.display = '';
    return;
  }

  // Personalised header
  const firstName = user?.user_metadata?.name?.split(' ')[0]
    || user?.email?.split('@')[0] || '';
  if (eyebrow) eyebrow.textContent = 'Tuned to your taste';
  if (title) title.innerHTML = firstName ? `Picked for <em>${escapeHtml(firstName)}</em>` : 'Picked <em>for you</em>';
  if (sub) sub.textContent = `Because you have ${escapeHtml(sourceHouse)} ${escapeHtml(sourceName)}`;
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
    // Fallback to gateway
    loadShelf('shelf-foryou', _nicheGatewayPool.slice().sort(() => Math.random() - 0.5).slice(0, 8));
  }
}
```

**5. Add `openTasteTest()` function** (add near `openAI()`):

```javascript
function openTasteTest() {
  // For Phase 1: open AI modal with a pre-filled taste test prompt
  const input = document.getElementById('ai-input');
  if (input) {
    input.value = 'Give me a fragrance taste test. Ask me 5 short questions one at a time about my preferences — season, mood, intensity, favourite smells from memory — then produce a personalised scent profile and 5 recommendations.';
  }
  openModal('modal-ai');
  if (input) input.focus();
}
```

**6. Add `timeAgo()` helper** (add near other utility functions):

```javascript
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (h < 1) return 'just now';
  if (h < 24) return h + 'h ago';
  if (d === 1) return 'yesterday';
  if (d < 7) return d + ' days ago';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
```

---

#### D. What NOT to change

- `loadShelf()` — no changes needed
- `buildPosterCard()` — no changes needed
- `loadPopularShelf()` — no changes needed
- `loadCommunityFeed()` — no changes needed
- `loadArticlesList()` — no changes needed
- `searchFragella()` — no changes needed
- All modal functions — no changes needed
- Diary, collection, hive screens — no changes needed
- All `api/` files — no changes needed

---

#### E. Acceptance criteria

- [ ] No marketing hero on home screen. First visible content is search bar + greeting bar (if logged in) or search bar directly.
- [ ] Greeting bar shows name, time-of-day greeting, stats, and streak badge (if streak ≥ 2).
- [ ] Greeting bar is hidden for guest users.
- [ ] "Continue wearing" strip shows up to 4 recent diary items with name, house, time ago, and ⏱ quick-log button. Hidden for guests and when diary is empty.
- [ ] "For You" shelf shows personalised results (similar to first hive/diary item) when user has data. Shows curated gateway picks for guests.
- [ ] "Recently worn" shelf still shows when diary.length > 0.
- [ ] Popular shelf loads (existing behaviour preserved).
- [ ] Dark & brooding shelf loads (existing behaviour preserved).
- [ ] Warm & oriental shelf loads 8 randomly-shuffled items from the oriental pool.
- [ ] Taste Test card is visible, tappable, and opens the AI modal with the taste test prompt pre-filled.
- [ ] Fresh classics shelf loads (existing behaviour preserved).
- [ ] Articles section loads (existing behaviour preserved).
- [ ] Community section shows at bottom (existing behaviour preserved).
- [ ] No JS errors in console on load.
- [ ] All existing functions (openLog, openFrag, quickLog, showTab, triggerSearch) still work.
- [ ] Guest user sees a full, browsable home without any broken sections.

---

### TASK 6 — Fragrance Detail v1
**Status:** ready for implementation

**Why:** The current fragrance page works but feels unfinished. The name is small, there's no sense of whether you own it or have worn it, no description, no proper "when to wear" guidance, and the "similar" shelf shows same-house only — not actually similar fragrances. This is the most-opened screen in the app so it needs to feel premium.

**Goal:** Make every fragrance page feel like a Letterboxd film page — rich, informative, personal, and with a clear action hierarchy.

**Files:** `app.js`, `styles.css` only. Do NOT touch `index.html` (screen shell is fine as-is).

---

#### What exists today (do not break)

In `openFrag()` (`app.js`), the following are built into `#frag-content`:
- `.frag-hero` — bottle image + house/name/meta + 3 action buttons (Log, Hive, Wish)
- `.frag-stats-grid` — gender, year, price, type (4 cells)
- season voting block (`#frag-seasons-inner`)
- performance voting block (`#frag-perf-inner`)
- note tiles (top/heart/base tiers with Wikipedia photos)
- accords bars
- `#frag-reviews` — community diary entries for this fragrance
- `#frag-similar` — "More from [House]" shelf
- "Where to buy" links

The two-column sticky layout on desktop (38% bottle / 62% content) is already working via CSS Grid. **Do not change the grid or sticky behaviour.**

---

#### A. Hero area improvements

**1. Bigger name typography**

In `styles.css`, change `.frag-hero-name`:
```css
/* FROM: */
.frag-hero-name { font-size: 36px; ... }
/* TO: */
.frag-hero-name { font-size: 42px; font-style: italic; letter-spacing: -0.02em; line-height: 0.95; margin-bottom: 10px; }
```

At `@media(min-width:768px)` change from `38px` to `44px`.

**2. Personal status bar** — shown between the meta line and the action buttons, only when the user has data about this fragrance.

Add this **inside `openFrag()`**, just before building the `frag-actions` div. Compute it from `diary` and `collection`:

```javascript
// Personal status
const diaryEntries = diary.filter(e =>
  (e.fragrance_name || '').toLowerCase() === (f.name || '').toLowerCase()
);
const inHive = collection.some(c =>
  (c.name || '').toLowerCase() === (f.name || '').toLowerCase()
);
const wornCount = diaryEntries.length;
const lastEntry = diaryEntries[0]; // diary is sorted newest-first
const avgRating = wornCount
  ? Math.round(diaryEntries.reduce((s, e) => s + (e.rating || 0), 0) / wornCount)
  : 0;

const statusBadges = [];
if (inHive) statusBadges.push('<span class="fd-badge fd-badge-hive">🐝 In your hive</span>');
if (wornCount > 0) {
  const starsHtml = avgRating
    ? '<span class="fd-badge-stars">' + '★'.repeat(avgRating) + '<span style="color:var(--grey2)">' + '★'.repeat(5-avgRating) + '</span></span>'
    : '';
  const lastDate = new Date(lastEntry.worn_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  statusBadges.push('<span class="fd-badge fd-badge-worn">Worn ' + wornCount + 'x ' + starsHtml + '</span>');
  statusBadges.push('<span class="fd-badge fd-badge-date">Last: ' + lastDate + '</span>');
}
const statusBar = statusBadges.length
  ? '<div class="fd-status">' + statusBadges.join('') + '</div>'
  : '';
```

Insert `statusBar` into the hero body HTML, between `.frag-hero-meta` and `.frag-actions`:

```javascript
// In the frag-hero-body string:
'<div class="frag-hero-meta">...</div>' +
statusBar +   // ← insert here
'<div class="frag-actions">...</div>'
```

**3. Action buttons — clearer hierarchy**

Change the actions from three equal-flex buttons to:
- "Log & rate" — full-width gold primary
- "🐝 Add to hive" and "✨ Wishlist" — side by side, secondary

Replace the `frag-actions` HTML block in `openFrag()`:

```javascript
const fragActionsHtml =
  '<div class="frag-actions">' +
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
```

---

#### B. Description section (new)

Insert immediately after `.frag-stats-grid` and before `seasonHtml`:

```javascript
const descHtml = f.description
  ? '<div class="detail-sec fd-desc">' +
      '<div class="detail-label">About this fragrance</div>' +
      '<p class="fd-desc-text">' + escapeHtml(f.description) + '</p>' +
    '</div>'
  : '';
```

---

#### C. "When to wear" section (new)

Replace the current season block (`seasonHtml`) with a richer section that combines derived occasion chips with the existing community season vote UI.

**Occasion mapping** — derive from `f.family`:

```javascript
const FAMILY_OCCASIONS = {
  'woody':     ['Office', 'Casual', 'Autumn'],
  'oriental':  ['Evening', 'Date night', 'Winter'],
  'fresh':     ['Office', 'Sport', 'Spring', 'Summer'],
  'floral':    ['Date night', 'Weekend', 'Spring'],
  'gourmand':  ['Evening', 'Autumn', 'Winter'],
  'aquatic':   ['Sport', 'Summer', 'Casual'],
  'fougere':   ['Office', 'Sport'],
  'chypre':    ['Evening', 'Weekend'],
  'citrus':    ['Morning', 'Summer', 'Sport'],
  'aromatic':  ['Office', 'Casual'],
  'leather':   ['Evening', 'Autumn'],
  'musk':      ['Casual', 'Weekend'],
};
const familyKey = (f.family || '').toLowerCase().split(/[\s/,]/)[0];
const occasionChips = (FAMILY_OCCASIONS[familyKey] || [])
  .map(o => '<span class="fd-when-chip">' + o + '</span>')
  .join('');

const whenHtml = '<div class="detail-sec">' +
  '<div class="detail-label">When to wear</div>' +
  (occasionChips ? '<div class="fd-when-chips">' + occasionChips + '</div>' : '') +
  '<div class="fd-when-votes">' +
    '<div class="detail-sublabel">Community seasons</div>' +
    '<div id="frag-seasons-inner"><div class="season-wrap"><div style="color:var(--grey);font-size:11px">Loading votes…</div></div></div>' +
  '</div>' +
'</div>';
```

Update `openFrag()` to use `whenHtml` in place of `seasonHtml`.

---

#### D. Improve "Similar fragrances" shelf

`loadSimilarFragrances(house, currentName)` currently searches only by house. Change it to search by family/notes first, house as fallback, and rename the section title.

Replace `loadSimilarFragrances()` in `app.js`:

```javascript
async function loadSimilarFragrances(f) {
  const el = document.getElementById('frag-similar');
  if (!el) return;
  const label = el.querySelector('.detail-label');

  // Strategy 1: search by family (most relevant)
  // Strategy 2: search by house (fallback)
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
      // Merge without duplicates
      const seen = new Set(results.map(r => (r.name||'').toLowerCase()));
      for (const r of byHouse) {
        if (!seen.has((r.name||'').toLowerCase())) results.push(r);
      }
    } catch(e) {}
  }

  // Filter out the current fragrance
  const filtered = results.filter(r =>
    (r.name || '').toLowerCase() !== currentName
  ).slice(0, 8);

  if (!filtered.length) { el.style.display = 'none'; return; }

  if (label) label.textContent = 'You might also like';
  const shelf = el.querySelector('.poster-row');
  if (shelf) {
    shelf.innerHTML = filtered.map(r => {
      const key = 'sim' + Math.random().toString(36).slice(2,7);
      fragStore[key] = r;
      return buildPosterCard(r);
    }).join('');
    shelf.querySelectorAll('.poster-card').forEach(c =>
      c.addEventListener('click', () => openFrag(c.getAttribute('data-key')))
    );
  }
}
```

**Update the call site** in `openFrag()`:
- Change `if (f.house) loadSimilarFragrances(f.house, f.name);` → `loadSimilarFragrances(f);`
- Change the `frag-similar` HTML in the main string to: `'<div class="detail-sec" id="frag-similar"><div class="detail-label">You might also like</div><div class="poster-row"><div class="loading-row"><div class="spinner"></div></div></div></div>'`

---

#### E. New CSS to add to `styles.css`

```css
/* ── Fragrance detail: personal status ── */
.fd-status {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 10px 0 14px;
}
.fd-badge {
  font-family: 'DM Mono', monospace;
  font-size: 9px;
  letter-spacing: 0.06em;
  padding: 4px 10px;
  border-radius: 20px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.fd-badge-hive {
  background: var(--gold-pale);
  color: var(--gold);
  border: 1px solid var(--gold-dim);
}
.fd-badge-worn {
  background: var(--purple-pale);
  color: var(--purple-light);
  border: 1px solid var(--purple-dim);
}
.fd-badge-date {
  background: transparent;
  color: var(--grey);
  border: 1px solid var(--border);
}
.fd-badge-stars {
  font-size: 10px;
  color: var(--honey);
  margin-left: 2px;
}

/* ── Fragrance detail: action row 2 ── */
.frag-actions-row2 {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.frag-actions-row2 .frag-btn {
  flex: 1;
}

/* ── Fragrance detail: description ── */
.fd-desc-text {
  font-size: 14px;
  color: var(--white2);
  line-height: 1.7;
  font-style: italic;
  margin: 0;
}

/* ── Fragrance detail: when to wear ── */
.fd-when-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-bottom: 18px;
}
.fd-when-chip {
  font-family: 'DM Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.06em;
  padding: 5px 13px;
  border-radius: 20px;
  background: var(--bg4);
  color: var(--white2);
  border: 1px solid var(--border);
}
.detail-sublabel {
  font-family: 'DM Mono', monospace;
  font-size: 8px;
  color: var(--grey);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-bottom: 10px;
  opacity: 0.7;
}

/* ── Desktop: larger name ── */
@media (min-width: 768px) {
  .frag-hero-name { font-size: 44px; }
  .frag-actions-row2 { flex-direction: column; }
  .frag-actions-row2 .frag-btn { flex: none; width: 100%; }
}
```

---

#### F. Section order in `openFrag()` after this task

The final string passed to `#frag-content.innerHTML` should be in this order:

1. `.frag-hero` (bottle + name + statusBar + fragActionsHtml)
2. `.frag-stats-grid` (gender/year/price/type)
3. `descHtml` (description — new)
4. `whenHtml` (when to wear + community seasons — replaces old seasonHtml)
5. `perfHtml` (performance votes — unchanged)
6. Notes section (unchanged)
7. Accords section (unchanged)
8. `#frag-reviews` (unchanged)
9. `#frag-similar` (improved — "You might also like")
10. "Where to buy" (unchanged)

---

#### G. Acceptance criteria

- [ ] Fragrance name is larger (42px mobile, 44px desktop), italic.
- [ ] When the current user has this fragrance in their diary: a purple "Worn Nx" badge and "Last: [date]" badge appear below the meta line.
- [ ] When the current user has this fragrance in their hive: a gold "🐝 In your hive" badge appears.
- [ ] Action buttons: "Log & rate" (or "Log again" if worn before) is full-width gold on top; "🐝 Add to hive" and "✨ Wishlist" share a second row.
- [ ] If `f.description` exists, a styled italic description shows after the stats grid.
- [ ] "When to wear" section shows derived occasion chips (e.g. Office, Evening, Sport) based on fragrance family, followed by the community season vote UI.
- [ ] "You might also like" shelf searches by family first, falls back to house, excludes the current fragrance.
- [ ] All existing features still work: voting, note tiles, Wikipedia photos, reviews, buy links.
- [ ] No JS errors in console.
- [ ] Desktop two-column layout is unchanged.

---

### TASK 7 — Diary entry detail view (was Task 3 / Task 6)
**Status:** ready for implementation (full spec lives in the original Task 3 block above, search for "TASK 3 — Diary entry detail view")

---

## Workflow

```
Claude  → writes/updates specs here in HANDOFF.md
Codex   → reads HANDOFF.md, implements lowest-numbered incomplete task, commits
Frode   → pushes via GitHub Desktop, tests production
Claude  → reviews, marks task done, writes next spec
```

## Coding Rules for Codex

1. Files are now split: HTML in `index.html`, CSS in `styles.css`, JS in `app.js`.
2. Each task specifies which files to edit — do not edit others.
3. Never introduce external dependencies or CDN links without flagging it.
4. Run a syntax check before committing (open in browser, check console for errors).
5. Commit message format: `feat: <short description>` or `fix: <short description>`.
6. Do NOT push — Frode does that via GitHub Desktop.
7. Do NOT touch `api/` files unless the task explicitly says to.
8. If unsure about scope, make the smallest safe change and leave a note here.
