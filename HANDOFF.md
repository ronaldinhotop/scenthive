# ScentHive Handoff

This file is the shared note between Claude, Codex, and the human owner.

## Current Goal

Make ScentHive feel like a polished, useful fragrance diary rather than a prototype.

## Current State

- Production: https://scenthive-ten.vercel.app
- App structure: single-file frontend in `index.html` plus Vercel API functions.
- Search uses Fragella through `api/search.js`.
- AI recommendations and bottle scanning use Anthropic through Vercel env vars.
- GitHub Desktop is currently the easiest way to push local Codex commits.

## Recent Decisions

- Keep the current lightweight Vercel/static app for now.
- Improve product quality in small, deployable steps.
- Do not commit secrets. Use Vercel environment variables.
- Search relevance is a priority because bad results make the app feel unreliable.

## Next Tasks

1. Make known-fragrance aliases override weak generic search results.
2. Split `index.html` into `styles.css` and `app.js` once the core UX stabilizes.
3. Improve the log flow so adding a daily wear takes under 30 seconds.
4. Improve empty states for diary, hive, wishlist, and profile.
5. Add basic QA checklist for search, AI recommendations, scan, auth, and logging.

## Acceptance Criteria Template

When adding a new task, fill this out:

```md
### Task
Short description.

### Why
What user problem this solves.

### Files Likely Affected
- `path/to/file`

### Acceptance Criteria
- [ ] User-visible outcome
- [ ] Edge case handled
- [ ] Production test to run

### Open Questions
- Question, if any
```

## Notes For Claude

Focus on product direction, user journeys, copy, prioritization, and edge cases. Prefer writing clear specs here instead of suggesting broad rewrites.

## Notes For Codex

Read this file before implementation. Keep changes scoped, run syntax checks, commit locally, and ask the owner to push through GitHub Desktop when terminal auth is unavailable.
