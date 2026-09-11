# compress

Your AI coding agent talks too much. `compress` fixes that.

It teaches the agent to answer in tight, information-dense prose, to quote the one
decisive line of a command instead of dumping the whole log, and to trim pasted
context down to what actually matters. Technical details survive untouched: code,
commands, file paths, numbers, and exact error messages all stay exactly as they are.

Fewer tokens out. Smaller context in. Same answers.

## Before / after

**You ask:** "Why does my React component re-render?"

Without `compress`:
> Your component re-renders because you create a new object reference each render. Wrapping the object in `useMemo` should resolve the issue for you.

With `compress`:
> New object ref each render. Inline object prop = new ref = re-render. Wrap in `useMemo`.

**A command fails.** Without `compress`, the agent pastes 200 lines of log. With
`compress`, it pastes the one line that names the failure and the exact error string.

## What you get

| Feature | What it does |
|---------|--------------|
| Three intensity levels | `lite`, `full` (default), `ultra`. Change anytime with `/compress <level>`. |
| Reply compression | Drops filler, hedging, and narration. Keeps code, commands, identifiers, numbers. |
| Tool-output compression | Summarizes command output. Never dumps raw logs. |
| Context compression | Trims pasted prose to what is actionable. |
| Auto-clarity | Switches to normal prose for security warnings, destructive actions, and ambiguous multi-step instructions. Never sacrifices correctness for brevity. |
| Persistent mode | Stays on across the session until you say "stop compress". |

## Install

One command. `compress` detects which agents you have and installs for them.

**macOS / Linux**
```bash
curl -fsSL https://raw.githubusercontent.com/ghostlives/compress-skill/main/install.sh | bash
```

**Windows (PowerShell)**
```powershell
irm https://raw.githubusercontent.com/ghostlives/compress-skill/main/install.ps1 | iex
```

### Per-agent

| Agent | Command | Auto-activates? |
|-------|---------|-----------------|
| Claude Code | Claude Code plugin, or standalone hooks from the installer | Yes — SessionStart hook |
| Codex | Plugin + `.codex/hooks.json` | Yes |
| Gemini CLI | Extension with `GEMINI.md` | Yes |
| Cursor | `npx skills add ghostlives/compress-skill -a cursor` | Yes — always-on rule |
| Windsurf | `npx skills add ghostlives/compress-skill -a windsurf` | Yes |
| Cline | `npx skills add ghostlives/compress-skill -a cline` | Yes |
| GitHub Copilot | `npx skills add ghostlives/compress-skill -a github-copilot` | Yes |
| opencode | Native plugin + `AGENTS.md` | Yes |
| Others | `npx skills add ghostlives/compress-skill -a <profile>` | No — run `/compress` each session |

Full per-agent instructions in [INSTALL.md](./INSTALL.md).

## Usage

```
/compress              # turn on, full mode (default)
/compress lite         # lighter touch
/compress ultra        # maximum compression
stop compress          # back to normal prose
normal mode            # same thing
```

Natural language works too: "compress mode", "shorter answers", "less output tokens".

## What stays untouched

`compress` is a style layer. It never rewrites:

- Code blocks and inline code
- Shell commands, file paths, URLs
- Function names, API names, library names, protocols
- Numbers, units, versions, dates
- Error strings, exit codes
- Normal prose in commits, docs, issues, and PRs (those go to other humans)

## Configuration

Default mode is `full`. Change it with an environment variable or a config file.

```bash
export COMPRESS_DEFAULT_MODE=ultra
```

Or `~/.config/compress/config.json`:
```json
{ "defaultMode": "lite" }
```

Set `"off"` to stop auto-activation on session start. You can still turn it on with `/compress`.

Resolution order: environment variable → config file → `full`.

## License

MIT
