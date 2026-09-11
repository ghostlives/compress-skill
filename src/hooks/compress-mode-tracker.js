#!/usr/bin/env node
'use strict';

// UserPromptSubmit hook. Three jobs:
//   1. Slash-command activation (/compress [lite|full|ultra|off])
//   2. Natural-language activation / deactivation
//   3. Per-turn reinforcement while a level is active
//
// Reads the host payload from stdin. Returns on the first complete JSON object,
// never at EOF — the host's pipe close can lag arbitrarily.
// Silent-fails on every error.

let cfg;
try {
  cfg = require('./compress-config.js');
} catch {
  cfg = null;
}

const PAYLOAD_WATCHDOG_MS = 2000;

const ACTIVATE_RE =
  /\b(activate|enable|turn on|start|switch to|use)\s+(the\s+)?compress(\s+mode)?\b|\bcompress\s+mode\b|\b(be\s+brief|be\s+terse|shorter\s+answers?|less\s+(output\s+)?tokens?|trim\s+(the\s+)?context)\b/i;

const DEACTIVATE_RE =
  /\b(stop|disable|deactivate|turn off|end|exit)\s+(the\s+)?compress(\s+mode)?\b|\bnormal\s+mode\b|\bcompress\s+off\b/i;

const LEVELS = cfg ? cfg.VALID_MODES : ['lite', 'full', 'ultra', 'off'];

function finish(out) {
  try {
    if (out) process.stdout.write(out);
  } catch {
    /* ignore */
  }
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
  const stop = () => {
    if (done) return;
    done = true;
    try {
      process.stdin.pause();
    } catch {
      /* ignore */
    }
  };

  const timer = setTimeout(() => {
    stop();
    onPayload(null);
  }, PAYLOAD_WATCHDOG_MS);
  if (timer.unref) timer.unref();

  try {
    process.stdin.setEncoding('utf8');
  } catch {
    /* ignore */
  }

  const deliver = (payload) => {
    clearTimeout(timer);
    stop();
    onPayload(payload);
  };

  process.stdin.on('data', (chunk) => {
    if (done) return;
    buf += chunk;
    try {
      deliver(JSON.parse(buf));
    } catch {
      /* wait for a complete object */
    }
  });

  process.stdin.on('end', () => {
    if (done) return;
    let payload = null;
    try {
      payload = JSON.parse(buf);
    } catch {
      payload = null;
    }
    deliver(payload);
  });

  process.stdin.on('error', () => deliver(null));

  try {
    process.stdin.resume();
  } catch {
    /* ignore */
  }
}

function parseSlash(prompt) {
  const m = /^\s*\/compress(?:[-\s]+(\S+))?\s*$/.exec(prompt);
  if (!m) return undefined;
  const arg = (m[1] || '').toLowerCase();
  if (!arg) return 'default';
  return LEVELS.includes(arg) ? arg : 'default';
}

function reinforcement(mode) {
  const style =
    mode === 'lite'
      ? 'Compress (lite): drop filler and hedging, keep full sentences.'
      : mode === 'ultra'
        ? 'Compress (ultra): bare fragments. One word when one word is enough.'
        : 'Compress (full): drop articles, fragments OK, short synonyms.';
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext:
        style +
        ' No preamble, no narration, no decorative output. Keep code, commands, ' +
        'paths, identifiers, numbers, and exact error strings verbatim. Drop ' +
        'compression for security warnings and irreversible actions.',
    },
  });
}

function handle(payload) {
  if (!cfg || !payload || typeof payload.prompt !== 'string') return finish('');

  const dir = cfg.claudeDir();
  const sessionId = cfg.validateSessionId(payload.session_id);
  const prompt = payload.prompt;

  // 1. Slash command.
  const slash = parseSlash(prompt);
  if (slash !== undefined) {
    const mode = slash === 'default' ? cfg.getDefaultMode(payload.cwd || process.cwd()) : slash;
    cfg.writeSessionMode(dir, sessionId, mode);
    cfg.recordModeChange(dir, mode, sessionId);
    return finish('');
  }

  // 2. Natural language.
  if (DEACTIVATE_RE.test(prompt)) {
    cfg.writeSessionMode(dir, sessionId, 'off');
    cfg.recordModeChange(dir, 'off', sessionId);
    return finish('');
  }
  if (ACTIVATE_RE.test(prompt)) {
    const mode = cfg.getDefaultMode(payload.cwd || process.cwd());
    cfg.writeSessionMode(dir, sessionId, mode);
    cfg.recordModeChange(dir, mode, sessionId);
    return finish(reinforcement(mode));
  }

  // 3. Reinforcement while active.
  const active = cfg.resolveActiveMode(dir, sessionId);
  if (active) return finish(reinforcement(active));

  return finish('');
}

readPayload((payload) => handle(payload));
