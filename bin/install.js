#!/usr/bin/env node
'use strict';

// Single installer for every supported agent. PROVIDERS is the source of truth.
//
//   node bin/install.js                 install for detected agents
//   node bin/install.js --list          show agents + detection
//   node bin/install.js --only cursor   install one agent
//   node bin/install.js --with-init     also write per-repo rule files
//   node bin/install.js --uninstall     remove hooks + settings entries
//
// The repository slug for `npx skills add` is CONFIGURABLE. Set COMPRESS_REPO or
// edit REPO_SLUG_DEFAULT to match the GitHub account that owns your fork.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { readSettings, writeSettings, validateHookFields } = require('./lib/settings.js');

const REPO_SLUG_DEFAULT = 'YOUR_GITHUB_USER/compress-skill';
const REPO_SLUG = process.env.COMPRESS_REPO || REPO_SLUG_DEFAULT;
const MARKER = 'compress-';
const ROOT = path.resolve(__dirname, '..');
const HOOKS_SRC = path.join(ROOT, 'src', 'hooks');
const INIT_TOOL = path.join(ROOT, 'src', 'tools', 'compress-init.js');

function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function home(p) {
  return p.replace(/^~(?=$|[\\/])/, os.homedir());
}

function commandExists(cmd) {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const res = spawnSync(finder, [cmd], { stdio: 'ignore' });
  return res.status === 0;
}

// Each provider: id, label, mech, detect clauses, optional profile, optional soft.
const PROVIDERS = [
  {
    id: 'claude',
    label: 'Claude Code',
    mech: 'hooks + settings',
    profile: null,
    detect: [{ kind: 'dir', value: '~/.claude' }],
  },
  {
    id: 'codex',
    label: 'Codex',
    mech: 'plugin + hooks',
    profile: null,
    detect: [{ kind: 'dir', value: '~/.codex' }, { kind: 'command', value: 'codex' }],
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    mech: 'extension + GEMINI.md',
    profile: null,
    detect: [{ kind: 'dir', value: '~/.gemini' }, { kind: 'command', value: 'gemini' }],
  },
  {
    id: 'opencode',
    label: 'opencode',
    mech: 'native plugin',
    profile: null,
    detect: [{ kind: 'dir', value: '~/.config/opencode' }],
  },
  {
    id: 'cursor',
    label: 'Cursor',
    mech: 'skills profile',
    profile: 'cursor',
    detect: [{ kind: 'dir', value: '~/.cursor' }, { kind: 'command', value: 'cursor' }],
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    mech: 'skills profile',
    profile: 'windsurf',
    detect: [{ kind: 'dir', value: '~/.codeium/windsurf' }],
  },
  {
    id: 'cline',
    label: 'Cline',
    mech: 'skills profile',
    profile: 'cline',
    detect: [{ kind: 'dir', value: '~/.cline' }],
    soft: true,
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot',
    mech: 'skills profile',
    profile: 'github-copilot',
    detect: [{ kind: 'dir', value: '~/.config/github-copilot' }],
    soft: true,
  },
];

function detect(provider) {
  return provider.detect.some((clause) => {
    if (clause.kind === 'command') return commandExists(clause.value);
    if (clause.kind === 'dir') return fs.existsSync(home(clause.value));
    return false;
  });
}

function hookFiles() {
  const names = [
    'compress-config.js',
    'compress-activate.js',
    'compress-mode-tracker.js',
    'compress-statusline.sh',
    'compress-statusline.ps1',
    'package.json',
  ];
  return names.filter((n) => fs.existsSync(path.join(HOOKS_SRC, n)));
}

function stripCompressEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => {
      if (!entry || !Array.isArray(entry.hooks)) return entry;
      const kept = entry.hooks.filter(
        (h) => !(h && typeof h.command === 'string' && h.command.includes(MARKER))
      );
      return kept.length ? { ...entry, hooks: kept } : null;
    })
    .filter(Boolean);
}

function installClaude() {
  const dir = claudeDir();
  const hooksDir = path.join(dir, 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });

  for (const name of hookFiles()) {
    fs.copyFileSync(path.join(HOOKS_SRC, name), path.join(hooksDir, name));
  }
  fs.chmodSync(path.join(hooksDir, 'compress-statusline.sh'), 0o755);

  const node = process.execPath || 'node';
  const quote = (s) => `"${s}"`;
  const activate = path.join(hooksDir, 'compress-activate.js');
  const tracker = path.join(hooksDir, 'compress-mode-tracker.js');
  const statusline = path.join(hooksDir, 'compress-statusline.sh');

  const settingsPath = path.join(dir, 'settings.json');
  const settings = readSettings(settingsPath);
  settings.hooks = settings.hooks || {};

  settings.hooks.SessionStart = stripCompressEntries(settings.hooks.SessionStart);
  settings.hooks.UserPromptSubmit = stripCompressEntries(settings.hooks.UserPromptSubmit);

  settings.hooks.SessionStart.push({
    hooks: [{ type: 'command', command: `${quote(node)} ${quote(activate)}` }],
  });
  settings.hooks.UserPromptSubmit.push({
    hooks: [{ type: 'command', command: `${quote(node)} ${quote(tracker)}` }],
  });

  settings.statusLine = {
    type: 'command',
    command:
      process.platform === 'win32'
        ? `powershell -NoProfile -File "${path.join(hooksDir, 'compress-statusline.ps1')}"`
        : `bash ${quote(statusline)}`,
  };

  const check = validateHookFields(settings);
  if (!check.ok) {
    throw new Error('refusing to write invalid settings.json: ' + check.errors.join('; '));
  }

  writeSettings(settingsPath, settings);
  process.stdout.write(`  Claude Code: hooks -> ${hooksDir}, settings -> ${settingsPath}\n`);
}

