// Tests that one run reports every failure (T19.8): make keeps going after a failed target (`MAKEFLAGS += -k` in the
// Makefile, and `make -k` in scripts/full-run.mjs), every target of the full suite and of its prerequisites runs at
// most one command, so that a failed command does not hide the commands after it, and the check scripts that check
// each language run every language to its end and name every language that failed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { checkLanguages } from '../../scripts/language-checks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MAKEFILE = readFileSync(path.join(ROOT, 'Makefile'), 'utf8');

// The rules of the Makefile: each target with its prerequisites and its recipe lines.
function rules() {
  const result = new Map();
  let current = null;
  for (const line of MAKEFILE.split('\n')) {
    const rule = /^([a-z][\w-]*(?: [a-z][\w-]*)*):(?!=)\s*([^#]*)/.exec(line);
    if (rule && !line.startsWith('\t')) {
      current = { prerequisites: rule[2].trim().split(/\s+/).filter(Boolean), recipe: [] };
      for (const name of rule[1].split(' ')) result.set(name, current);
    } else if (line.startsWith('\t') && current) {
      current.recipe.push(line.trim());
    } else if (line.trim() && !line.startsWith('#') && !line.startsWith('\t')) {
      current = null;
    }
  }
  return result;
}

test('every target of the full suite and of its prerequisites runs at most one command', () => {
  const all = rules();
  const targets = MAKEFILE.match(/^CHECK_TARGETS := (.*)$/m)[1].split(/\s+/).filter(Boolean);
  const seen = new Set();
  const visit = (name) => {
    if (seen.has(name) || !all.has(name)) return;
    seen.add(name);
    for (const prerequisite of all.get(name).prerequisites) visit(prerequisite);
  };
  for (const target of targets) visit(target);
  const several = [...seen].filter(name => all.get(name).recipe.length > 1).map(name => `${name}: ${all.get(name).recipe.length} commands`);
  assert.deepEqual(several, [], 'targets whose later commands do not run after a failed command');
});

test('make keeps going after a failed target, and the full run starts make with -k', (t) => {
  assert.match(MAKEFILE, /^MAKEFLAGS \+= -k$/m);
  // A second makefile with two failing targets: both run. It is a file of the run, not the device path of standard
  // input, which Linux cannot open when it is the socket of `input` (T19.8-1).
  const directory = mkdtempSync(path.join(tmpdir(), 'template-accumulation-probe-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const probe = path.join(directory, 'probe.mk');
  writeFileSync(probe, 'accumulation-probe: accumulation-a accumulation-b\naccumulation-a:\n\t@echo a; false\naccumulation-b:\n\t@echo b; false\n');
  const run = spawnSync('make', ['--no-print-directory', '-f', 'Makefile', '-f', probe, 'accumulation-probe'], { cwd: ROOT, encoding: 'utf8' });
  assert.deepEqual(run.stdout.split('\n').filter(Boolean), ['a', 'b'], `make did not run the probe targets of ${probe}; stderr: ${run.stderr}`);
  assert.notEqual(run.status, 0);
  // The full run and make ci-targets run each target through runLogged of scripts/target-report.mjs (T20.1-9).
  assert.match(readFileSync(path.join(ROOT, 'scripts/target-report.mjs'), 'utf8'), /spawn\('make', \['-k', target\]/);
  assert.match(readFileSync(path.join(ROOT, 'scripts/full-run.mjs'), 'utf8'), /runTarget = name => runLogged\(root, name, /);
  assert.match(readFileSync(path.join(ROOT, 'scripts/ci-targets.mjs'), 'utf8'), /await runLogged\(root, name, report\)/);
});

test('checkLanguages runs every language and names each language that failed', () => {
  const ran = [];
  assert.throws(() => checkLanguages('probe', {
    TypeScript: () => { ran.push('TypeScript'); throw new Error('first'); },
    Go: () => { ran.push('Go'); },
    Rust: () => { ran.push('Rust'); throw new Error('third'); },
  }), /^Error: probe: 2 of 3 languages failed: TypeScript, Rust$/);
  assert.deepEqual(ran, ['TypeScript', 'Go', 'Rust']);
});

test('the check scripts of the languages run each language through checkLanguages', () => {
  for (const file of ['check-generated-native-calls', 'check-generated-typed-values', 'check-generated-arguments', 'check-generated-bound-data', 'check-typed-generator', 'check-package-installs']) {
    const text = readFileSync(path.join(ROOT, 'scripts', `${file}.mjs`), 'utf8');
    assert.match(text, /checkLanguages\('[^']+', \{/, `scripts/${file}.mjs stops at the first language that fails`);
  }
});
