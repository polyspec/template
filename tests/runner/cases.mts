// Fixture case enumeration and comparison helpers shared by the runners.
import { EXPECTED_ERROR_SCHEMA, type ExpectedError, expectedErrorDocument } from '../../scripts/conformance-case-files.mts';
import { spawn } from 'node:child_process';
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { caseIds, caseOptions, casesDir } from './case-list.mts';
import { jsonDocument } from '../../scripts/json-document.mts';
import { isJsonObject, parsedJsonObject } from './checked.mts';
import { root } from './drivers.mts';
import type { JSONSchemaType } from 'ajv';

/** The expected error of a case, read and validated by the one reader of the case files. */
export type { ExpectedError };

/** The modes of expected.format.json. */
export type FormatMode = 'indent' | 'keep';

/** A conformance case as the runners read it; an absent expected file is null. */
export interface TestCase {
  id: string;
  dir: string;
  relative: string;
  input: string;
  hasData: boolean;
  hasDefine: boolean;
  hasEnv: boolean;
  options: { delimiters?: string };
  meta: { requirements: string[]; stage: number };
  expectedHtml: string | null;
  expectedError: ExpectedError | null;
  expectedAst: unknown;
  expectedTokens?: unknown;
  expectedFormat?: Record<FormatMode, unknown> | null;
}

/** The outcome of one CLI call. */
export interface CallResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** A file-tree case of tests/fixtures/filesystem/cases.json (CNF-16). */
interface FilesystemCase {
  name: string;
  requirements: string[];
  files: Record<string, string>;
  symbolicLinks?: Record<string, string>;
  hardLinks?: Record<string, string>;
  expected: { html?: string; error?: ExpectedError };
}

const NAMES: JSONSchemaType<Record<string, string>> = { type: 'object', required: [], additionalProperties: { type: 'string' } };
const FILESYSTEM_CASES_SCHEMA: JSONSchemaType<FilesystemCase[]> = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      requirements: { type: 'array', items: { type: 'string' } },
      files: NAMES,
      symbolicLinks: { ...NAMES, nullable: true },
      hardLinks: { ...NAMES, nullable: true },
      expected: {
        type: 'object',
        properties: { html: { type: 'string', nullable: true }, error: { ...EXPECTED_ERROR_SCHEMA, nullable: true } },
        required: [],
        additionalProperties: false,
      },
    },
    required: ['name', 'requirements', 'files', 'expected'],
    additionalProperties: false,
  },
};

const filesystemCasesDocument = jsonDocument<FilesystemCase[]>('list of filesystem cases', FILESYSTEM_CASES_SCHEMA);

const CASE_META_SCHEMA: JSONSchemaType<TestCase['meta']> = {
  type: 'object',
  properties: { requirements: { type: 'array', items: { type: 'string' } }, stage: { type: 'integer' } },
  required: ['requirements', 'stage'],
  additionalProperties: false,
};

const caseMetaDocument = jsonDocument<TestCase['meta']>('case.json', CASE_META_SCHEMA);

/** The entries of expected.format.json, one for each format mode. */
function expectedFormatOf(text: string, where: string): Record<FormatMode, unknown> {
  const value = parsedJsonObject(text, where);
  if (!('indent' in value) || !('keep' in value)) throw new Error(`${where} holds no entries indent and keep`);
  return { indent: value.indent, keep: value.keep };
}

// Returns the cases that the arguments of a generated runner select: every case without arguments,
// or one case or group with `--case group/name | group`. Other arguments and a filter that selects
// no case end the process, so a run never passes without running a case.
export function generatedCases(argv: readonly string[]): { cases: TestCase[]; filtered: boolean } {
  let filter: string | undefined;
  if (argv.length === 2 && argv[0] === '--case') filter = argv[1];
  else if (argv.length !== 0) {
    process.stderr.write('usage: conformance-generated-<language>.mts [--case group/name | group]\n');
    process.exit(2);
  }
  const cases = listCases(filter);
  if (cases.length === 0) {
    process.stderr.write(`no cases found${filter === undefined ? '' : ` for ${filter}`}\n`);
    process.exit(1);
  }
  return { cases, filtered: filter !== undefined };
}

