#!/usr/bin/env node
// make ci-passed (T22.1-3): the step of the job ci-passed, the last job of .github/workflows/ci.yml, which runs after
// every other job of the workflow (`if: ${{ always() }}`) and is the check of ci.yml that the ruleset main requires. It
// reads the environment variable RESULTS, the JSON of `needs` (`{"<job>": {"result": "success", "outputs": {}}}`),
// prints the result of each job and exits with status 1 unless every job has the result `success`: a failed, skipped or
// cancelled job fails it, and so do RESULTS that is unset, is not JSON or names no job.
import { fileURLToPath } from 'node:url';

/** 0 when every job of `text`, the JSON of `needs`, has the result success, else 1; each line goes to `write`. */
export function passed(text, write = line => console.log(line)) {
  const fail = message => {
    write(`[ci-passed] failed: ${message}`);
    return 1;
  };
  if (text === undefined) return fail('RESULTS is not set; the step passes the JSON of needs: make ci-passed RESULTS=<json>');
  let needs;
  try {
    needs = JSON.parse(text);
  } catch (error) {
    return fail(`RESULTS is not JSON: ${error.message}: ${JSON.stringify(text)}`);
  }
  if (needs === null || typeof needs !== 'object' || Array.isArray(needs) || Object.keys(needs).length === 0) {
    return fail(`RESULTS names no job: ${JSON.stringify(text)}`);
  }
  const failed = [];
  for (const [job, value] of Object.entries(needs)) {
    const result = value !== null && typeof value === 'object' && typeof value.result === 'string' ? value.result : 'no result';
    write(`[ci-passed] ${job}: ${result}`);
    if (result !== 'success') failed.push(`${job} (${result})`);
  }
  if (failed.length) return fail(`${failed.join(', ')}; every needed job must have the result success`);
  write(`[ci-passed] every needed job passed: ${Object.keys(needs).join(', ')}`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = passed(process.env.RESULTS);
