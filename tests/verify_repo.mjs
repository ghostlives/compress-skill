#!/usr/bin/env node
// Repo invariants + hook smoke tests. Run: node tests/verify_repo.mjs

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NODE = process.execPath;

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log('ok   ' + name);
  } catch (err) {
    failures++;
    console.log('FAIL ' + name + ': ' + err.message);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// ---- Static invariants ----

check('skills/compress/SKILL.md has frontmatter name=compress', () => {
  const src = read('skills/compress/SKILL.md');
  assert(/^---\n/.test(src), 'missing frontmatter');
  assert(/^name:\s*compress\s*$/m.test(src), 'name is not "compress"');
  assert(/^description:/m.test(src), 'missing description');
});

check('plugin mirror matches skills/compress', () => {
  for (const f of ['SKILL.md', 'README.md']) {
    const a = read(path.join('skills', 'compress', f));
    const b = read(path.join('plugins', 'compress', 'skills', 'compress', f));
    assert(a === b, f + ' differs from mirror');
  }
});

check('AGENTS.md and GEMINI.md carry the marker-fenced ruleset', () => {
  for (const f of ['AGENTS.md', 'GEMINI.md']) {
    const src = read(f);
    assert(src.includes('<!-- compress-begin -->'), f + ' missing begin marker');
    assert(src.includes('<!-- compress-end -->'), f + ' missing end marker');
  }
});

check('required files exist', () => {
  const required = [
    'README.md',
    'INSTALL.md',
    'LICENSE',
    'package.json',
    'src/rules/compress-activate.md',
    'src/tools/compress-init.js',
    'bin/install.js',
    'bin/lib/settings.js',
    'install.sh',
    'install.ps1',
    'commands/compress.toml',
    '.claude-plugin/plugin.json',
    '.claude-plugin/marketplace.json',
  ];
  for (const f of required) {
    assert(fs.existsSync(path.join(ROOT, f)), 'missing ' + f);
  }
});

check('JSON artifacts parse', () => {
  for (const f of ['package.json', '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json']) {
    JSON.parse(read(f));
  }
});

check('plugin.json has no explicit "agents" key', () => {
  const pj = JSON.parse(read('.claude-plugin/plugin.json'));
  assert(!('agents' in pj), 'plugin.json must not list agents');
});

check('hook scripts pass node --check', () => {
  const hooks = fs.readdirSync(path.join(ROOT, 'src', 'hooks')).filter((f) => f.endsWith('.js'));
  for (const h of hooks) {
    const res = spawnSync(NODE, ['--check', path.join(ROOT, 'src', 'hooks', h)], {
      encoding: 'utf8',
    });
    assert(res.status === 0, h + ': ' + res.stderr);
  }
});

// ---- Hook smoke tests ----

function makeCfgDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'compress-test-'));
}

function runHook(script, payload, cfgDir) {
  const res = spawnSync(NODE, [path.join(ROOT, 'src', 'hooks', script)], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: cfgDir, COMPRESS_DEFAULT_MODE: '' },
    timeout: 8000,
  });
  return res;
}

function sessionMode(cfgDir, id) {
  const f = path.join(cfgDir, '.compress-sessions', id + '.mode');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : null;
}

check('SessionStart (startup) emits ruleset and stores mode', () => {
  const dir = makeCfgDir();
  const res = runHook('compress-activate.js', { session_id: 's1', source: 'startup' }, dir);
  assert(res.status === 0, 'exit ' + res.status + ' ' + res.stderr);
  assert(res.stdout.includes('compress'), 'no ruleset on stdout');
  assert(sessionMode(dir, 's1') === 'full', 'mode not stored as full');
});

check('slash /compress ultra sets session mode', () => {
  const dir = makeCfgDir();
  runHook('compress-mode-tracker.js', { session_id: 's2', prompt: '/compress ultra' }, dir);
  assert(sessionMode(dir, 's2') === 'ultra', 'mode not ultra');
});

check('natural language "stop compress" turns mode off', () => {
  const dir = makeCfgDir();
  runHook('compress-mode-tracker.js', { session_id: 's3', prompt: '/compress' }, dir);
  assert(sessionMode(dir, 's3') === 'full', 'setup failed');
  runHook('compress-mode-tracker.js', { session_id: 's3', prompt: 'stop compress' }, dir);
  assert(sessionMode(dir, 's3') === 'off', 'mode not off');
});

check('SessionStart (compact) preserves a stored off', () => {
  const dir = makeCfgDir();
  runHook('compress-mode-tracker.js', { session_id: 's4', prompt: 'stop compress' }, dir);
  const res = runHook('compress-activate.js', { session_id: 's4', source: 'compact' }, dir);
  assert(!res.stdout.includes('Cut tokens'), 'ruleset emitted despite off');
  assert(sessionMode(dir, 's4') === 'off', 'off not preserved across compact');
});

check('UserPromptSubmit reinforces while active', () => {
  const dir = makeCfgDir();
  runHook('compress-mode-tracker.js', { session_id: 's5', prompt: '/compress' }, dir);
  const res = runHook('compress-mode-tracker.js', { session_id: 's5', prompt: 'explain pooling' }, dir);
  assert(res.stdout.includes('hookSpecificOutput'), 'no reinforcement emitted');
});

check('hooks do not block on stdin that never closes', () => {
  const dir = makeCfgDir();
  const started = Date.now();
  const res = spawnSync(NODE, [path.join(ROOT, 'src', 'hooks', 'compress-activate.js')], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: dir, COMPRESS_DEFAULT_MODE: 'lite' },
    timeout: 6000,
  });
  const elapsed = Date.now() - started;
  assert(res.status === 0, 'exit ' + res.status);
  assert(elapsed < 5000, 'took ' + elapsed + 'ms (watchdog should fire)');
});

console.log('');
if (failures) {
  console.log(failures + ' check(s) failed');
  process.exit(1);
}
console.log('all checks passed');
