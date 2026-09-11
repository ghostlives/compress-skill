# Contributing

## Layout

```
skills/compress/SKILL.md     Behavior. Single source of truth for LLM-facing rules.
src/rules/compress-activate.md   Always-on rule body. Mirrored into AGENTS.md and GEMINI.md.
src/hooks/                   Claude Code hooks that make the mode persistent.
bin/install.js               Multi-agent installer (PROVIDERS array).
plugins/compress/            Plugin distribution (CI-mirrored from skills/ and agents/).
commands/                    Codex/Gemini TOML command stubs.
tests/verify_repo.mjs        Repo invariants. Run before every commit.
```

## Rules

- Edit `skills/compress/SKILL.md` for behavior changes. Never edit
  `plugins/compress/skills/compress/SKILL.md` directly — CI syncs it.
- Edit `src/rules/compress-activate.md` for auto-activation changes, then mirror the body
  into `AGENTS.md` and `GEMINI.md` (marker-fenced with `<!-- compress-begin -->`).
- Hook files must silent-fail on every filesystem error. A hook must never block session
  start.
- Flag writes go through `safeWriteFlag()` in `src/hooks/compress-config.js`. Never call
  `fs.writeFileSync` on a predictable user-owned path directly.
- Any `session_id` that reaches a filesystem path must pass `validateSessionId()` first.
- New agents go in the `PROVIDERS` array in `bin/install.js`. Verify the profile slug
  exists upstream before merging.

## Before you commit

```bash
node tests/verify_repo.mjs
```
