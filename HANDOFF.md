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
**Status:** planned (do last, after UX is stable)

**Why:** At ~4 700 lines the single file is getting hard to navigate.

**What to build:**
- Extract all `<style>` content → `styles.css`
- Extract all `<script>` content → `app.js`
- `index.html` keeps only the HTML skeleton + `<link>` / `<script src>` tags
- Update `vercel.json` builds to include the new static files

**Important:** Do NOT change any logic or CSS during the split. Purely mechanical extraction.

---

## Workflow

```
Claude  → writes/updates specs here in HANDOFF.md
Codex   → reads HANDOFF.md, implements lowest-numbered incomplete task, commits
Frode   → pushes via GitHub Desktop, tests production
Claude  → reviews, marks task done, writes next spec
```

## Coding Rules for Codex

1. Edit `index.html` only unless the task explicitly names another file.
2. Keep CSS inside the `<style>` block (line ~1–750). Keep JS inside `<script>` (line ~900+).
3. Never introduce external dependencies or CDN links without flagging it.
4. Run a syntax check before committing (open in browser, check console for errors).
5. Commit message format: `feat: <short description>` or `fix: <short description>`.
6. Do NOT push — Frode does that via GitHub Desktop.
7. Do NOT touch `api/` files unless the task explicitly says to.
8. If unsure about scope, make the smallest safe change and leave a note here.
