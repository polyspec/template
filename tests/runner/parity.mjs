#!/usr/bin/env node
// Parity runner: renders every fixture case in every selected language and reports
// cases whose outputs differ between languages. Expected files are not used.
//
// Options:
//   --langs ts,go,rust,php,php-ext   languages to compare (default: every language whose package exists)
//   --case group/name | group        limit to one case or group
import { invoke, prepare, selectLanguages } from './drivers.mjs';
import { listCases, parseErrorOutput, renderArgs } from './cases.mjs';

const options = { langs: null, case: null };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  switch (argv[i]) {
    case '--langs': options.langs = argv[++i]; break;
    case '--case': options.case = argv[++i]; break;
    case '--help':
      process.stdout.write('usage: parity.mjs [--langs a,b] [--case group/name]\n');
      process.exit(0);
      break;
    default:
      process.stderr.write(`unknown option: ${argv[i]}\n`);
      process.exit(1);
  }
}

const languages = selectLanguages(options.langs);
if (languages.length < 2) {
  process.stderr.write('parity requires at least two languages\n');
  process.exit(1);
}
for (const language of languages) prepare(language);

const cases = listCases(options.case);
if (!cases.length) {
  process.stderr.write('no cases found\n');
  process.exit(1);
}

// Outcome of one render: "html:<output>" or "error:<code>@<line>:<col>" or "exit:<status>".
function outcome(language, testCase) {
  const result = invoke(language, renderArgs(testCase), testCase.dir);
  if (result.status === 0) return `html:${result.stdout}`;
  if (result.status === 2) {
    const error = parseErrorOutput(result.stderr);
    if (error) return `error:${error.code}@${error.template}:${error.line}:${error.col}`;
  }
  return `exit:${result.status}:${result.stderr.trim()}`;
}

const client = languages.filter(l => l === 'ts');
const servers = languages.filter(l => l !== 'ts');
let divergent = 0;
let clientServer = 0;
let serverOnly = 0;
for (const testCase of cases) {
  const outcomes = new Map(languages.map(l => [l, outcome(l, testCase)]));
  const distinct = new Set(outcomes.values());
  if (distinct.size === 1) continue;
  divergent++;
  const serverSet = new Set(servers.map(l => outcomes.get(l)));
  if (serverSet.size > 1) serverOnly++;
  if (client.length && servers.some(l => outcomes.get(l) !== outcomes.get('ts'))) clientServer++;
  process.stdout.write(`${testCase.id}\n`);
  for (const [language, value] of outcomes) {
    const summary = value.length > 120 ? `${value.slice(0, 120)}...` : value;
    process.stdout.write(`  ${language.padEnd(8)} ${JSON.stringify(summary)}\n`);
  }
}
process.stdout.write(`${cases.length - divergent}/${cases.length} cases agree across ${languages.join(', ')}\n`);
if (divergent) {
  process.stdout.write(`${divergent} divergent (client/server: ${clientServer}, server/server: ${serverOnly})\n`);
}
process.exit(divergent ? 1 : 0);
