#!/usr/bin/env node
// Conformance runner: runs every fixture case through the selected language CLIs
// and compares the AST, the HTML output and the error fields with the expected files.
//
// Options:
//   --langs ts,go,rust,php,php-ext   languages to run (default: every language whose package exists)
//   --case group/name | group        run one case or one group
//   --list                           print the cases and exit
//   --update ast|html|error          write the expected file from the ts implementation
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { invoke, prepare, selectLanguages } from './drivers.mjs';
import { describeText, firstDifference, listCases, parseArgs, parseErrorOutput, renderArgs } from './cases.mjs';

const options = { langs: null, case: null, list: false, update: null };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  switch (argv[i]) {
    case '--langs': options.langs = argv[++i]; break;
    case '--case': options.case = argv[++i]; break;
    case '--list': options.list = true; break;
    case '--update': options.update = argv[++i]; break;
    case '--help':
      process.stdout.write('usage: conformance.mjs [--langs a,b] [--case group/name] [--list] [--update ast|html|error]\n');
      process.exit(0);
      break;
    default:
      process.stderr.write(`unknown option: ${argv[i]}\n`);
      process.exit(1);
  }
}

const cases = listCases(options.case);
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
  if (!['ast', 'html', 'error'].includes(options.update)) {
    process.stderr.write(`invalid --update value: ${options.update}\n`);
    process.exit(1);
  }
  if (!languages.includes('ts')) {
    process.stderr.write('--update requires ts among the selected languages\n');
    process.exit(1);
  }
  const language = 'ts';
  let written = 0;
  for (const testCase of cases) {
    if (options.update === 'ast') {
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
        process.stderr.write(`${testCase.id}: no ${options.update} result (exit ${result.status})\n`);
      }
    }
  }
  process.stdout.write(`${written} expected ${options.update} files written from ${language}\n`);
  process.exit(0);
}

const failures = [];
const results = [];
for (const testCase of cases) {
  const row = { id: testCase.id, outcome: {} };
  for (const language of languages) {
    const problems = [];
    if (testCase.expectedAst) {
      const parsed = invoke(language, parseArgs(testCase), testCase.dir);
      if (parsed.status !== 0) {
        problems.push(`parse exit ${parsed.status}: ${parsed.stderr.trim()}`);
      } else {
        let ast;
        try {
          ast = JSON.parse(parsed.stdout);
        } catch (error) {
          problems.push(`parse output is not JSON: ${error.message}`);
        }
        if (ast) {
          const diff = firstDifference(testCase.expectedAst, ast);
          if (diff) problems.push(`ast ${diff}`);
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
    row.outcome[language] = problems.length ? 'fail' : 'pass';
    for (const problem of problems) failures.push(`${testCase.id} [${language}] ${problem}`);
  }
  results.push(row);
}

const width = Math.max(...results.map(r => r.id.length), 4);
process.stdout.write(`${'case'.padEnd(width)}  ${languages.map(l => l.padEnd(7)).join('')}\n`);
for (const row of results) {
  process.stdout.write(`${row.id.padEnd(width)}  ${languages.map(l => row.outcome[l].padEnd(7)).join('')}\n`);
}
const total = results.length * languages.length;
process.stdout.write(`${total - failures.length}/${total} passed (${results.length} cases, ${languages.length} languages)\n`);
for (const failure of failures) process.stderr.write(`${failure}\n`);
process.exit(failures.length ? 1 : 0);
