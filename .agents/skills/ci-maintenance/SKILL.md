---
name: ci-maintenance
description: Run, understand, debug and extend this repo's CI gate — `pnpm typecheck` and `pnpm build`, run locally and in GitHub Actions. How to reproduce a red run with the exact CI commands, the known gotchas (TypeScript pinned to 5.x for vue-tsc, pnpm allowBuilds, Nuxt type generation) and how to add a new check without the local and cloud gates drifting. Use whenever the user wants to run/fix CI, triage a failing check, or add a lint/test/check to the pipeline.
---

# /ci-maintenance — run, debug and extend the gate

"Green" means these commands pass, in this order, on a clean checkout:

```bash
pnpm install --frozen-lockfile   # also runs `nuxt prepare` (postinstall) → generates .nuxt types
pnpm lint:skills                 # every .claude/skills entry is a symlink to .agents/skills
pnpm test                        # node --test over i18n/*.test.ts (Node 24 strips the types)
pnpm typecheck                   # nuxt typecheck → vue-tsc over app, server and shared
pnpm build                       # nuxt build → .output/
```

`.github/workflows/ci.yml` runs exactly these on every PR, on `main` and on demand. On a PR a
second job, `Conventional Commits`, checks the branch name, the commits and the PR title
(commitlint + validate-branch-name; see `/pr-description`). Run them locally
before every push and before `gh pr create`; never claim green from a run you did not see finish.

## Reproduce a red run

1. Read the failing step, not the summary: `gh run list --workflow CI -L 5`, then
   `gh run view <run-id> --log-failed`.
2. Run the same command locally from a clean state: `rm -rf .nuxt node_modules/.cache && pnpm install --frozen-lockfile`.
3. Classify: real failure (types, build) vs environment (lockfile out of date, blocked install
   script, cold cache) vs flake (re-run once before "fixing").

## Gotchas

- **TypeScript stays on 5.x.** `vue-tsc` does not support TypeScript 7 yet; upgrading breaks
  `pnpm typecheck` with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- **Install scripts are allow-listed** in `pnpm-workspace.yaml` (`allowBuilds`). A new dependency with
  a build script fails the install until it is added there.
- **Lockfile drift** fails `--frozen-lockfile`: commit `pnpm-lock.yaml` with every dependency change.
- **Nuxt types are generated.** A missing `#imports` / auto-import type usually means `.nuxt` is
  stale — run `pnpm nuxt prepare`.
- **Server/app boundary.** Types shared by `server/` and `app/` live in `shared/types/` and are
  imported from `#shared/...`; importing a server file into the app breaks the typecheck.

## Tests

- `i18n/*.test.ts` run on Node's built-in runner (`node:test`, `node:assert/strict`); Node 24
  strips the TypeScript types, so there is no test framework to install.
- `i18n/locales.test.ts` fails when a file in `i18n/locales/` misses or adds a key, empties a message
  that `en.json` fills, changes a `{placeholder}`, has the wrong number of plural forms (Polish 4,
  Chinese and Japanese 1, the rest as many as English), or when a blog post lacks an article in a
  language. The languages come from `shared/locales.ts`, the posts from `shared/blog.ts`.
- Import modules by relative path with their `.ts` extension. Only files without Nuxt auto-imports
  or aliases load this way. They sit in `i18n/`, inside the Nuxt app tsconfig, so
  `pnpm typecheck` checks them like the site code.

## Add a check

1. Add it as a `package.json` script first (e.g. `"lint": "eslint ."`) so it runs the same locally.
2. Add one `- run: pnpm <script>` step to `ci.yml`, ordered cheap-before-expensive
   (lint → test → typecheck → build).
3. Prove it RED before GREEN: introduce a temporary violation, see the step fail, remove it.
4. New dev dependency or new action → ask the user first. Follow `/github-actions` for the workflow.