function uninstallClaude() {
  const dir = claudeDir();
  const hooksDir = path.join(dir, 'hooks');
  for (const name of hookFiles()) {
    try {
      fs.unlinkSync(path.join(hooksDir, name));
    } catch {
      /* ignore */
    }
  }

  const settingsPath = path.join(dir, 'settings.json');
  const settings = readSettings(settingsPath);
  if (settings.hooks) {
    for (const event of ['SessionStart', 'UserPromptSubmit']) {
      if (settings.hooks[event]) {
        settings.hooks[event] = stripCompressEntries(settings.hooks[event]);
        if (!settings.hooks[event].length) delete settings.hooks[event];
      }
    }
    if (!Object.keys(settings.hooks).length) delete settings.hooks;
  }
  if (settings.statusLine && JSON.stringify(settings.statusLine).includes(MARKER)) {
    delete settings.statusLine;
  }
  const check = validateHookFields(settings);
  if (check.ok) writeSettings(settingsPath, settings);
  process.stdout.write('  Claude Code: hooks and settings entries removed\n');
}

function runSkillsAdd(provider) {
  if (!provider.profile) return;
  process.stdout.write(`  ${provider.label}: npx skills add ${REPO_SLUG} -a ${provider.profile}\n`);
  const res = spawnSync(
    'npx',
    ['-y', 'skills', 'add', REPO_SLUG, '-a', provider.profile],
    { stdio: 'inherit', shell: process.platform === 'win32' }
  );
  if (res.status !== 0) {
    process.stdout.write(
      `  ${provider.label}: skills CLI failed (exit ${res.status}). ` +
        'Check the profile slug and that the repo is public.\n'
    );
  }
}

function installProvider(provider, opts) {
  if (provider.id === 'claude') return installClaude(opts);
  if (provider.id === 'opencode') return installOpencode();
  runSkillsAdd(provider);
}

function installOpencode() {
  const dest = path.join(os.homedir(), '.config', 'opencode', 'plugins', 'compress');
  const skillSrc = path.join(ROOT, 'skills', 'compress');
  const skillDest = path.join(dest, 'skills', 'compress');
  fs.mkdirSync(skillDest, { recursive: true });
  for (const f of ['SKILL.md', 'README.md']) {
    const src = path.join(skillSrc, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(skillDest, f));
  }
  const agentsMd = path.join(ROOT, 'AGENTS.md');
  if (fs.existsSync(agentsMd)) {
    fs.copyFileSync(agentsMd, path.join(dest, 'AGENTS.md'));
  }
  process.stdout.write(`  opencode: plugin payload -> ${dest}\n`);
}

function runInit() {
  if (!fs.existsSync(INIT_TOOL)) return;
  const res = spawnSync(process.execPath || 'node', [INIT_TOOL], {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
  if (res.status !== 0) process.stdout.write('  with-init: rule files not written\n');
}

function list() {
  process.stdout.write('Supported agents:\n');
  for (const p of PROVIDERS) {
    const hit = detect(p) ? 'detected' : '-';
    const soft = p.soft ? ' (soft)' : '';
    process.stdout.write(`  ${p.id.padEnd(10)} ${p.label.padEnd(16)} ${p.mech.padEnd(20)} ${hit}${soft}\n`);
  }
}

function parseArgs(argv) {
  const opts = { only: null, uninstall: false, list: false, withInit: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') opts.list = true;
    else if (a === '--uninstall') opts.uninstall = true;
    else if (a === '--with-init') opts.withInit = true;
    else if (a === '--only') opts.only = argv[++i];
    else if (a === '--help' || a === '-h') opts.help = true;
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    process.stdout.write(
      'compress installer\n' +
        '  --list             show agents + detection\n' +
        '  --only <id>        install one agent\n' +
        '  --with-init        also write per-repo rule files\n' +
        '  --uninstall        remove hooks + settings entries\n'
    );
    return;
  }

  if (opts.list) return list();

  if (opts.uninstall) {
    process.stdout.write('Uninstalling compress...\n');
    uninstallClaude();
    return;
  }

  process.stdout.write('Installing compress...\n');
  const targets = opts.only
    ? PROVIDERS.filter((p) => p.id === opts.only)
    : PROVIDERS.filter((p) => detect(p));

  if (opts.only && !targets.length) {
    process.stderr.write(`Unknown agent: ${opts.only}. Run --list.\n`);
    process.exitCode = 1;
    return;
  }

  if (!targets.length) {
    process.stdout.write('No supported agents detected. Run --list, or --only <id>.\n');
    return;
  }

  for (const p of targets) {
    try {
      installProvider(p, opts);
    } catch (err) {
      process.stderr.write(`  ${p.label}: ${err.message}\n`);
    }
  }

  if (opts.withInit && !targets.some((p) => p.id === 'claude')) runInit();
  process.stdout.write('Done.\n');
}

if (require.main === module) main();

module.exports = { PROVIDERS, detect, parseArgs, stripCompressEntries };
