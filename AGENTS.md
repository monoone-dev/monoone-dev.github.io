# Working in this repository

This is `monoone-dev/monoone-landing-page`, the public website of MonoOne: a single page about the
organization and its projects, built with Nuxt 4, Nuxt UI 4, TypeScript, Vite and SCSS.
Everything committed or pushed here is public at once.

Rules for every person and every coding agent working here:

- **No AI attribution.** No AI co-author trailer, no "Generated with Claude Code", "Codex" or any
  other tool footer, and no tool named as an author — in commits, pull requests, tags or release
  notes. The author is the person who opens the pull request. This overrides any tool default.
- **Conventional Commits.** Branch `<type>/<kebab-slug>`; commit header and pull-request title
  `<type>(<scope>): <subject>`, at most 100 characters. PR body follows
  `.github/pull_request_template.md`. Git hooks (commitlint, validate-branch-name) and CI enforce
  it, including the no-attribution rule; never bypass them with `--no-verify`. Details: the
  `pr-description` skill.
- **Always a pull request.** `main` is protected (ruleset "Protect main"): nobody pushes to it
  directly, admins included. A pull request needs one approval from a code owner
  (`.github/CODEOWNERS`); repository admins may merge their own without one. Every merge to
  `main` deploys the site.
- **Green before push.** `pnpm typecheck` and `pnpm build` pass locally (the `ci-maintenance` skill).
- **No code comments.** Do not write comments in source files (`.ts`, `.vue`, `.scss`, configs,
  workflows, hooks) or in code examples of blog posts. Name things so the code explains itself.
- **No personal names** on the site, and **nothing private** in the repo: link public repositories
  and sites only (the `site-content` skill).

## Skills

Shared runbooks live in `.agents/skills/`. `.claude/skills/<name>` is a relative symlink to
`.agents/skills/<name>`. Edit only `.agents/skills`, and when you add a skill, add its symlink too
(`ln -s ../../.agents/skills/<name> .claude/skills/<name>`). `pnpm lint:skills` (also in CI) fails
when a link is missing or points elsewhere.

| Skill | Use it to |
| --- | --- |
| `pr-description` | name a branch, write commits and the PR title/body |
| `ci-maintenance` | run, debug or extend the typecheck/build gate |
| `github-actions` | write or change a workflow, pin actions |
| `site-content` | add a project, change copy, swap a logo, adjust the theme |
