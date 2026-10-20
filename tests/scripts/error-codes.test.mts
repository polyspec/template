// Tests of scripts/generate-error-codes.mts (T22.6-15): the catalog that the code tables of docs/spec/errors.md form, the Go
// identifiers of the codes, the replacement of the generated blocks of a source file, the lists of the tree, and the rule
// that the PHP package, the PHP extension and the Python package raise no code that the catalog does not hold.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ARTIFACTS, CATALOG, goName, parseCatalog, render, replaceBlocks, ROOT, run } from '../../scripts/generate-error-codes.mts';

const catalog = parseCatalog(readFileSync(path.join(ROOT, CATALOG), 'utf8'));
const codes = new Set(catalog.map(entry => entry.code));

/** The files under `directory` of the checkout whose names end with one of `extensions`, recursively. */
function sources(directory: string, extensions: string[]): string[] {
  return readdirSync(path.join(ROOT, directory), { recursive: true, encoding: 'utf8' })
    .filter(name => extensions.some(extension => name.endsWith(extension)))
    .map(name => path.join(directory, name));
}

/** The code literals of each file: a quoted E_ name, with the file and line of each. */
function literals(files: string[], quote: string): { place: string; code: string }[] {
  const pattern = new RegExp(`${quote}(E_[A-Z0-9_]+)${quote}`, 'g');
  return files.flatMap(file => readFileSync(path.join(ROOT, file), 'utf8').split('\n')
    .flatMap((line, index) => [...line.matchAll(pattern)].map(match => ({ place: `${file}:${index + 1}`, code: match[1] ?? '' }))));
}

test('the catalog holds the 41 codes of the tables of docs/spec/errors.md in their order, each with its condition', { timeout: 10_000 }, () => {
  assert.equal(catalog.length, 41);
  assert.deepEqual(catalog[0], { code: 'E_LEX_INVALID_UTF8', condition: 'The source is not valid UTF-8.' });
  assert.equal(catalog.at(-1)?.code, 'E_INTERNAL');
});

test('a malformed code row, a repeated code or a catalog without codes fails the generator', { timeout: 10_000 }, () => {
  assert.throws(() => parseCatalog('| `E_A` | no position |\n'), /is no \| code \| condition \| position \| row/);
  assert.throws(() => parseCatalog('| `E_A` | a | b |\n| `E_A` | c | d |\n'), /names E_A twice/);
  assert.throws(() => parseCatalog('| Code | Condition | Position |\n'), /names no code/);
});

test('the Go identifier of each code is the constant that the Go package declares for it', { timeout: 10_000 }, () => {
  const declared = new Map([...readFileSync(path.join(ROOT, 'packages/go/errs/errs.go'), 'utf8').matchAll(/(\w+)\s+Code = "(E_\w+)"/g)]
    .map(match => [match[2], match[1]]));
  for (const { code } of catalog) assert.equal(goName(code), declared.get(code), code);
});

test('replaceBlocks writes each block between its markers, keeps the markers and fails without them', { timeout: 10_000 }, () => {
  const block = { comment: '//', indent: '', lines: () => ['new'] };
  const source = 'a\n// BEGIN GENERATED ERROR CODES\nold\n// END GENERATED ERROR CODES\nb\n// BEGIN GENERATED ERROR CODES\n// END GENERATED ERROR CODES\nc';
  assert.equal(replaceBlocks(source, [block, block], catalog, 'x'),
    'a\n// BEGIN GENERATED ERROR CODES\nnew\n// END GENERATED ERROR CODES\nb\n// BEGIN GENERATED ERROR CODES\nnew\n// END GENERATED ERROR CODES\nc');
  assert.throws(() => replaceBlocks('no markers', [block], catalog, 'x'), /x needs the lines/);
  assert.throws(() => replaceBlocks(source, [block], catalog, 'x'), /x holds 2 blocks of generated error codes; the generator writes 1/);
});

test('every list is stable on a second render and holds a code that the catalog adds', { timeout: 10_000 }, () => {
  const grown = [...catalog, { code: 'E_EXTRA_CODE', condition: 'An added code.' }];
  for (const artifact of ARTIFACTS) {
    const current = readFileSync(path.join(ROOT, artifact.file), 'utf8');
    const own = render(artifact, catalog, current);
    assert.equal(render(artifact, catalog, own), own, `${artifact.file} is stable`);
    assert.match(render(artifact, grown, own), /E_EXTRA_CODE/, `${artifact.file} writes the added code`);
  }
});

test('every list of the tree matches the catalog', { timeout: 10_000 }, () => {
  assert.deepEqual(run(ROOT, true), []);
});

test('the PHP package and the PHP extension raise each error through the generated constants', { timeout: 10_000 }, () => {
  const php = sources('packages/php/src', ['.php']).filter(file => file !== 'packages/php/src/ErrorCode.php');
  // The generated declarations of ErrorCode in the arginfo header raise nothing; gen_stub writes them from the stub.
  const ext = sources('packages/php-ext/src', ['.c', '.h'])
    .filter(file => file !== 'packages/php-ext/src/pt_error_codes.h' && file !== 'packages/php-ext/src/polyspec_template_arginfo.h');
  assert.deepEqual([...literals(php, "'"), ...literals(php, '"'), ...literals(ext, '"')], []);
});

test('the Python package raises only codes of the catalog', { timeout: 10_000 }, () => {
  const python = literals(sources('packages/python/src/polyspec/template', ['.py']), '"');
  assert.ok(python.length > 0, 'the Python package names its codes as string literals');
  assert.deepEqual(python.filter(({ code }) => !codes.has(code)), []);
});
