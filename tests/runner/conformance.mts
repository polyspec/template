#!/usr/bin/env node
// Conformance runner: runs every fixture case through the selected language CLIs
// and compares the AST, the HTML output, the error fields, the tokens and the formatted text with the expected files
// (CNF-9). A case whose input parses (expected.ast.json) compares tokens and formatted text in every language; an
// implementation without the subcommand fails the case.
// Each case prints `<case> [<lang>] pass|fail (<ms> ms)` when it finishes in a language; the
// summary table follows the last case. Each CLI call has its own timeout (drivers.mts).
//
// Options:
//   --langs ts,go,rust,php,php-ext   languages to run (default: every language whose package exists)
//   --case group/name | group        run one case or one group
//   --list                           print the cases and exit
//   --update ast|html|error|tokens|format
//                                    write the expected file from the ts implementation
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { invoke, prepare, selectLanguages } from './drivers.mts';
import {
  describeText, filesystemCases, firstDifference, FORMAT_MODE_NAMES, formatArgs, formatOutcome, listCases, parseArgs, parseErrorOutput, renderArgs, tokensArgs,
  tokensText, type FormatMode, type FormatOutcome,
} from './cases.mts';

const options: { langs?: string | undefined; case?: string | undefined; list: boolean; update?: string | undefined } = { list: false };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  switch (argv[i]) {
    case '--langs': options.langs = argv[++i]; break;
    case '--case': options.case = argv[++i]; break;
    case '--list': options.list = true; break;
    case '--update': options.update = argv[++i]; break;
    case '--help':
      process.stdout.write('usage: conformance.mts [--langs a,b] [--case group/name] [--list] [--update ast|html|error|tokens|format]\n');
      process.exit(0);
      break;
    default:
      process.stderr.write(`unknown option: ${argv[i]}\n`);
      process.exit(1);
  }
}

// The filesystem cases (CNF-16) run after the fixture cases, from file trees in a temporary directory; --update writes
// only the expected files of fixture cases.
const fixtureCases = listCases(options.case);
const filesystem = filesystemCases(options.case);
process.once('exit', () => rmSync(filesystem.directory, { recursive: true, force: true }));
const cases = [...fixtureCases, ...filesystem.cases];
if (options.list) {
  for (const testCase of cases) process.stdout.write(`${testCase.id}  stage ${testCase.meta.stage}  ${testCase.meta.rules.join(' ')}\n`);
  process.stdout.write(`${cases.length} cases\n`);
  process.exit(0);
}
if (!cases.length) {
  process.stderr.write('no cases found\n');
  process.exit(1);
}

const languages = selectLanguages(options.langs);
if (!languages.length) {
  process.stderr.write('no language package exists\n');
  process.exit(1);
}
for (const language of languages) prepare(language);

if (options.update) {
  if (!['ast', 'html', 'error', 'tokens', 'format'].includes(options.update)) {
    process.stderr.write(`invalid --update value: ${String(options.update)}\n`);
    process.exit(1);
  }
  if (!languages.includes('ts')) {
    process.stderr.write('--update requires ts among the selected languages\n');
    process.exit(1);
  }
  const language = 'ts';
  let written = 0;
  let failedUpdates = 0;
  for (const testCase of fixtureCases) {
    if (options.update === 'tokens' || options.update === 'format') {
      // Only a case whose input parses has tokens and a formatted text (CNF-2).
      if (testCase.expectedAst === null) continue;
      if (options.update === 'tokens') {
        const result = invoke(language, tokensArgs(testCase), testCase.dir);
        if (result.status !== 0) {
          process.stderr.write(`${testCase.id}: tokens failed (exit ${result.status})\n${result.stderr}`);
          failedUpdates++;
          continue;
        }
        writeFileSync(join(testCase.dir, 'expected.tokens.json'), tokensText(JSON.parse(result.stdout) as unknown[]));
      } else {
        const expected: Partial<Record<FormatMode, FormatOutcome>> = {};
        for (const mode of FORMAT_MODE_NAMES) {
          const result = invoke(language, formatArgs(testCase, mode), testCase.dir);
          const outcome = formatOutcome(result);
          expected[mode] = outcome;
          if ('failure' in outcome) process.stderr.write(`${testCase.id}: format ${mode} failed: ${outcome.failure}\n`);
        }
        if (Object.values(expected).some(outcome => 'failure' in outcome)) {
          failedUpdates++;
          continue;
        }
        writeFileSync(join(testCase.dir, 'expected.format.json'), JSON.stringify(expected, null, 2) + '\n');
      }
      written++;
    } else if (options.update === 'ast') {
      const result = invoke(language, parseArgs(testCase), testCase.dir);
      if (result.status !== 0) {
        process.stderr.write(`${testCase.id}: parse failed\n${result.stderr}`);
        continue;
      }
      writeFileSync(join(testCase.dir, 'expected.ast.json'), JSON.stringify(JSON.parse(result.stdout), null, 2) + '\n');
      written++;
    } else {
      const result = invoke(language, renderArgs(testCase), testCase.dir);
      if (options.update === 'html' && result.status === 0) {
        writeFileSync(join(testCase.dir, 'expected.html'), result.stdout);
        written++;
      } else if (options.update === 'error' && result.status === 2) {
        const error = parseErrorOutput(result.stderr);
        writeFileSync(join(testCase.dir, 'expected.error.json'), JSON.stringify(error, null, 2) + '\n');
        written++;
      } else {
        process.stderr.write(`${testCase.id}: no ${String(options.update)} result (exit ${result.status})\n`);
      }
    }
  }
  process.stdout.write(`${written} expected ${String(options.update)} files written from ${language}\n`);
  process.exit(failedUpdates ? 1 : 0);
}

