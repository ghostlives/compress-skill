# Install

`compress` reaches each agent one of two ways: an **installer** that wires hooks and
rules into the agent's config directory, or **`npx skills`**, which copies the skill
into the agent's skill folder.

Replace `YOUR_GITHUB_USER` with the GitHub account that owns this repository.

## One command (recommended)

The installer detects which agents you have and installs for them.

**macOS / Linux**
```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_GITHUB_USER/compress-skill/main/install.sh | bash
```

**Windows (PowerShell)**
```powershell
irm https://raw.githubusercontent.com/YOUR_GITHUB_USER/compress-skill/main/install.ps1 | iex
```

From a clone, run it directly:

```bash
node bin/install.js            # install for detected agents
node bin/install.js --list     # show every supported agent and detection result
node bin/install.js --uninstall
```

## Claude Code

**Plugin install.** Add this repo as a plugin marketplace, then install the plugin:

```bash
claude plugin marketplace add YOUR_GITHUB_USER/compress-skill
claude plugin install compress@compress
```

Hooks are wired automatically by the plugin system.

**Standalone install.** `node bin/install.js --only claude` copies the hooks into
`$CLAUDE_CONFIG_DIR/hooks/` and merges `SessionStart`, `UserPromptSubmit`, and the
statusline into `$CLAUDE_CONFIG_DIR/settings.json`.

Uninstall: `node bin/install.js -- --uninstall`.

## Codex

Plugin plus repo-local `.codex/hooks.json` and `.codex/config.toml`. The installer writes
these. The SessionStart hook activates `compress` automatically on macOS and Linux.

## Gemini CLI

The installer registers the extension and drops `GEMINI.md` into the workspace. Gemini
loads it as context every session, so `compress` is always on.

## opencode

The native plugin is copied into `~/.config/opencode/plugins/compress/`, alongside an
`AGENTS.md` ruleset and the skills directory. The plugin writes the mode flag on
`session.created` and appends per-prompt reinforcement on `tui.prompt.append`.

## Cursor / Windsurf / Cline / Copilot

These read skill profiles through the upstream [`skills`](https://github.com/vercel-labs/skills) CLI:

```bash
npx skills add YOUR_GITHUB_USER/compress-skill -a cursor
npx skills add YOUR_GITHUB_USER/compress-skill -a windsurf
npx skills add YOUR_GITHUB_USER/compress-skill -a cline
npx skills add YOUR_GITHUB_USER/compress-skill -a github-copilot
```

Optional repo-local always-on rules:

```bash
node src/tools/compress-init.js
```

This writes `.cursor/rules/compress.mdc`, `.windsurf/rules/compress.md`,
`.clinerules/compress.md`, and `.github/copilot-instructions.md` for the current repo.

## Any other agent

```bash
npx skills add YOUR_GITHUB_USER/compress-skill -a <profile>
```

Check the [`skills`](https://github.com/vercel-labs/skills) README for the profile slug.
Unknown agents do not auto-activate — run `/compress` at the start of each session.

## Want it always on without hooks?

Paste the contents of [`src/rules/compress-activate.md`](./src/rules/compress-activate.md)
into whatever persistent instruction file your agent reads (`AGENTS.md`, `GEMINI.md`,
system prompt, rules file).

## Configuration

```bash
export COMPRESS_DEFAULT_MODE=ultra   # lite | full | ultra | off
```

Or `~/.config/compress/config.json`:

```json
{ "defaultMode": "lite" }
```

Resolution order: environment variable → config file → `full`.
