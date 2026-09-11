#!/usr/bin/env node
'use strict';

// SessionStart hook. Runs on startup, resume, clear, compact, fork.
// Resolves this session's mode, persists it, and emits the ruleset as hidden
// stdout (Claude Code injects hook stdout as system context).
//
// Never blocks session start: silent-fails on every error.

const fs = require('fs');
const path = require('path');

let cfg;
try {
  cfg = require('./compress-config.js');
} catch {
  cfg = null;
}

const PAYLOAD_WATCHDOG_MS = 2000;
const RESET_SOURCES = new Set(['startup', 'clear']);

const RULESET = `# compress — output style active

Respond terse. Cut tokens, keep meaning. Every response this session.

- Drop articles, filler, pleasantries, and hedging. Fragments OK. Short synonyms.
- No preamble, no plan narration, no progress notes, no decorative tables or emoji.
- Fire tool calls directly; text before a call only to clarify or warn.
- Never drop not/never/no/only/except. Numbers and units exact.
- Never grow output to sound compressed — if it is not shorter, use the plain phrasing.
- Never dump raw logs. Quote the decisive line, or summarize: what ran, what it
  returned, what matters. Keep exact error strings and exit codes when they are the point.
- Reduce pasted context to what is actionable. Keep code, commands, file paths, URLs,
  identifiers, numbers, versions, and error strings verbatim.
- Clarity wins: one idea per sentence, ≤20 words, active voice, imperative for
  instructions, one term per concept.
- Drop compression for security warnings, irreversible actions, ambiguous multi-step
  sequences, and when the user repeats a question. Resume after the clear part.
- Normal prose for code, comments, commits, docs, issues, PRs, and memory files.
- Preserve the user's language. Compress the style, not the language.

Change level with /compress lite|full|ultra. Stop with "stop compress" or "normal mode".`;

function finish(out) {
  try {
    if (out) process.stdout.write(out);
  } catch {
    /* ignore */
  }
  // No process.exit(): on a pipe it can truncate stdout. pause + unref lets the
  // event loop drain stdout and exit on its own.
  try {
    process.stdin.pause();
  } catch {
    /* ignore */
  }
  try {
    process.stdin.unref && process.stdin.unref();
  } catch {
    /* ignore */
  }
}

function readPayload(onPayload) {
  let buf = '';
  let done = false;
  const finishReading = () => {
    if (done) return;
    done = true;
    try {
      process.stdin.pause();
    } catch {
      /* ignore */
    }
  };

  const timer = setTimeout(() => {
    finishReading();
    onPayload(null, 'timeout');
  }, PAYLOAD_WATCHDOG_MS);
  if (timer.unref) timer.unref();

  try {
    process.stdin.setEncoding('utf8');
  } catch {
    /* ignore */
  }

  process.stdin.on('data', (chunk) => {
    if (done) return;
    buf += chunk;
    try {
      const payload = JSON.parse(buf);
      clearTimeout(timer);
      finishReading();
      onPayload(payload, null);
    } catch {
      /* keep reading until we have a complete object */
    }
  });

  process.stdin.on('end', () => {
    if (done) return;
    clearTimeout(timer);
    finishReading();
    let payload = null;
    try {
      payload = JSON.parse(buf);
    } catch {
      payload = null;
    }
    onPayload(payload, payload ? null : 'no-payload');
  });

  process.stdin.on('error', () => {
    clearTimeout(timer);
    finishReading();
    onPayload(null, 'error');
  });

  try {
    process.stdin.resume();
  } catch {
    /* ignore */
  }
}

function statuslineConfigured(dir) {
  try {
    const raw = fs.readFileSync(path.join(dir, 'settings.json'), 'utf8');
    return raw.includes('compress-statusline');
  } catch {
    return false;
  }
}

function handle(payload) {
  if (!cfg) return finish('');

  const dir = cfg.claudeDir();
  const sessionId = cfg.validateSessionId(payload && payload.session_id);
  const source = (payload && payload.source) || 'unknown';

  let mode;
  if (RESET_SOURCES.has(source)) {
    mode = cfg.getDefaultMode((payload && payload.cwd) || process.cwd());
    cfg.gcSessionStore(dir, {});
  } else {
    // Continuation: preserve whatever this session had, including a literal "off".
    const raw = cfg.readSessionModeRaw(dir, sessionId);
    if (raw != null) {
      mode = cfg.VALID_MODES.includes(raw) ? raw : null;
    } else {
      const legacy = cfg.resolveActiveMode(dir, sessionId);
      mode = legacy || cfg.getDefaultMode((payload && payload.cwd) || process.cwd());
    }
  }

  if (mode == null || mode === 'off') {
    cfg.writeSessionMode(dir, sessionId, 'off');
    return finish('');
  }

  cfg.writeSessionMode(dir, sessionId, mode);
  cfg.recordModeChange(dir, mode, sessionId);

  let out = RULESET + '\n';
  if (!statuslineConfigured(dir)) {
    out +=
      '\n(compress: no statusline configured. Offer to add one on your first reply.)\n';
  }
  finish(out);
}

readPayload((payload) => handle(payload));
