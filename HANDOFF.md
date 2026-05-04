# ScentHive — Agent Handoff

Shared working document between **Claude** (planning, specs, review) and **Codex** (implementation).
Human owner: Frode. Push via GitHub Desktop when terminal auth is unavailable.

---

## Project Overview

**ScentHive** — fragrance diary + discovery app.
- **Frontend:** single-file `index.html` (~4 700 lines). No framework. Vanilla JS + CSS.
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

## Recently Completed

- ✅ Full layout redesign: global fixed top nav (Spotify-style), no sidebar, two-column fragrance detail (Letterboxd-style).
- ✅ Poster card UI (138×184px bottle tiles with gradient overlay + quick-action buttons).
- ✅ Note tiles with Wikipedia ingredient photos.
- ✅ Logo click → home, "ScentHive" renders as one word.
- ✅ Shelf randomization: 18-item dark/fresh pools shuffled + 8 picked per visit.
- ✅ Image error handling: broken images swap to 🏺 emoji fallback.
- ✅ Bottle image auto-fetch on scan add (looks up Fragella DB by name/house).
- ✅ mix-blend-mode changed from `screen` → `luminosity` so white bottles are visible.

---

## Task Queue

Tasks are ordered by priority. Codex should pick **Task 1** unless told otherwise.

---

### TASK 1 — Better empty states
**Status:** ready for implementation

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
**Status:** planned (do after Task 1)

**Why:** Logging a daily wear currently requires: open modal → search → pick result → fill date/time → tap Save. That's 5+ steps. Should be 2.

**What to build:** "Quick wear" button on collection items — one tap to log "I wore this today".

**Spec:**
- On each collection card in `#screen-col`, add a small ⏱ button alongside the existing ones.
- Tapping it calls `quickLog(name, house, image_url)`:
  ```javascript
  async function quickLog(name, house, imageUrl) {
    // Insert journal_entries row with worn_at = now(), no extra fields required
    // Show a brief toast: "Logged: [name]" for 2 seconds
  }
  ```
- No modal needed. Just tap → toast → done.

**Acceptance criteria:**
- [ ] Tapping ⏱ on a hive item logs it instantly with today's timestamp.
- [ ] Toast appears and disappears automatically.
- [ ] Entry appears in diary on next render.

---

### TASK 3 — Split index.html into css + js files
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
