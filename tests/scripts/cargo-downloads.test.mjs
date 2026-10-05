// Tests that every target that runs cargo checks the crates of every Cargo.lock first (T20.1-5): the recipes run cargo
// offline, and cargo answers a missing crate with "retry without --offline"; `cargo-downloads-check`
// (scripts/check-cargo-downloads.mjs) names the lock and `run make install` instead, and a target whose prerequisite
// failed does not run under make -k, so the run shows that message and not cargo's.
// A target runs cargo when a recipe line runs `$(CARGO)` with a command that resolves crates or starts a file that
// starts cargo, directly or through the files that it imports or names.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SELF = 'tests/scripts/cargo-downloads.test.mjs';
const MAKEFILE = readFileSync(path.join(ROOT, 'Makefile'), 'utf8');
const CHECK = 'cargo-downloads-check';

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

const SOURCES = spawnSync('git', ['ls-files', 'scripts/*.mjs', 'tests/runner/*.mjs', 'tests/scripts/*.mjs', 'tools/**/*.mjs', 'packages/*/tests/**/*.mjs'], { cwd: ROOT, encoding: 'utf8' })
  .stdout.split('\n').filter(file => file && file !== SELF);
// A line that starts cargo with a command that resolves the crates of a lock; `--version` and `fmt` read none.
const STARTS_CARGO = /(?:\.cargo\/bin\/cargo|\bCARGO\b|\bcargo\b)[^\n]*'(?:build|test|run|check|clippy|rustc|package|metadata|--test)'/;
// scripts/run-tests.mjs runs every tool of the tests and cargo only as `run-tests.mjs cargo`, which a recipe names.
const RUNNER = 'scripts/run-tests.mjs';

// The top-level declarations of a module that start cargo: a declaration with a cargo line, and one that names such a
// declaration, until nothing is added; `*` when a cargo line, or a use of such a declaration, is outside every
// declaration, as in a script.
function cargoNames(text) {
  // Comments start nothing.
  const lines = text.split('\n').map(line => (/^\s*(?:\/\/|\/?\*)/.test(line) ? '' : line));
  const starts = [];
  lines.forEach((line, index) => {
    const declaration = /^(?:export )?(?:async )?(?:function\*? |const |let |class )(\w+)/.exec(line);
    if (declaration) starts.push({ name: declaration[1], index });
  });
  const spans = starts.map((start, i) => ({ name: start.name, text: lines.slice(start.index, starts[i + 1]?.index ?? lines.length).join('\n') }));
  // The top-level statements of a script: from a line at column 0 that neither declares, imports nor closes a
  // declaration, up to the next declaration.
  // Lines inside a template literal are text, not statements.
  const outside = [];
  let statement = false;
  let template = false;
  for (const line of lines) {
    if (!template) {
      if (/^(?:export |import |(?:async )?function|const |let |class )/.test(line)) statement = false;
      else if (/^[^\s})\]]/.test(line)) statement = true;
    }
    if (statement) outside.push(line);
    if ((line.match(/(?<!\\)`/g) ?? []).length % 2 === 1) template = !template;
  }
  if (outside.some(line => STARTS_CARGO.test(line))) return new Set(['*']);
  const names = new Set(spans.filter(span => STARTS_CARGO.test(span.text)).map(span => span.name));
  for (let added = true; added;) {
    added = false;
    for (const span of spans) {
      if (!names.has(span.name) && [...names].some(name => new RegExp(`\\b${name}\\b`).test(span.text.slice(span.name.length)))) {
        names.add(span.name);
        added = true;
      }
    }
  }
  // A script runs its declarations from its top-level code.
  const top = outside.join('\n');
  if ([...names].some(name => new RegExp(`\\b${name}\\b`).test(top))) return new Set(['*']);
  return names;
}

// The files that start cargo: a file with a cargo line outside its declarations, a file that imports a declaration
// that starts cargo, and a file that names a file that starts cargo, as a script that it runs; until nothing is added.
function cargoFiles() {
  const texts = new Map(SOURCES.map(file => [file, readFileSync(path.join(ROOT, file), 'utf8')]));
  const names = new Map();
  for (const [file, text] of texts) if (file !== RUNNER) names.set(file, cargoNames(text));
  const found = new Set([...names].filter(([, set]) => set.has('*')).map(([file]) => file));
  for (let added = true; added;) {
    added = false;
    for (const [file, text] of texts) {
      if (found.has(file) || file === RUNNER) continue;
      const imports = [...text.matchAll(/import \{([^}]*)\} from '([^']+)'/g)].some(([, clause, specifier]) => {
        const target = path.normalize(path.join(path.dirname(file), specifier));
        const starting = names.get(target);
        return starting && (starting.has('*') || clause.split(',').map(name => name.trim().split(/\s+as\s+/)[0]).some(name => starting.has(name)));
      });
      const runs = [...found].some(target => text.includes(`'${target}'`) || text.includes(`/${target}'`) || text.includes(`'${path.basename(target)}'`) && path.dirname(target) === path.dirname(file));
      if (imports || runs) {
        found.add(file);
        names.set(file, new Set(['*']));
        added = true;
      }
    }
  }
  return found;
}

