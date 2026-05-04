# ScentHive Redesign Brief

## North Star

ScentHive should feel like a premium fragrance diary and discovery app: the endless personal shelves of Spotify, the taste identity and logging loop of Letterboxd, and the fragrance knowledge depth of Fragrantica.

The product should not feel like an AI chatbot with perfume features. AI should become a quiet personalization layer that helps users discover, understand, compare, and build taste.

Working positioning:

> ScentHive is your scent taste OS.

## Product Feeling

- Clean, minimal, dark, fast, and tactile.
- Editorial enough to feel premium, but dense enough to feel like a real app.
- Lots of fragrance surfaces: rows, shelves, cards, articles, taste modules, and recently viewed items.
- Light color coding for meaning, not decoration.
- A clear logo/wordmark is needed, but the first version can be a strong text mark.
- The app should feel fun to browse even before a user logs their first fragrance.

## Inspiration Mix

- Spotify: horizontal rows, personalized shelves, "because you liked", endless browse.
- Letterboxd: logging, ratings, diary identity, profile taste, compact cards.
- Fragrantica: perfume database, notes, accords, community curiosity, articles.

## Visual Direction

- Keep the dark base, but reduce heavy purple/gold dominance.
- Use a restrained palette:
  - Near-black background.
  - Soft off-white text.
  - Muted gray hierarchy.
  - Gold/honey for primary scent actions.
  - Green/blue/pink accents only for categories and taste signals.
- Cards should be compact, sharp, and content-first.
- Bottle images should be the main visual asset whenever possible.
- Avoid marketing hero layouts. The first screen should be the actual product experience.

## Home Feed Concept

The home screen should become an endless fragrance feed made of shelves and editorial modules.

Priority modules:

- Continue
  - Last looked at
  - Recently logged
  - Quick log again

- For You
  - Perfumes we think you will like
  - Similar to a fragrance in your hive
  - Based on your highest ratings
  - Based on your wishlist

- Discovery
  - New releases
  - Today's recommendations
  - Trending now
  - Hidden gems
  - Best vanilla scents
  - Best clean office scents
  - Date night fragrances
  - Summer rotation

- Taste
  - Do a fragrance taste test
  - Your scent personality
  - Build my next sample set
  - Compare two fragrances

- Editorial
  - Professional articles and buying guides.
  - Examples:
    - "How to build a 5-bottle fragrance wardrobe"
    - "Why skin scents are everywhere"
    - "What oud actually smells like"
    - "The beginner guide to niche perfume"

## AI Repositioning

Current AI should be reconsidered. Avoid making AI the main visible feature.

Better AI uses:

1. Personalized shelves
   - "Because you liked Naxos"
   - "Warm spicy, less sweet"
   - "Niche upgrades from your designer shelf"

2. Taste test
   - A short, fun questionnaire that produces a scent profile and recommendations.
   - This should be the main AI entry point for users.

3. Smart fragrance pages
   - "What it smells like"
   - "When to wear it"
   - "Who should try it"
   - "If you like this, try..."

4. Editorial support
   - AI can help draft or curate articles, but the UI should present them as polished ScentHive editorial content.

## Monetization Direction

Do not block the daily diary too aggressively. The free loop must feel useful.

Possible paid features:

- Full taste profile.
- Advanced personalized recommendation shelves.
- Sample set builder.
- Wardrobe analysis.
- Premium articles and buying guides.
- Seasonal rotation planner.
- Better comparison tools.
- Alerts for new releases similar to saved fragrances.

Free should include:

- Search.
- Basic diary.
- Basic hive/collection.
- Wishlist.
- Basic recommendations.

Paid should feel like unlocking deeper taste intelligence, not paying to fix an annoying app.

## Redesign Implementation Order

### Phase 1 — Home v1

Goal: make the home screen feel like Spotify/Letterboxd for fragrance.

Scope:

- Replace the current home composition with a feed of dense shelves.
- Keep existing search and existing data functions.
- Add editorial/taste modules as static or semi-static cards first.
- Reuse existing poster cards where sensible.
- Keep performance simple: no new dependencies.

Acceptance:

- First viewport is clearly ScentHive and shows real fragrance/discovery content.
- Home has multiple scrollable rows.
- There is no generic landing-page hero.
- Logged-in users see personal modules when data exists.
- Guest users still see rich discovery modules.

### Phase 2 — Fragrance Detail v1

Goal: make each fragrance page feel premium and useful.

Scope:

- Improve bottle/header area.
- Make actions clear: log, hive, wish.
- Improve notes/accords readability.
- Add "similar to this" and "when to wear" sections.

### Phase 3 — Taste Test

Goal: replace generic AI recommendation feeling with a fun guided taste product.

Scope:

- 5-8 question flow.
- Results page with scent profile and recommended shelves.
- Save the taste profile locally first, then connect to auth later.

### Phase 4 — Brand System

Goal: make ScentHive recognizable.

Scope:

- Wordmark.
- Simple app icon direction.
- Color tokens and typography rules.
- Card, shelf, button, modal patterns.

### Phase 5 — Monetization Layer

Goal: define what becomes paid and how upgrades appear naturally.

Scope:

- Upgrade entry points.
- Premium labels.
- Free vs paid behavior.
- Pricing page or modal later.

## Agent Workflow

- Claude should turn each phase into a scoped task with exact files and acceptance criteria.
- Codex should implement one phase or subtask at a time.
- Frode pushes via GitHub Desktop.
- Codex verifies production after each push.

