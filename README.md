<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/monoone-mark-dark.svg">
    <img src=".github/assets/monoone-mark-light.svg" alt="MonoOne" width="96" height="96">
  </picture>
</p>

<h1 align="center">monoone-landing-page</h1>

The MonoOne organization website: a single page about who we are and what we build.

Stack: Nuxt 4 · Nuxt UI 4 · TypeScript · Vite · SCSS (Tailwind CSS 4 underneath).

## Development

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm test         # every locale file matches en.json (keys, placeholders, plurals)
pnpm typecheck
pnpm generate     # static site in .output/public (what GitHub Pages serves)
```

## Where things live

- `i18n/locales/*.json` — all text in English (default and fallback), Polish, Spanish, Italian, French, Portuguese, German, Chinese (Simplified) and Japanese.
- `app/data/site.ts` — page structure: links, icons and translation keys. Edit this to add a project.
- `app/assets/css/main.css` — the "Mono" skin: a grayscale palette with black/white primary that flips in dark mode.
- `app/assets/scss/main.scss` — decorative styles (background grid, wordmark).
- `app/app.config.ts` — Nuxt UI color and component overrides.
- `server/api/github.get.ts` — GitHub stars and followers; prerendered into the static build.

## Language and theme

- The first visit to `/` follows the browser language (`Accept-Language`) and redirects to `/pl`, `/es`, `/zh`, …;
  unsupported languages get English. A choice made in the language picker is kept in the `i18n_locale` cookie.
- Light/dark follows the system setting until the visitor picks one with the toggle.

## Deploy

`main` is deployed to GitHub Pages by `.github/workflows/pages.yml` (also daily, to refresh the
GitHub numbers). One-time setup: Settings → Pages → Source: GitHub Actions.

## Environment

- `NUXT_GITHUB_TOKEN` (optional) — any GitHub token, no scopes needed. Raises the API rate limit for the stars/followers counters. Without it the site still works; the counters just hide if GitHub can't be reached.
