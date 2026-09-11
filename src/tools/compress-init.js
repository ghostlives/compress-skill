#!/usr/bin/env node
'use strict';

// Writes per-repo always-on rule files for editors that read repo-local config.
// Usage: node src/tools/compress-init.js [--paths]
//
// Writes:
//   .cursor/rules/compress.mdc
//   .windsurf/rules/compress.md
//   .clinerules/compress.md
//   .github/copilot-instructions.md
//
// Idempotent. Never overwrites unrelated content in copilot-instructions.md — it
// replaces only the marker-fenced compress block.

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const RULE_SOURCE = path.join(__dirname, '..', 'rules', 'compress-activate.md');
const BEGIN = '<!-- compress-begin -->';
const END = '<!-- compress-end -->';

function readRuleBody() {
  try {
    return fs.readFileSync(RULE_SOURCE, 'utf8').trim();
  } catch {
    return 'Respond terse. Cut tokens, keep meaning. Drop filler, articles, and ' +
      'hedging; keep code, commands, paths, numbers, and exact errors verbatim.';
  }
}

const CURSOR_FRONTMATTER =
  '---\ndescription: Compressed output style\nalwaysApply: true\nglobs:\n---\n\n';

function writeFile(relPath, content) {
  const full = path.join(ROOT, relPath);
  try {
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, { mode: 0o644 });
    process.stdout.write('wrote ' + relPath + '\n');
  } catch (err) {
    process.stderr.write('failed ' + relPath + ': ' + err.message + '\n');
  }
}

function mergeCopilot(body) {
  const rel = path.join('.github', 'copilot-instructions.md');
  const full = path.join(ROOT, rel);
  let existing = '';
  try {
    existing = fs.readFileSync(full, 'utf8');
  } catch {
    existing = '';
  }
  const block = BEGIN + '\n' + body + '\n' + END + '\n';
  const re = new RegExp(BEGIN + '[\\s\\S]*?' + END + '\\n?');
  const next = re.test(existing) ? existing.replace(re, block) : existing + block;
  writeFile(rel, next);
}

function main() {
  if (process.argv.includes('--paths')) {
    process.stdout.write(
      ['.cursor/rules/compress.mdc', '.windsurf/rules/compress.md',
       '.clinerules/compress.md', '.github/copilot-instructions.md'].join('\n') + '\n'
    );
    return;
  }

  const body = readRuleBody();
  const plain = body + '\n';

  writeFile(path.join('.cursor', 'rules', 'compress.mdc'), CURSOR_FRONTMATTER + plain);
  writeFile(path.join('.windsurf', 'rules', 'compress.md'), plain);
  writeFile(path.join('.clinerules', 'compress.md'), plain);
  mergeCopilot(body);
}

main();
