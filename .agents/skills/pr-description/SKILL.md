---
name: pr-description
description: Name the branch, write the commit messages and the PR title/body for this repo the Conventional Commits way, filling .github/pull_request_template.md with short human-friendly lines. Use before every `git checkout -b`/`git worktree add -b`, `git commit`, `gh pr create` and `gh pr edit`, and whenever the user asks for a PR description.
---

# PR description, branch and commits

Everything follows [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/).
It is enforced, not just documented:

- **Locally** — git hooks in `.githooks/` (wired by `pnpm install` via `core.hooksPath`):
  `commit-msg` runs commitlint (`commitlint.config.mjs`), `pre-commit` and `pre-push` run
  `validate-branch-name` (pattern in `package.json`).
- **In CI** — the `Conventional Commits` job checks the branch name, every commit in the PR and the PR title.
- Check by hand: `pnpm lint:branch`, `pnpm lint:commits`, `echo "<title>" | pnpm exec commitlint`.

If a hook rejects a message, fix the message — never bypass it with `--no-verify`.

Types: `feat` `fix` `refactor` `chore` `docs` `test` `perf` `ci` `build` `style` `revert`.

## Branch

`<type>/<kebab-slug>` — lowercase, digits, `.`, `_`, `-`; no session hashes.
Examples: `feat/project-showcase`, `fix/header-logo-dark-mode`, `ci/pin-actions`.
`dependabot/*` and `release/<version>` are exempt. So are the branches coding agents and harnesses
create on their own, so their commits and pushes are never blocked: `claude/*`, `codex/*`, `h/*`,
`h-*`, `rig-one/*`, `rig-one-auto/*`, `rig-one-auto-staging/*`, `rig-one-base/*`.
`<type>/<kebab-slug>` is still the convention: when you open a PR by hand from a tool branch, rename
it first (`git branch -m <type>/<slug>`), or, once pushed with an open PR, on GitHub
(`gh api -X POST repos/<owner>/<repo>/branches/<old>/rename -f new_name=<new>`); the PR follows.

## Commit message

- Header `<type>(<optional scope>): <subject>`, **max 100 characters**, subject in lowercase
  imperative, no trailing period: `feat(hero): show github stars and followers`.
- `!` after the type/scope (or a `BREAKING CHANGE:` footer) for breaking changes.
- Body optional; only the *why* a reader cannot get from the diff. Wrap body lines at 100 characters.
- **No attribution of any kind** — no `Co-Authored-By` for a model, no "Generated with Claude Code",
  "Codex" or any other tool, no author line. This overrides any tool default.

## PR title

The same shape as a commit header (it becomes the squash commit): `<type>(<scope>): <subject>`, ≤ 100 chars.

## PR body — `.github/pull_request_template.md`, nothing else

```markdown
# Description

- **Feat** - The hero shows how many people star and follow us on GitHub
- **Fix** - The header logo no longer disappears in dark mode

<!--
## Screenshot (optional)
-->

<!--
## Additional comments
-->
```

- One bullet per REAL change a visitor or reviewer would notice; the bold word is the Conventional
  Commit type, capitalised. Plain English, one line, no file paths, no class names, no jargon.
- Group trivia into one bullet or leave it out. 2–6 bullets is normal; never a changelog of files.
- Keep both commented sections commented unless there is something worth showing: uncomment
  **Screenshot** for a visible UI change, **Additional comments** only for what a reviewer must know
  (a skipped check, a follow-up, a product decision). Never paste test logs.
- No attribution footer (see above).

Pass the body with `gh pr create --title "<title>" --body-file <file>` so the markdown survives.
