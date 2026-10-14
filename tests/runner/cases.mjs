// Fixture case enumeration and comparison helpers shared by the runners.
import { spawn } from 'node:child_process';
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { root } from './drivers.mjs';

export const casesDir = join(root, 'tests', 'cases');

// Returns the cases that the arguments of a generated runner select: every case without arguments,
// or one case or group with `--case group/name | group`. Other arguments and a filter that selects
// no case end the process, so a run never passes without running a case.
export function generatedCases(argv) {
  let filter;
  if (argv.length === 2 && argv[0] === '--case') filter = argv[1];
  else if (argv.length !== 0) {
    process.stderr.write('usage: conformance-generated-<language>.mjs [--case group/name | group]\n');
    process.exit(2);
  }
  const cases = listCases(filter);
  if (cases.length === 0) {
    process.stderr.write(`no cases found${filter === undefined ? '' : ` for ${filter}`}\n`);
    process.exit(1);
  }
  return { cases, filtered: filter !== undefined };
}

export function listCases(filter) {
  const cases = [];
  if (!existsSync(casesDir)) return cases;
  for (const group of readdirSync(casesDir, { withFileTypes: true })) {
    if (!group.isDirectory()) continue;
    for (const entry of readdirSync(join(casesDir, group.name), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(casesDir, group.name, entry.name);
      if (!existsSync(join(dir, 'input.tpl'))) continue;
      const id = `${group.name}/${entry.name}`;
      if (filter && id !== filter && group.name !== filter) continue;
      cases.push(loadCase(id, dir));
    }
  }
  return cases.sort((a, b) => a.id.localeCompare(b.id));
}

const filesystemCasesFile = join(root, 'tests', 'fixtures', 'filesystem', 'cases.json');

/**
 * Writes the file trees of the filesystem cases (CNF-16) into one new directory of the system temporary directory and
 * returns the cases that `filter` selects in the form of `listCases`, with the id `filesystem/<name>`, and
 * the directory, which the caller removes. A file tree holds symbolic and hard links, which a checkout does not hold.
 */
export function filesystemCases(filter) {
  // The real path, because a CLI compares the root with its working directory, which the system reports resolved.
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'template-filesystem-cases-')));
  const cases = [];
  for (const entry of JSON.parse(readFileSync(filesystemCasesFile, 'utf8'))) {
    const id = `filesystem/${entry.name}`;
    if (filter && id !== filter && filter !== 'filesystem') continue;
    const dir = join(directory, entry.name);
    for (const [name, text] of Object.entries(entry.files)) {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), text);
    }
    for (const [name, target] of Object.entries(entry.symbolicLinks ?? {})) symlinkSync(target, join(dir, name));
    for (const [name, target] of Object.entries(entry.hardLinks ?? {})) linkSync(join(dir, target), join(dir, name));
    cases.push({
      id,
      dir,
      relative: id,
      input: 'input.tpl',
      hasData: false,
      hasDefine: false,
      hasEnv: false,
      options: {},
      meta: { rules: entry.rules, stage: 3 },
      expectedHtml: entry.expected.html ?? null,
      expectedError: entry.expected.error ?? null,
      expectedAst: null,
    });
  }
  return { directory, cases };
}

