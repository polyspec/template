#!/usr/bin/env node
// The push gate (T17.1-3). A push happens only when no task of the checklist is `[~]` (AGENTS): CI runs the full suite on
// the pushed tree, and its guard scripts/full-run.mjs refuses a tree with a task in progress. The gate reads the
// checklist with `activeItems` of the guard:
//
//   node scripts/push-gate.mjs hook          the pre-push hook .githooks/pre-push: reads the lines
//                                            `<local ref> <local sha> <remote ref> <remote sha>` of Git on standard
//                                            input and refuses the push while the checklist of a pushed commit or of
//                                            the working tree has a task in progress, or when it cannot read one
//   node scripts/push-gate.mjs commit <rev>  the job push-gate of .github/workflows/push-gate.yml: fails while the
//                                            checklist of the commit has a task in progress or the commit does not
//                                            track .githooks/pre-push with mode 100755; prints each line also as a
//                                            GitHub annotation and appends it to $GITHUB_STEP_SUMMARY when it is set
//   node scripts/push-gate.mjs hooks-check   fails while core.hooksPath is not .githooks or the hook is not executable
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { activeItems, CHECKLIST } from './full-run.mjs';
import { hooksIssue, PRE_PUSH } from './git-hooks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const USAGE = 'Usage: node scripts/push-gate.mjs hook | commit <rev> | hooks-check';
const NO_OBJECT = /^0+$/;

const REASON = 'A push happens only when no checklist task is [~] (AGENTS.md): CI runs the full suite on every pull request and every merge group of the merge queue, and its guard refuses a tree with a task in progress.';
const ADVICE = 'Complete each task ([o] with its changelog entry, committed), or mark it [!] with its cause and retry condition when it must be bypassed; then push again.';

function git(root, ...args) {
  const run = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${run.stderr.trim()}`);
  return run.stdout;
}

/**
 * Inspects the checklists of `sources`, each `{ where, read }` where `read()` returns the text of a checklist or throws
 * why it cannot. Returns the lines of the refusal, or an empty array when no task is in progress.
 */
export function inspect(sources) {
  const active = [];
  const unreadable = [];
  for (const { where, read } of sources) {
    try {
      for (const item of activeItems(read())) active.push(`  ${where}: ${item.id} ${item.title}`);
    } catch (error) {
      unreadable.push(`  ${where}: ${error.message}`);
    }
  }
  const lines = [];
  if (unreadable.length > 0) lines.push(`push refused: the push gate cannot read the checklist (${CHECKLIST})`, ...unreadable, 'The gate refuses a push whose checklist it cannot read; fix the cause and push again.');
  if (active.length > 0) lines.push(`push refused: checklist tasks are in progress (${CHECKLIST})`, ...active, REASON, ADVICE);
  return lines;
}

// The checklist of a commit, or an error that names the missing file.
function committed(root, sha) {
  return () => {
    const run = spawnSync('git', ['show', `${sha}:${CHECKLIST}`], { cwd: root, encoding: 'utf8' });
    if (run.error) throw run.error;
    if (run.status !== 0) throw new Error(`the commit has no ${CHECKLIST}: ${run.stderr.trim()}`);
    return run.stdout;
  };
}

/** The refusal lines of a push: `input` holds the lines that Git passes to the pre-push hook. */
export function hook(root, input) {
  const sources = [];
  for (const line of input.split('\n').filter(Boolean)) {
    const [localRef, localSha] = line.split(' ');
    if (!localSha || NO_OBJECT.test(localSha)) continue;
    sources.push({ where: `${localRef} ${localSha.slice(0, 7)}`, read: committed(root, localSha) });
  }
  sources.push({
    where: 'working tree',
    read: () => {
      const file = path.join(root, CHECKLIST);
      if (!existsSync(file)) throw new Error(`${CHECKLIST} does not exist`);
      return readFileSync(file, 'utf8');
    },
  });
  return inspect(sources);
}

/** The failure lines of the commit `rev` in CI, or an empty array. */
export function commit(root, rev) {
  const sha = git(root, 'rev-parse', '--verify', `${rev}^{commit}`).trim();
  const lines = inspect([{ where: `commit ${sha.slice(0, 7)}`, read: committed(root, sha) }]);
  const entry = git(root, 'ls-tree', sha, '--', PRE_PUSH).trim();
  if (!entry) lines.push(`push gate failed: ${PRE_PUSH} is not tracked in commit ${sha.slice(0, 7)}, so a checkout of it has no pre-push hook; restore the hook`);
  else if (!entry.startsWith('100755 ')) lines.push(`push gate failed: ${PRE_PUSH} is tracked with mode ${entry.split(' ')[0]}, not 100755, in commit ${sha.slice(0, 7)}, so Git does not run it; restore its mode with git update-index --chmod=+x ${PRE_PUSH}`);
  return { sha, lines };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === 'hook' && args.length === 0) {
    let lines;
    try {
      lines = hook(ROOT, readFileSync(0, 'utf8'));
    } catch (error) {
      lines = [`push refused: the push gate failed: ${error.message}`];
    }
    for (const line of lines) console.error(line);
    process.exitCode = lines.length > 0 ? 1 : 0;
  } else if (mode === 'commit' && args.length === 1) {
    const { sha, lines } = commit(ROOT, args[0]);
    for (const line of lines) {
      console.error(line);
      console.log(`::error::${line}`);
    }
    if (lines.length > 0 && process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Push gate\n\n\`\`\`\n${lines.join('\n')}\n\`\`\`\n`);
    if (lines.length === 0) console.log(`[push-gate] commit ${sha.slice(0, 7)}: no checklist task is in progress and ${PRE_PUSH} is tracked with mode 100755`);
    process.exitCode = lines.length > 0 ? 1 : 0;
  } else if (mode === 'hooks-check' && args.length === 0) {
    const issue = hooksIssue(ROOT);
    if (issue) console.error(`[push-gate] the pre-push hook is not installed: ${issue}`);
    else console.log(`[push-gate] the pre-push hook ${PRE_PUSH} is installed: core.hooksPath is .githooks`);
    process.exitCode = issue ? 1 : 0;
  } else {
    console.error(USAGE);
    process.exitCode = 2;
  }
}
