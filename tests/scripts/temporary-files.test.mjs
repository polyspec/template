// Tests that the checks, runners and tests of the repository create their temporary files under the system temporary
// directory and never in the checkout (T20.1): the test files of one `node --test` run start them at once, and a file
// that one of them writes into the checkout is seen by another, such as the owner check of every tracked path, or
// compiled by a concurrent `cargo test`. No `mkdtemp` of a tracked script names a directory of the checkout, no script
// makes a directory for generated code in the checkout, and no script writes a generated Rust integration test into
// a crate of packages/.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCES = spawnSync('git', ['ls-files', '*.mjs', '*.js', '*.ts', '*.cjs'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);

// The first argument of a call that starts at `index` of `text`, up to its top-level comma or closing parenthesis.
function firstArgument(text, index) {
  let depth = 0;
  for (let end = index; end < text.length; end += 1) {
    const character = text[end];
    if (character === '(' || character === '[' || character === '{') depth += 1;
    else if (character === ')' || character === ']' || character === '}') {
      if (depth === 0) return text.slice(index, end).trim();
      depth -= 1;
    } else if (character === ',' && depth === 0) return text.slice(index, end).trim();
  }
  return text.slice(index).trim();
}

// A directory of the checkout: built from a path of the checkout, the current directory or a relative path.
const IN_CHECKOUT = /\b(?:root|ROOT|repoRoot|crate|goRoot|packages|__dirname)\b|process\.cwd\(\)|^['"`](?!\/)/;

// The one exception: the installer of the vendored tools of kit builds a tool beside its install prefix in var/tools, the
// cache of the checkout that no test reads, and renames it into place. The exception names the file and the exact
// argument, so any other call of that file fails. Removal condition: kit builds a tool in the system temporary
// directory.
const EXCEPTIONS = { 'scripts/kit/install-tool.mjs': ['`${prefix}.next-`'] };

test('no mkdtemp of a tracked script makes its directory in the checkout', () => {
  const inCheckout = [];
  for (const file of SOURCES) {
    const text = readFileSync(path.join(ROOT, file), 'utf8');
    for (const call of text.matchAll(/\bmkdtemp(?:Sync)?\(/g)) {
      const argument = firstArgument(text, call.index + call[0].length);
      if (EXCEPTIONS[file]?.includes(argument)) continue;
      if (IN_CHECKOUT.test(argument)) inCheckout.push(`${file}:${text.slice(0, call.index).split('\n').length}: mkdtemp(${argument})`);
    }
  }
  assert.deepEqual(inCheckout, [], `these temporary directories are in the checkout:\n${inCheckout.join('\n')}`);
});

test('no script writes a generated integration test into a crate of packages/', () => {
  const generated = [];
  for (const file of SOURCES) {
    readFileSync(path.join(ROOT, file), 'utf8').split('\n').forEach((line, index) => {
      if (/['"`](?:packages\/[\w-]+\/)?tests\/generated_\w*\.rs['"`]/.test(line)) generated.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(generated, [], `these scripts write a generated test into a crate:\n${generated.join('\n')}`);
});

test('no script makes a directory for generated code in the checkout', () => {
  const made = [];
  for (const file of SOURCES) {
    readFileSync(path.join(ROOT, file), 'utf8').split('\n').forEach((line, index) => {
      if (/join\(\s*(?:root|ROOT|repoRoot|crate|goRoot)\b[^)]*['"`]\.(?:generated|tmp)[-_]/.test(line)) made.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(made, [], `these scripts make a directory for generated code in the checkout:\n${made.join('\n')}`);
});