function readIf(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

function loadCase(id, dir) {
  const expectedHtml = readIf(join(dir, 'expected.html'));
  const expectedError = readIf(join(dir, 'expected.error.json'));
  const expectedAst = readIf(join(dir, 'expected.ast.json'));
  return {
    id,
    dir,
    relative: relative(root, dir),
    input: 'input.tpl',
    hasData: existsSync(join(dir, 'data.json')),
    hasDefine: existsSync(join(dir, 'define.json')),
    hasEnv: existsSync(join(dir, 'env.json')),
    options: existsSync(join(dir, 'options.json')) ? JSON.parse(readFileSync(join(dir, 'options.json'), 'utf8')) : {},
    meta: existsSync(join(dir, 'case.json')) ? JSON.parse(readFileSync(join(dir, 'case.json'), 'utf8')) : { rules: [], stage: 0 },
    expectedHtml,
    expectedError: expectedError === null ? null : JSON.parse(expectedError),
    expectedAst: expectedAst === null ? null : JSON.parse(expectedAst),
  };
}

// The template definitions of a case for type derivation. A define.json that is not JSON text is
// a data error of the render (VAL-12): the render step of every runner reports it as
// E_DATA_INVALID_JSON, and type derivation uses no definitions.
export function typeDefinitions(testCase) {
  if (!testCase.hasDefine) return {};
  try {
    return JSON.parse(readFileSync(join(testCase.dir, 'define.json'), 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) return {};
    throw error;
  }
}

export function renderArgs(testCase) {
  const args = ['render', testCase.input, '--root', testCase.dir];
  if (testCase.hasData) args.push('--data', 'data.json');
  if (testCase.hasDefine) args.push('--define', 'define.json');
  if (testCase.hasEnv) args.push('--env', 'env.json');
  if (testCase.options.delimiters) args.push('--delimiters', testCase.options.delimiters);
  return args;
}

export function parseArgs(testCase) {
  const args = ['parse', testCase.input, '--root', testCase.dir];
  if (testCase.options.delimiters) args.push('--delimiters', testCase.options.delimiters);
  return args;
}

// Structural JSON equality: key order is ignored, numbers compare by value.
export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  if (typeof a === 'object') {
    if (Array.isArray(b)) return false;
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key, index) => key === keysB[index] && deepEqual(a[key], b[key]));
  }
  return false;
}

export function firstDifference(a, b, path = '$') {
  if (deepEqual(a, b)) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') {
    return `${path}: expected ${JSON.stringify(a)}, got ${JSON.stringify(b)}`;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: array and object differ`;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return `${path}: expected length ${a.length}, got ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const diff = firstDifference(a[i], b[i], `${path}[${i}]`);
      if (diff) return diff;
    }
    return null;
  }
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!(key in a)) return `${path}.${key}: unexpected key`;
    if (!(key in b)) return `${path}.${key}: missing key`;
    const diff = firstDifference(a[key], b[key], `${path}.${key}`);
    if (diff) return diff;
  }
  return null;
}

export function parseErrorOutput(stderr) {
  const text = stderr.trim();
  try {
    const parsed = JSON.parse(text);
    return { code: parsed.code, template: parsed.template, line: parsed.line, col: parsed.col };
  } catch {
    return null;
  }
}

export function describeText(expected, actual) {
  const limit = Math.min(expected.length, actual.length);
  let index = 0;
  while (index < limit && expected[index] === actual[index]) index++;
  const line = expected.slice(0, index).split('\n').length;
  return `first difference at byte ${index} (line ${line}): expected ${JSON.stringify(expected.slice(index, index + 40))}, got ${JSON.stringify(actual.slice(index, index + 40))}`;
}

/**
 * Runs the run-tests tool of @polyspec/kit with `<args>` on the generated tests of the cases, prints its output as it arrives and
 * resolves its exit status, the ids of the cases whose test failed and its last line (T19.10). A case is found in a
 * failure line (`✖`) by the name of its test or package, `case_<name>`, which `names` maps to the case id.
 */
export function runCaseTests(args, { cwd, env }, names) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.resolve('@polyspec/kit/run-tests')), ...args], { cwd, env, stdio: ['ignore', 'pipe', 'inherit'] });
    const failed = new Set();
    let last = '';
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      process.stdout.write(`${line}\n`);
      if (line.trim()) last = line.trim();
      if (/ ✖ /.test(line)) for (const match of line.matchAll(/\bcase_[A-Za-z0-9_]+/g)) if (names.has(match[0])) failed.add(names.get(match[0]));
    });
    child.once('error', reject);
    child.once('close', status => resolvePromise({ status, failed: [...failed], last }));
  });
}

/** The failures of a run of `runCaseTests`: one for each failed case, or the last line when no case failed. */
export function caseTestFailures(language, run) {
  if (run.status === 0) return [];
  if (run.failed.length > 0) return run.failed.map(id => `${id}: the generated ${language} test of the case failed`);
  return [`the generated ${language} tests failed before any case failed: ${run.last}`];
}

