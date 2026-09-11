'use strict';

// Shared state + config module for the compress hooks.
//
// Every function accepts a sessionId that may be null or malformed and degrades to
// machine-wide behavior (the legacy flag file), so an older caller still works.
// Silent-fail on every filesystem error: a hook must never block session start.

const fs = require('fs');
const os = require('os');
const path = require('path');

const VALID_MODES = ['lite', 'full', 'ultra', 'off'];
const DEFAULT_MODE = 'full';
const SESSIONS_DIRNAME = '.compress-sessions';
const ACTIVE_FLAG_NAME = '.compress-active';
const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const REPO_CONFIG_REL = path.join('.compress', 'config.json');
const REPO_CONFIG_ALT = '.compress.json';
const MAX_ANCESTORS = 64;

function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function sessionsDir(dir) {
  return path.join(dir || claudeDir(), SESSIONS_DIRNAME);
}

function legacyFlagPath(dir) {
  return path.join(dir || claudeDir(), ACTIVE_FLAG_NAME);
}

// A session id becomes part of a filesystem path, so nothing may interpolate one
// without passing it through here first.
function validateSessionId(id) {
  if (typeof id !== 'string') return null;
  return SESSION_ID_RE.test(id) ? id : null;
}

function sessionFile(dir, sessionId) {
  const id = validateSessionId(sessionId);
  if (!id) return null;
  return path.join(sessionsDir(dir), id + '.mode');
}

function isSymlink(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function normalizeMode(value) {
  if (typeof value !== 'string') return null;
  const m = value.trim().toLowerCase();
  return VALID_MODES.includes(m) ? m : null;
}

function readConfigMode(filePath) {
  try {
    if (isSymlink(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeMode(parsed && parsed.defaultMode);
  } catch {
    return null;
  }
}

function findRepoConfigPath(start) {
  let dir = path.resolve(start || process.cwd());
  for (let i = 0; i < MAX_ANCESTORS; i++) {
    for (const rel of [REPO_CONFIG_REL, REPO_CONFIG_ALT]) {
      const candidate = path.join(dir, rel);
      try {
        if (fs.existsSync(candidate) && !isSymlink(candidate)) return candidate;
      } catch {
        /* ignore */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function userConfigPaths() {
  const paths = [];
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) paths.push(path.join(xdg, 'compress', 'config.json'));
  paths.push(path.join(os.homedir(), '.config', 'compress', 'config.json'));
  if (process.platform === 'win32' && process.env.APPDATA) {
    paths.push(path.join(process.env.APPDATA, 'compress', 'config.json'));
  }
  return paths;
}

function getDefaultMode(start) {
  const env = normalizeMode(process.env.COMPRESS_DEFAULT_MODE);
  if (env) return env;

  const repo = findRepoConfigPath(start);
  if (repo) {
    const m = readConfigMode(repo);
    if (m) return m;
  }
  for (const p of userConfigPaths()) {
    const m = readConfigMode(p);
    if (m) return m;
  }
  return DEFAULT_MODE;
}

// Symlink-safe flag write. Refuses if the target or its immediate parent is a
// symlink, opens with O_NOFOLLOW where supported, writes atomically via temp+rename.
function safeWriteFlag(flagPath, content) {
  try {
    const dir = path.dirname(flagPath);
    if (isSymlink(flagPath) || isSymlink(dir)) return false;
    fs.mkdirSync(dir, { recursive: true });

    const tmp = flagPath + '.' + process.pid + '.' + Date.now() + '.tmp';
    let flags = 'w';
    if (fs.constants && fs.constants.O_NOFOLLOW) flags |= fs.constants.O_NOFOLLOW;
    const fd = fs.openSync(tmp, flags, 0o600);
    try {
      fs.writeSync(fd, String(content));
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, flagPath);
    return true;
  } catch {
    return false;
  }
}

function readFlag(flagPath) {
  try {
    if (isSymlink(flagPath)) return null;
    return fs.readFileSync(flagPath, 'utf8').trim();
  } catch {
    return null;
  }
}

// Literal stored value for THIS session, no legacy fallback.
function readSessionModeRaw(dir, sessionId) {
  const file = sessionFile(dir, sessionId);
  if (!file) return null;
  return readFlag(file);
}

// What mode is in effect: session file -> legacy mirror.
// A missing file and a literal "off" both collapse to null.
function resolveActiveMode(dir, sessionId) {
  const raw = readSessionModeRaw(dir, sessionId);
  if (raw != null) {
    const mode = normalizeMode(raw);
    return mode === 'off' ? null : mode;
  }
  const legacy = normalizeMode(readFlag(legacyFlagPath(dir)));
  return legacy === 'off' ? null : legacy;
}

function ensureSessionsDir(dir) {
  try {
    fs.mkdirSync(sessionsDir(dir), { recursive: true, mode: 0o700 });
    return true;
  } catch {
    return false;
  }
}

// The single writer. Writes "off" literally to the session file and unlinks the
// legacy mirror (which must never hold the literal "off").
function writeSessionMode(dir, sessionId, modeOrNull) {
  const d = dir || claudeDir();
  const normalized = modeOrNull == null ? 'off' : normalizeMode(modeOrNull);
  if (!normalized) return false;

  const file = sessionFile(d, sessionId);
  if (file) {
    if (!ensureSessionsDir(d)) return false;
    safeWriteFlag(file, normalized);
  } else {
    // No usable session id: fall back to the machine-wide mirror.
    safeWriteFlag(legacyFlagPath(d), normalized === 'off' ? '' : normalized);
    if (normalized === 'off') {
      try {
        fs.unlinkSync(legacyFlagPath(d));
      } catch {
        /* ignore */
      }
    }
    return true;
  }

  if (normalized === 'off') {
    try {
      fs.unlinkSync(legacyFlagPath(d));
    } catch {
      /* ignore */
    }
  }
  return true;
}

function logPath(dir) {
  return path.join(dir || claudeDir(), '.compress-mode.log');
}

function recordModeChange(dir, newMode, sessionId) {
  try {
    const d = dir || claudeDir();
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      mode: newMode,
      ...(sessionId ? { session: sessionId } : {}),
    });
    fs.appendFileSync(logPath(d), line + '\n');
  } catch {
    /* ignore */
  }
}

// mtime sweep of the session store. Called on new sessions only.
function gcSessionStore(dir, opts) {
  const options = opts || {};
  const ttl = Number(process.env.COMPRESS_SESSION_TTL_MS) || 14 * 24 * 60 * 60 * 1000;
  const maxDeletes = Number.isFinite(options.maxDeletes) ? options.maxDeletes : 50;
  const now = Date.now();
  let deleted = 0;
  try {
    const d = sessionsDir(dir);
    if (isSymlink(d)) return 0;
    for (const name of fs.readdirSync(d)) {
      if (deleted >= maxDeletes) break;
      const full = path.join(d, name);
      if (isSymlink(full)) continue;
      try {
        const st = fs.statSync(full);
        if (now - st.mtimeMs > ttl) {
          fs.unlinkSync(full);
          deleted++;
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return deleted;
}

module.exports = {
  VALID_MODES,
  DEFAULT_MODE,
  SESSIONS_DIRNAME,
  ACTIVE_FLAG_NAME,
  SESSION_ID_RE,
  claudeDir,
  sessionsDir,
  legacyFlagPath,
  validateSessionId,
  sessionFile,
  getDefaultMode,
  findRepoConfigPath,
  safeWriteFlag,
  readFlag,
  readSessionModeRaw,
  resolveActiveMode,
  writeSessionMode,
  recordModeChange,
  gcSessionStore,
};
