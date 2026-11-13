// binding CK-20: a Cargo workspace that builds packages/rust builds it against the git dependencies that the root
// Cargo.lock pins, because the core uses the API of that binding-core commit (such as the macro fault::point!) and of
// that polyspec-json commit. The test reads every tracked Cargo.lock and requires each git package that the root lock
// pins to have the same source in it, so `make lint-rust` on examples/showcase/adapters/rust compiles the same core.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// The source of each package of a lock whose source is a git repository, by the package name.
function gitSources(file: string): Map<string, string> {
  const sources = new Map<string, string>();
  for (const block of readFileSync(path.join(ROOT, file), 'utf8').split('[[package]]')) {
    const name = /^name = "([^"]+)"$/mu.exec(block)?.[1];
    const source = /^source = "(git\+[^"]+)"$/mu.exec(block)?.[1];
    if (name !== undefined && source !== undefined) sources.set(name, source);
  }
  return sources;
}

test('every tracked Cargo.lock pins the git packages of the root lock at the same commit', () => {
  const root = gitSources('Cargo.lock');
  assert.ok(root.size > 0, 'Cargo.lock pins no git package');
  const locks = execFileSync('git', ['ls-files', '*Cargo.lock'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((file) => file !== '' && file !== 'Cargo.lock');
  assert.ok(locks.length > 0, 'no tracked Cargo.lock besides the root one');
  const findings: string[] = [];
  for (const lock of locks) {
    for (const [name, source] of gitSources(lock)) {
      const pinned = root.get(name);
      if (pinned !== undefined && pinned !== source) findings.push(`${lock} pins ${name} at ${source}, the root lock at ${pinned}`);
    }
  }
  assert.deepEqual(findings, []);
});
