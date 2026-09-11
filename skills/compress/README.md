# compress

Fewer tokens in, fewer tokens out. Same meaning.

## What it does

`compress` trims three things:

1. **Replies** — drops articles, filler, pleasantries, and hedging. Code, commands, identifiers, numbers, and exact error strings are preserved.
2. **Tool output** — quotes the decisive line instead of dumping raw logs.
3. **Context** — reduces pasted or loaded prose to what is actionable, keeping code, paths, URLs, and identifiers verbatim.

Three intensity levels:

| Level | What change |
|-------|-------------|
| `lite` | Drop filler and hedging. Sentences stay full. Professional but tight. |
| `full` | Default. Drop articles, fragments OK, short synonyms. |
| `ultra` | Bare fragments. One word when one word is enough. |

Auto-clarity rule: `compress` drops to normal prose for security warnings, irreversible-action confirmations, multi-step sequences where a dropped conjunction risks a misread, and when the user repeats a question. Resumes after the clear part.

## How to invoke

```
/compress              # full mode (default)
/compress lite         # lighter compression
/compress ultra        # maximum compression
stop compress          # back to normal prose
```

## Example output

Question: "Why does my React component re-render?"

Normal prose:
> Your component re-renders because you create a new object reference each render. Wrapping it in `useMemo` will fix the issue.

compress (full):
> New object ref each render. Inline object prop = new ref = re-render. Wrap in `useMemo`.

compress (ultra):
> Inline obj prop, new ref, re-render. `useMemo`.

## See also

- [`SKILL.md`](./SKILL.md): full LLM-facing instructions
- [Project README](../../README.md): install, supported agents
