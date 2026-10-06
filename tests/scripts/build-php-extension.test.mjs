// Tests scripts/build-php-extension.mjs (T21.1): the build reads the C sources, config.m4 and the stub of the package,
// its inputs hash changes with every source and with the PHP build, and an arginfo header that was not generated from
// the current stub fails the build with the fix, make ext-arginfo.
import assert from 'node:assert/strict';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { checkArginfo, inputsHash, sourceFiles, stubFiles, stubHash } from '../../scripts/build-php-extension.mjs';
import { temporaryDirectory } from '../../scripts/temporary-workspace.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = path.join(ROOT, 'packages/template-php-ext/src');
const IDENTITY = { version: '8.5.0', vernum: '80500', 'include-dir': '/php/include', 'extension-dir': '/php/ext', 'configure-options': '' };

function copySource(t) {
  const directory = temporaryDirectory('php-ext-source');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  cpSync(SOURCE, directory, { recursive: true });
  return directory;
}

test('the committed arginfo header is generated from the committed stub', { timeout: 10_000 }, () => {
  checkArginfo(SOURCE);
  const { stub, arginfo } = stubFiles(SOURCE);
  assert.match(readFileSync(arginfo, 'utf8'), new RegExp(`Stub hash: ${stubHash(readFileSync(stub, 'utf8'))}`));
});

test('a changed stub fails the build and names make ext-arginfo', { timeout: 10_000 }, (t) => {
  const directory = copySource(t);
  const { stub } = stubFiles(directory);
  writeFileSync(stub, `${readFileSync(stub, 'utf8')}\n// changed\n`);
  assert.throws(() => checkArginfo(directory), /records the stub hash [0-9a-f]+, but .+ has the hash [0-9a-f]+; run make ext-arginfo/);
});

test('the build reads the C sources, config.m4 and the stub', { timeout: 10_000 }, () => {
  const files = sourceFiles(SOURCE);
  for (const name of ['config.m4', 'polyspec_template.c', 'polyspec_template_arginfo.h', 'polyspec_template.stub.php', 'pt.h']) {
    assert.ok(files.includes(name), `${name} is not an input of the build: ${files.join(', ')}`);
  }
  assert.deepEqual(files.filter(name => !/\.(c|h)$|^config\.m4$|\.stub\.php$/.test(name)), []);
});

test('the inputs hash changes with a source and with the PHP build', { timeout: 10_000 }, (t) => {
  const directory = copySource(t);
  const first = inputsHash(directory, IDENTITY);
  assert.equal(inputsHash(directory, IDENTITY), first);
  assert.notEqual(inputsHash(directory, { ...IDENTITY, version: '8.5.1' }), first);
  writeFileSync(path.join(directory, 'pt.h'), `${readFileSync(path.join(directory, 'pt.h'), 'utf8')}\n`);
  assert.notEqual(inputsHash(directory, IDENTITY), first);
});