const failures: string[] = [];
// Each row holds the outcome of every language in the order of `languages`.
const results: { id: string; outcomes: string[] }[] = [];
for (const testCase of cases) {
  const row: { id: string; outcomes: string[] } = { id: testCase.id, outcomes: [] };
  for (const language of languages) {
    const started = performance.now();
    const problems: string[] = [];
    if (testCase.expectedAst) {
      const parsed = invoke(language, parseArgs(testCase), testCase.dir);
      if (parsed.status !== 0) {
        problems.push(`parse exit ${parsed.status}: ${parsed.stderr.trim()}`);
      } else {
        let ast: unknown;
        try {
          ast = JSON.parse(parsed.stdout);
        } catch (error) {
          problems.push(`parse output is not JSON: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (ast) {
          const diff = firstDifference(testCase.expectedAst, ast);
          if (diff) problems.push(`ast ${diff}`);
        }
      }
    }
    if (testCase.expectedAst) {
      // CNF-9: the token array and the formatted text or error fields of both modes equal the expected files exactly.
      if (testCase.expectedTokens === null) problems.push('case has no expected.tokens.json');
      else {
        const result = invoke(language, tokensArgs(testCase), testCase.dir);
        let tokens: unknown;
        if (result.status !== 0) problems.push(`tokens exit ${result.status}: ${result.stderr.trim()}`);
        else {
          try {
            tokens = JSON.parse(result.stdout);
          } catch (error) {
            problems.push(`tokens output is not JSON: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        if (tokens !== undefined) {
          const diff = firstDifference(testCase.expectedTokens, tokens);
          if (diff) problems.push(`tokens ${diff}`);
        }
      }
      const expectedFormat = testCase.expectedFormat;
      if (expectedFormat === null || expectedFormat === undefined) problems.push('case has no expected.format.json');
      else {
        for (const mode of FORMAT_MODE_NAMES) {
          const expected = expectedFormat[mode];
          const expectedText = typeof expected === 'object' && expected !== null && 'text' in expected ? expected.text : undefined;
          const result = invoke(language, formatArgs(testCase, mode), testCase.dir);
          const actual = formatOutcome(result);
          if ('failure' in actual) problems.push(`format ${mode} ${actual.failure}`);
          else if (typeof expectedText === 'string' && 'text' in actual) {
            if (actual.text !== expectedText) problems.push(`format ${mode} ${describeText(expectedText, actual.text)}`);
          } else {
            const diff = firstDifference(expected, actual, `format ${mode}`);
            if (diff) problems.push(diff);
          }
        }
      }
    }
    const rendered = invoke(language, renderArgs(testCase), testCase.dir);
    if (testCase.expectedError) {
      if (rendered.status !== 2) {
        problems.push(`expected error ${testCase.expectedError.code}, got exit ${rendered.status}`);
      } else {
        const error = parseErrorOutput(rendered.stderr);
        if (!error) {
          problems.push(`error output is not JSON: ${rendered.stderr.trim()}`);
        } else {
          const diff = firstDifference(testCase.expectedError, error);
          if (diff) problems.push(`error ${diff}`);
        }
      }
    } else if (testCase.expectedHtml !== null) {
      if (rendered.status !== 0) {
        problems.push(`render exit ${rendered.status}: ${rendered.stderr.trim()}`);
      } else if (rendered.stdout !== testCase.expectedHtml) {
        problems.push(`html ${describeText(testCase.expectedHtml, rendered.stdout)}`);
      }
    } else {
      problems.push('case has neither expected.html nor expected.error.json');
    }
    const outcome = problems.length ? 'fail' : 'pass';
    row.outcomes.push(outcome);
    process.stdout.write(`${testCase.id} [${language}] ${outcome} (${Math.round(performance.now() - started)} ms)\n`);
    for (const problem of problems) failures.push(`${testCase.id} [${language}] ${problem}`);
  }
  results.push(row);
}

const width = Math.max(...results.map(r => r.id.length), 4);
process.stdout.write(`${'case'.padEnd(width)}  ${languages.map(l => l.padEnd(7)).join('')}\n`);
for (const row of results) {
  process.stdout.write(`${row.id.padEnd(width)}  ${row.outcomes.map(outcome => outcome.padEnd(7)).join('')}\n`);
}
const total = results.length * languages.length;
process.stdout.write(`${total - failures.length}/${total} passed (${results.length} cases, ${languages.length} languages)\n`);
for (const failure of failures) process.stderr.write(`${failure}\n`);
process.exit(failures.length ? 1 : 0);
