---
name: site-content
description: Change what the MonoOne website says or shows — add or edit a project, update the principles or hero copy, swap a logo, or adjust the Mono theme — following the content rules (no personal names, honest privacy claims, nothing private). Use whenever the user asks to add a project, change text on the site, replace a logo or tweak colors.
---

# /site-content — editing the site

## Where things live

| What | Where |
| --- | --- |
| All visible text, per language | `i18n/locales/{en,pl,es,it,fr,pt,de,zh,ja}.json` |
| Page structure: links, icons, translation keys | `app/data/site.ts` |
| Header: desktop bar, tablet and phone menus | `app/components/AppHeader.vue` |
| Language and theme menus (shared by the bar and the phone menu) | `app/composables/useLanguageMenu.ts`, `app/composables/useThemeMenu.ts`; buttons in `LanguageSwitcher.vue`, `ThemeMenu.vue`; flags in `app/data/site.ts` |
| Languages, default, browser detection | list in `shared/locales.ts`, `i18n` block in `nuxt.config.ts`, plural rules in `i18n/i18n.config.ts` |
| SEO: title, description, Open Graph, structured data | `meta` keys in the locale files, `useSeoMeta` and the JSON-LD in `app/app.vue`, `category` per project in `app/data/site.ts` |
| Sitemap and robots.txt | `server/routes/sitemap.xml.ts`, `server/routes/robots.txt.ts` (prerendered) |
| Page layout (hero, principles, projects, contact) | `app/pages/index.vue` |
| Project card | `app/components/ProjectShowcase.vue` |
| MonoOne mark (theme-aware SVG) | `app/components/MonoMark.vue`, colors in `--mark-*` in `app/assets/scss/main.scss` |
| IndexOne symbol | `app/components/IndexOneMark.vue`, source file in `app/assets/brand/` |
| Mono theme (grayscale, black/white primary) | `app/assets/css/main.css`, `app/app.config.ts` |
| Animations | `app/assets/scss/main.scss` (`.enter`, `.reveal`, hover rules) and `app/components/Reveal.vue` |
| GitHub stars / followers | `server/api/github.get.ts`, `app/components/GithubStats.vue` |
| Blog: list of posts (slug, date, version) | `shared/blog.ts`; title and description per language under `blog.posts.<key>` in the locale files |
| Blog: article text, one file per language | `content/blog/<slug>/<code>.md` (English is the fallback); `:::diagram <name>` on its own line places a diagram |
| Blog: diagrams, rendering, table of contents | `app/components/blog/diagrams/`, `app/components/blog/BlogProse.vue`, `app/utils/markdown.ts`, `app/components/blog/BlogToc.vue` |
| Blog pages | `app/pages/blog/index.vue`, `app/pages/blog/[slug].vue`; prerendered for every language in `nuxt.config.ts`, listed in the sitemap |

## Content rules

- **No personal names.** No people, authors, founders or team members — on the page, in alt text or in metadata.
- **Nothing private.** Link only public repositories and public sites; never internal paths or private repo names.
- **Privacy claims must be true.** "100% local" needs its qualifier if a feature can send data
  (opt-in cloud AI, E2EE sharing): say "unless you explicitly choose to". Do not claim "no telemetry"
  or "everything is encrypted" unless it is confirmed.
- Short sentences, no marketing superlatives. Product names (MonoOne, IndexOne, Obsidian, Whisper)
  are never translated.

## Translations

- English (`en.json`) is the source, the default and the fallback; every key must exist in all nine files.
  A missing key silently falls back to English, so add new text to all of them in the same change.
- Plurals use vue-i18n choices: `zero | one | other` (`"{n} stars | {n} star | {n} stars"`).
  Polish has four: `zero | one | few | many` (`"{n} gwiazdek | {n} gwiazdka | {n} gwiazdki | {n} gwiazdek"`).
  Chinese and Japanese have no plural forms: one message (`"{n} 个星标"`, `"スター {n} 件"`).
- Chinese is Simplified (`zh` → `zh-CN`); Traditional-Chinese browsers also land on it.
- Use gender-neutral phrasing (Polish: avoid `-łeś/-łaś` forms).
- Escape vue-i18n special characters (`@ { } | $`) as `{'@'}` if they ever appear in copy.
- Adding a language: a JSON file, an entry in `shared/locales.ts` (the i18n module and the sitemap
  read it) and in `nitro.prerender.routes` in `nuxt.config.ts`, a flag in `flags` in `app/data/site.ts` (`i-circle-flags-<country>`), and check
  that `@nuxt/ui/locale` has it (Nuxt UI's own labels; see `uiLocale` in `app/app.vue`).

## Add a project

1. Append an entry to `projects` in `app/data/site.ts` (`key` is its translation namespace, `repo`
   the public repo whose stars are shown) and add that namespace to every locale file.
2. Add its logo as a component next to `IndexOneMark.vue`: inline the official SVG, prefix every
   gradient/filter id with `useId()` so two copies on a page do not collide.
3. With two or more projects, check the Projects section layout and the hero button target.

## Blog post

1. Add the post to `posts` in `shared/blog.ts` and its `blog.posts.<key>` title and description to all nine locale files.
2. Write `content/blog/<slug>/en.md`, then one file per language with the **same headings in the same order**:
   section anchors are numbered (`#s9-4`), so every language must keep the numbering and every
   `:::diagram` line. Code blocks stay identical in every language.
3. A new diagram is a component in `app/components/blog/diagrams/` registered in `BlogProse.vue`.
   Give its SVG marker a fixed id (`slat-<name>-arrow`), not `useId()`: the ids differ between the
   prerendered page and the browser, and the arrowheads disappear.

## Header

Three layouts, same pattern as index-one-landing-page:

- **Desktop (≥ 1024px)** — links in the bar, then flag, theme and GitHub buttons.
- **Tablet (640–1023px)** — links move into a menu button; flag, theme and GitHub stay in the bar.
- **Phone (< 640px)** — only the logo and one menu: links, then Language and Theme submenus, then GitHub.

A new header control goes into the bar *and* into the phone menu (build its items in a composable so
both share them). Theme offers Light, Dark and System; System (the default) follows the OS.

## Logos

Use the official SVG when one exists; do not redraw a brand mark by eye. Keep the theme behavior:
the MonoOne mark inverts in dark mode via `--mark-*`; product icons keep their own tile.

## Verify

`pnpm typecheck && pnpm build`, then check the page in light and dark mode at 375px and desktop
width, with no horizontal scroll — in every language (German and Polish words are the longest).