export function listCases(filter?: string): TestCase[] {
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
export function filesystemCases(filter?: string): { directory: string; cases: TestCase[] } {
  // The real path, because a CLI compares the root with its working directory, which the system reports resolved.
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'template-filesystem-cases-')));
  const cases: TestCase[] = [];
  for (const entry of filesystemCasesDocument.read(filesystemCasesFile)) {
    const id = `filesystem/${entry.name}`;
    if (filter && id !== filter && filter !== 'filesystem') continue;
    const dir = join(directory, entry.name);
    for (const [name, text] of Object.entries(entry.files)) {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), text);
    }
    // A case without links holds no symbolicLinks or hardLinks entry.
    if (entry.symbolicLinks) for (const [name, target] of Object.entries(entry.symbolicLinks)) symlinkSync(target, join(dir, name));
    if (entry.hardLinks) for (const [name, target] of Object.entries(entry.hardLinks)) linkSync(join(dir, target), join(dir, name));
    cases.push({
      id,
      dir,
      relative: id,
      input: 'input.tpl',
      hasData: false,
      hasDefine: false,
      hasEnv: false,
      options: {},
      meta: { requirements: entry.requirements, stage: 3 },
      expectedHtml: entry.expected.html ?? null,
      expectedError: entry.expected.error ?? null,
      expectedAst: null,
    });
  }
  return { directory, cases };
}

function readIf(path: string): string | null {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

function loadCase(id: string, dir: string): TestCase {
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
    meta: existsSync(join(dir, 'case.json')) ? caseMetaDocument.read(join(dir, 'case.json')) : { requirements: [], stage: 0 },
    expectedHtml,
    expectedError: expectedError === null ? null : expectedErrorDocument.parse(expectedError, join(dir, 'expected.error.json')),
    expectedAst: expectedAst === null ? null : JSON.parse(expectedAst),
    expectedTokens: expectedTokens === null ? null : JSON.parse(expectedTokens),
    expectedFormat: expectedFormat === null ? null : expectedFormatOf(expectedFormat, join(dir, 'expected.format.json')),
  };
}

/** The HTML that a case expects; a runner reads it for a case that expects no error, which then expects HTML. */
export function expectedHtml(testCase: TestCase): string {
  if (testCase.expectedHtml === null) throw new Error(`${testCase.id} expects no HTML`);
  return testCase.expectedHtml;
}

// The template definitions of a case for type derivation. A define.json that is not JSON text, or
// whose value is no map, is a data error of the render (VAL-12): the render step of every runner
// reports it, and type derivation uses no definitions.
export function typeDefinitions(testCase: TestCase): Record<string, unknown> {
  if (!testCase.hasDefine) return {};
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(join(testCase.dir, 'define.json'), 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) return {};
    throw error;
  }
  return isJsonObject(value) ? value : {};
}

/** The field `name` of a thrown value, or undefined when the value is no object or has no such field. */
export function errorField(error: unknown, name: string): unknown {
  return typeof error === 'object' && error !== null && name in error ? Reflect.get(error, name) : undefined;
}

// The command lines of CNF-4: `<subcommand> [options] FILE`, the options before the operand (POSIX utility syntax
// guidelines), an order that every standard argument parser reads, also those that stop at the first operand.
export function renderArgs(testCase: TestCase): string[] {
  const options = ['--root', testCase.dir];
  if (testCase.hasData) options.push('--data', 'data.json');
  if (testCase.hasDefine) options.push('--define', 'define.json');
  if (testCase.hasEnv) options.push('--env', 'env.json');
  return ['render', ...options, ...delimiterOptions(testCase), testCase.input];
}

export function parseArgs(testCase: TestCase): string[] {
  return ['parse', '--root', testCase.dir, ...delimiterOptions(testCase), testCase.input];
}

export function tokensArgs(testCase: TestCase): string[] {
  return ['tokens', '--root', testCase.dir, ...delimiterOptions(testCase), testCase.input];
}

// The modes of expected.format.json: `indent` formats with the default options, `keep` with indent null (CNF-2).
export const FORMAT_MODES: Record<FormatMode, string[]> = { indent: [], keep: ['--indent', 'none'] };

/** The names of the modes of expected.format.json, in the order of FORMAT_MODES. */
export const FORMAT_MODE_NAMES: readonly FormatMode[] = ['indent', 'keep'];

// The arguments of `format` for a mode; the command runs in the case directory.
export function formatArgs(testCase: TestCase, mode: FormatMode): string[] {
  return ['format', ...FORMAT_MODES[mode], ...delimiterOptions(testCase), testCase.input];
}

