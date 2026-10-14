// Fixture case enumeration and comparison helpers shared by the runners.
import { spawn } from 'node:child_process';
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { caseIds, caseOptions, casesDir } from './case-list.mjs';
import { root } from './drivers.mjs';

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
  if (!existsSync(casesDir)) return [];
  return caseIds()
    .filter(id => existsSync(join(casesDir, id, 'input.tpl')) && (!filter || id === filter || id.split('/')[0] === filter))
    .map(id => loadCase(id, join(casesDir, id)));
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
  const expectedTokens = readIf(join(dir, 'expected.tokens.json'));
  const expectedFormat = readIf(join(dir, 'expected.format.json'));
  return {
    id,
    dir,
    relative: relative(root, dir),
    input: 'input.tpl',
    hasData: existsSync(join(dir, 'data.json')),
    hasDefine: existsSync(join(dir, 'define.json')),
    hasEnv: existsSync(join(dir, 'env.json')),
    options: caseOptions(id),
    meta: existsSync(join(dir, 'case.json')) ? JSON.parse(readFileSync(join(dir, 'case.json'), 'utf8')) : { rules: [], stage: 0 },
    expectedHtml,
    expectedError: expectedError === null ? null : JSON.parse(expectedError),
    expectedAst: expectedAst === null ? null : JSON.parse(expectedAst),
    expectedTokens: expectedTokens === null ? null : JSON.parse(expectedTokens),
    expectedFormat: expectedFormat === null ? null : JSON.parse(expectedFormat),
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

// The command lines of CNF-4: `<subcommand> [options] FILE`, the options before the operand (POSIX utility syntax
// guidelines), an order that every standard argument parser reads, also those that stop at the first operand.
export function renderArgs(testCase) {
  const options = ['--root', testCase.dir];
  if (testCase.hasData) options.push('--data', 'data.json');
  if (testCase.hasDefine) options.push('--define', 'define.json');
  if (testCase.hasEnv) options.push('--env', 'env.json');
  return ['render', ...options, ...delimiterOptions(testCase), testCase.input];
}

export function parseArgs(testCase) {
  return ['parse', '--root', testCase.dir, ...delimiterOptions(testCase), testCase.input];
}

export function tokensArgs(testCase) {
  return ['tokens', '--root', testCase.dir, ...delimiterOptions(testCase), testCase.input];
}

// The modes of expected.format.json: `indent` formats with the default options, `keep` with indent null (CNF-2).
export const FORMAT_MODES = { indent: [], keep: ['--indent', 'none'] };

// The arguments of `format` for a mode; the command runs in the case directory.
export function formatArgs(testCase, mode) {
  return ['format', ...FORMAT_MODES[mode], ...delimiterOptions(testCase), testCase.input];
}

function delimiterOptions(testCase) {
  // One argument, so that a value which starts with a hyphen is never read as an option (CNF-4).
  return testCase.options.delimiters ? [`--delimiters=${testCase.options.delimiters}`] : [];
}

// The result of one `format` call as an entry of expected.format.json: {text} for exit status 0, {error} with the
// reason, the code and the position of the stderr JSON for exit status 2, and {failure} with the reason for any other
// outcome.
export function formatOutcome(result) {
  if (result.status === 0) return { text: result.stdout };
  const stderr = result.stderr.trim();
  if (result.status !== 2) return { failure: `exit ${result.status}: ${stderr}` };
  try {
    const { reason, code, line, col } = JSON.parse(stderr);
    return { error: { reason, code, line, col } };
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { failure: `exit 2 with a standard error that is no JSON (${error.message}): ${stderr}` };
  }
}

// The text of expected.tokens.json: one [start, end, type] token per line.
export function tokensText(tokens) {
  return tokens.length === 0 ? '[]\n' : `[\n${tokens.map(token => `  ${JSON.stringify(token)}`).join(',\n')}\n]\n`;
}

// Structural JSON equality: key order is ignored, numbers compare by value.
function deepEqual(a, b) {
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

