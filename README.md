# ScentHive

ScentHive is a fragrance diary and collection app: log what you wear, rate scents, build a bottle archive, search fragrances, and get AI recommendations.

## Project Shape

- `index.html` contains the current app UI, styles, and browser JavaScript.
- `api/search.js` proxies Fragella fragrance search.
- `api/ai.js` handles AI recommendations through Anthropic.
- `api/scan.js` handles bottle image identification through Anthropic vision.
- `vercel.json` routes the static app and serverless API functions.

## Required Environment Variables

Set these in Vercel for Production, Preview, and Development:

```text
ANTHROPIC_KEY
FRAGELLA_API_KEY
```

For local development, copy `.env.example` to `.env` and fill in real values. Do not commit `.env`.

## Claude + Codex Workflow

Use GitHub as the source of truth and `HANDOFF.md` as the shared working note.

1. Claude writes product direction, UX notes, or specs in `HANDOFF.md`.
2. Codex reads `HANDOFF.md`, implements scoped changes, tests, and commits locally.
3. Push with GitHub Desktop using **Push origin**.
4. Vercel deploys from `main`.
5. Codex verifies production at `https://scenthive-ten.vercel.app`.

Keep handoffs concrete: current goal, files likely affected, acceptance criteria, and open questions.