// The files and directories that a recipe line names, relative to the root or to the directory of its `cd`.
function named(line) {
  const base = /^cd (\S+) &&/.exec(line)?.[1].replace('$(CURDIR)/', '') ?? '.';
  const paths = [];
  for (const token of line.split(/\s+/)) {
    const clean = token.replace(/^\$\(CURDIR\)\//, '');
    for (const candidate of [clean, path.join(base, clean)]) {
      if (/^[\w./-]+$/.test(candidate) && existsSync(path.join(ROOT, candidate))) paths.push(path.normalize(candidate));
    }
  }
  return paths;
}

test('every target that runs cargo depends on cargo-downloads-check', () => {
  const all = rules();
  assert.ok(all.has(CHECK), `the Makefile has no target ${CHECK}`);
  assert.deepEqual(all.get(CHECK).recipe, ['node scripts/check-cargo-downloads.mjs']);
  const files = cargoFiles();
  assert.ok(files.size > 0, 'no file starts cargo');
  const depends = (name, seen = new Set()) => {
    if (seen.has(name) || !all.has(name)) return false;
    seen.add(name);
    return all.get(name).prerequisites.some(prerequisite => prerequisite === CHECK || depends(prerequisite, seen));
  };
  const missing = [];
  for (const [name, rule] of all) {
    if (['install', 'install-tools', 'dependency-review', CHECK].includes(name)) continue;
    const runs = rule.recipe.filter(line => !line.startsWith('@echo')).some(line => {
      if (/\$\(CARGO\) (?!fmt\b)/.test(line) || /run-tests\.mjs cargo\b/.test(line)) return true;
      return named(line).some(entry => statSync(path.join(ROOT, entry)).isDirectory()
        ? [...files].some(file => file.startsWith(`${entry.replace(/\/$/, '')}/`))
        : files.has(entry));
    });
    if (runs && !depends(name)) missing.push(name);
  }
  assert.deepEqual([...new Set(missing)].sort(), [], `targets that run cargo without ${CHECK}; a missing crate fails them with "retry without --offline"`);
});

test('cargo-downloads-check names the lock and run make install for a missing crate', (t) => {
  const home = mkdtempSync(path.join(tmpdir(), 'template-cargo-home-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const locks = spawnSync('git', ['ls-files', '*Cargo.lock'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  const run = spawnSync(process.execPath, ['scripts/check-cargo-downloads.mjs'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, CARGO_HOME: home, CARGO_NET_OFFLINE: 'true' } });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  const lines = run.stderr.trimEnd().split('\n');
  assert.equal(lines[0], `the crates of ${locks.length} of ${locks.length} Cargo.lock files are not in the registry of CARGO_HOME:`);
  assert.deepEqual(lines.slice(1, -1).map(line => line.split(': ')[0]), locks, run.stderr);
  assert.equal(lines.at(-1), 'run make install, which downloads them');
  assert.doesNotMatch(run.stderr, /without `--offline`/, 'the message repeats the help of cargo to leave offline mode');
});
