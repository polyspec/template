// Tests `.gitignore` (T13.1-4): it ignores no tracked file, and it ignores every output that the builds, the test
// runs and the full-run guard write into the checkout.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const git = (...args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });

// One path inside each output that a build, a test run or the guard writes.
const OUTPUTS = [
  'node_modules/tsup/package.json',
  'packages/template-ts/dist/index.mjs',
  'packages/template-ts/dist.next-12345/index.mjs',
  'packages/template-ts/dist.inputs.json',
  'packages/template-vscode/dist.next-12345/extension.cjs',
  'packages/template-language/dist.inputs.json',
  'packages/template-language/dist/index.mjs',
  'packages/template-lsp/dist/index.mjs',
  'packages/template-codemirror/dist/index.mjs',
  'packages/template-vscode/dist/extension.cjs',
  'packages/template-rust/target/debug/template',
  'tools/showcase/adapters/rust/target/release/showcase-adapter-rust',
  'packages/template-go/template',
  'packages/template-php/vendor/autoload.php',
  'docs/.vitepress/dist/index.html',
  'docs/.vitepress/cache/deps/_metadata.json',
  '.vscode-test/vscode-darwin-arm64/code',
  '.vscode-test.lock',
  'var/full-run.json',
];

test('.gitignore ignores no tracked file', () => {
  const ignored = git('ls-files', '--cached', '--ignored', '--exclude-standard');
  assert.equal(ignored.status, 0, ignored.stderr);
  assert.equal(ignored.stdout, '', `tracked files that .gitignore ignores:\n${ignored.stdout}`);
});

test('.gitignore ignores every output of the builds, the test runs and the guard', () => {
  const result = git('check-ignore', '--no-index', '--verbose', '--non-matching', ...OUTPUTS);
  const notIgnored = result.stdout.split('\n').filter(line => line.startsWith('::')).map(line => line.split('\t')[1]);
  assert.deepEqual(notIgnored, [], `outputs that .gitignore does not ignore: ${notIgnored.join(' ')}`);
});
