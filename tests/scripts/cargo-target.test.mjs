// Tests that the Makefile builds the Rust crates of this checkout into their own target (T18.7): a `CARGO_TARGET_DIR`
// inherited from the environment, such as the target of another checkout, does not reach cargo. The cargo of each
// recipe is a stub that prints the `CARGO_TARGET_DIR` it receives and stops the recipe; no Rust code is built.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

for (const target of ['build-rust', 'test-rust']) {
  test(`make ${target} does not pass an inherited CARGO_TARGET_DIR to cargo`, (t) => {
    const directory = mkdtempSync(path.join(tmpdir(), 'template-cargo-target-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const cargo = path.join(directory, 'cargo');
    // `fetch` is the check of the downloads (cargo-downloads-check), which every target that runs cargo runs first.
    writeFileSync(cargo, '#!/bin/sh\n[ "$1" = fetch ] && exit 0\necho "cargo received CARGO_TARGET_DIR=${CARGO_TARGET_DIR-unset}"\nexit 3\n');
    chmodSync(cargo, 0o755);
    const run = spawnSync('make', ['--no-print-directory', target, `CARGO=${cargo}`], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env, CARGO_TARGET_DIR: path.join(directory, 'other-checkout-target') },
    });
    assert.notEqual(run.status, 0, 'the stub stops the recipe');
    assert.match(run.stdout, /^cargo received CARGO_TARGET_DIR=unset$/m, run.stdout + run.stderr);
  });
}
