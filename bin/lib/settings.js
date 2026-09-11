'use strict';

// JSONC-tolerant settings.json reader/writer plus a defensive hook validator.
//
// Claude Code discards the entire settings.json on schema mismatch, so a single
// malformed hook entry must never be written.

const fs = require('fs');
const path = require('path');

// Strip // and /* */ comments and trailing commas, respecting string literals.
function stripJsonc(text) {
  let out = '';
  let inString = false;
  let escaped = false;
  let inLine = false;
  let inBlock = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inLine) {
      if (ch === '\n') {
        inLine = false;
        out += ch;
      }
      continue;
    }
    if (inBlock) {
      if (ch === '*' && next === '/') {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === '/' && next === '/') {
      inLine = true;
      i++;
    } else if (ch === '/' && next === '*') {
      inBlock = true;
      i++;
    } else {
      out += ch;
    }
  }

  // Remove trailing commas before } or ].
  return out.replace(/,(\s*[}\]])/g, '$1');
}

function readSettings(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return {};
    const parsed = JSON.parse(stripJsonc(raw));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeSettings(filePath, settings) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 });
}

// Returns { ok, errors }. A hook entry is valid when it has a command string and
// a matcher (or no matcher for hooks that don't take one).
function validateHookFields(settings) {
  const errors = [];
  const hooks = settings && settings.hooks;
  if (hooks == null) return { ok: true, errors };

  if (typeof hooks !== 'object' || Array.isArray(hooks)) {
    return { ok: false, errors: ['hooks must be an object'] };
  }

  for (const [event, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries)) {
      errors.push(`hooks.${event} must be an array`);
      continue;
    }
    entries.forEach((entry, i) => {
      const where = `hooks.${event}[${i}]`;
      if (!entry || typeof entry !== 'object') {
        errors.push(`${where} must be an object`);
        return;
      }
      const list = Array.isArray(entry.hooks) ? entry.hooks : null;
      if (!list) {
        errors.push(`${where}.hooks must be an array`);
        return;
      }
      list.forEach((h, j) => {
        const at = `${where}.hooks[${j}]`;
        if (!h || typeof h !== 'object') {
          errors.push(`${at} must be an object`);
          return;
        }
        if (typeof h.type !== 'string' || !h.type) errors.push(`${at}.type missing`);
        if (typeof h.command !== 'string' || !h.command) errors.push(`${at}.command missing`);
      });
    });
  }

  return { ok: errors.length === 0, errors };
}

module.exports = { stripJsonc, readSettings, writeSettings, validateHookFields };