function delimiterOptions(testCase: TestCase): string[] {
  // One argument, so that a value which starts with a hyphen is never read as an option (CNF-4).
  return testCase.options.delimiters ? [`--delimiters=${testCase.options.delimiters}`] : [];
}

// The result of one `format` call as an entry of expected.format.json: {text} for exit status 0, {error} with the
// reason, the code and the position of the stderr JSON for exit status 2, and {failure} with the reason for any other
// outcome.
export type FormatOutcome =
  | { text: string }
  | { error: { reason: unknown; code: unknown; line: unknown; col: unknown } }
  | { failure: string };

export function formatOutcome(result: CallResult): FormatOutcome {
  if (result.status === 0) return { text: result.stdout };
  const stderr = result.stderr.trim();
  if (result.status !== 2) return { failure: `exit ${result.status}: ${stderr}` };
  try {
    const value: unknown = JSON.parse(stderr);
    if (!isJsonObject(value)) return { failure: `exit 2 with a standard error that is no JSON object: ${stderr}` };
    return { error: { reason: value.reason, code: value.code, line: value.line, col: value.col } };
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { failure: `exit 2 with a standard error that is no JSON (${error.message}): ${stderr}` };
  }
}

// The text of expected.tokens.json: one [start, end, type] token per line.
export function tokensText(tokens: readonly unknown[]): string {
  return tokens.length === 0 ? '[]\n' : `[\n${tokens.map(token => `  ${JSON.stringify(token)}`).join(',\n')}\n]\n`;
}

// Structural JSON equality: key order is ignored, numbers compare by value.
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    if (Array.isArray(b)) return false;
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key, index) => key === keysB[index] && deepEqual(Reflect.get(a, key), Reflect.get(b, key)));
  }
  return false;
}

export function firstDifference(a: unknown, b: unknown, path = '$'): string | null {
  if (deepEqual(a, b)) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') {
    return `${path}: expected ${JSON.stringify(a)}, got ${JSON.stringify(b)}`;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: array and object differ`;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${path}: expected length ${a.length}, got ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const diff = firstDifference(a[i], b[i], `${path}[${i}]`);
      if (diff) return diff;
    }
    return null;
  }
  if (typeof b !== 'object') return `${path}: expected ${JSON.stringify(a)}, got ${JSON.stringify(b)}`;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!(key in a)) return `${path}.${key}: unexpected key`;
    if (!(key in b)) return `${path}.${key}: missing key`;
    const diff = firstDifference(Reflect.get(a, key), Reflect.get(b, key), `${path}.${key}`);
    if (diff) return diff;
  }
  return null;
}

export function parseErrorOutput(stderr: string): { code: unknown; template: unknown; line: unknown; col: unknown } | null {
  const text = stderr.trim();
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isJsonObject(parsed)) return null;
    return { code: parsed.code, template: parsed.template, line: parsed.line, col: parsed.col };
  } catch {
    return null;
  }
}

export function describeText(expected: string, actual: string): string {
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
/** The outcome of a run of the generated tests of the cases. */
export interface CaseTestRun {
  status: number | null;
  failed: string[];
  last: string;
}

export function runCaseTests(args: readonly string[], { cwd, env }: { cwd: string; env?: NodeJS.ProcessEnv }, names: ReadonlyMap<string, string>): Promise<CaseTestRun> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.resolve('@polyspec/kit/run-tests')), ...args], { cwd, env, stdio: ['ignore', 'pipe', 'inherit'] });
    const failed = new Set<string>();
    let last = '';
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      process.stdout.write(`${line}\n`);
      if (line.trim()) last = line.trim();
      if (/ ✖ /.test(line)) for (const match of line.matchAll(/\bcase_[A-Za-z0-9_]+/g)) {
        const id = names.get(match[0]);
        if (id !== undefined) failed.add(id);
      }
    });
    child.once('error', reject);
    child.once('close', (status: number | null) => resolvePromise({ status, failed: [...failed], last }));
  });
}

/** The failures of a run of `runCaseTests`: one for each failed case, or the last line when no case failed. */
export function caseTestFailures(language: string, run: CaseTestRun): string[] {
  if (run.status === 0) return [];
  if (run.failed.length > 0) return run.failed.map(id => `${id}: the generated ${language} test of the case failed`);
  return [`the generated ${language} tests failed before any case failed: ${run.last}`];
}

