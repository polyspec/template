// The workflows of template, parsed with the yaml package, for the tool tests that check them: the files that the
// repository owns (a workflow that kit copies, kit.copies of @polyspec/kit, is kit's, and make kit-check compares it),
// their jobs with their steps, and the action pins with their version comments.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { JSONSchemaType } from 'ajv';
import { isPair, isScalar, LineCounter, parseDocument, visit } from 'yaml';
import { jsonDocument } from '../../scripts/json-document.mts';
import { isJsonObject, yamlObject } from '../runner/checked.mts';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const KIT_PACKAGE_SCHEMA: JSONSchemaType<{ kit: { copies: Record<string, string> } }> = {
  type: 'object',
  properties: {
    kit: { type: 'object', properties: { copies: { type: 'object', required: [], additionalProperties: { type: 'string' } } }, required: ['copies'] },
  },
  required: ['kit'],
};

/** The files that @polyspec/kit copies into the repository (kit.copies of its package.json). */
const KIT_COPIES = new Set(Object.keys(jsonDocument<{ kit: { copies: Record<string, string> } }>('package.json of @polyspec/kit', KIT_PACKAGE_SCHEMA)
  .read(fileURLToPath(import.meta.resolve('@polyspec/kit/package.json'))).kit.copies));

/** The workflows of template, without the ones that kit copies. */
export const WORKFLOWS = readdirSync(path.join(ROOT, '.github/workflows')).filter(name => name.endsWith('.yml'))
  .map(name => `.github/workflows/${name}`).filter(file => !KIT_COPIES.has(file));

/** A step of a job with the fields that the tests read. */
interface Step {
  name?: string;
  run?: string;
  uses?: string;
  if?: string;
  with: Record<string, unknown>;
}

/** A job of a workflow: its name, its mapping and its steps; a job that calls a reusable workflow has no steps. */
export interface Job {
  name: string;
  value: Record<string, unknown>;
  steps: Step[];
}

function stepOf(value: unknown, where: string): Step {
  if (!isJsonObject(value)) throw new Error(`${where} is no mapping`);
  const step: Step = { with: {} };
  for (const key of ['name', 'run', 'uses', 'if'] as const) {
    const field = value[key];
    if (field === undefined) continue;
    if (typeof field !== 'string') throw new Error(`${where}: ${key} is no string`);
    step[key] = field;
  }
  if (value.with !== undefined) {
    if (!isJsonObject(value.with)) throw new Error(`${where}: with is no mapping`);
    step.with = value.with;
  }
  return step;
}

/** The workflow YAML `text` as a mapping; `where` names it in an error. */
export function workflowOf(text: string, where: string): Record<string, unknown> {
  return yamlObject(text, where);
}

/** The jobs of the workflow YAML `text`. */
export function jobsOf(text: string, where = 'the workflow'): Job[] {
  const workflow = workflowOf(text, where);
  if (!isJsonObject(workflow.jobs)) throw new Error(`${where} has no jobs`);
  return Object.entries(workflow.jobs).map(([name, value]) => {
    if (!isJsonObject(value)) throw new Error(`${where}: the job ${name} is no mapping`);
    if (value.steps === undefined) return { name, value, steps: [] };
    if (!Array.isArray(value.steps)) throw new Error(`${where}: the steps of the job ${name} are no list`);
    return { name, value, steps: value.steps.map((step, index) => stepOf(step, `${where}: step ${index + 1} of the job ${name}`)) };
  });
}

/** The jobs of the workflow `file` of the repository. */
export function jobs(file: string): Job[] {
  return jobsOf(readFileSync(path.join(ROOT, file), 'utf8'), file);
}

/** The string field `key` of a job, or undefined when the job does not set it; another type is an error. */
export function jobField(job: Job, key: string): string | undefined {
  const value = job.value[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`the job ${job.name}: ${key} is no string`);
  return value;
}

/** The commands of the run steps of a job, in their order. */
export function runsOf(job: Job): string[] {
  return job.steps.flatMap(step => (step.run === undefined ? [] : [step.run]));
}

/** The lines of the run steps of a job, each trimmed, without the empty ones. */
export function runLines(job: Job): string[] {
  return runsOf(job).flatMap(run => run.split('\n').map(line => line.trim()).filter(Boolean));
}

/** An action pin of a workflow: the `uses` value at its line, and the comment after it, without the leading space. */
export interface Pin {
  file: string;
  line: number;
  uses: string;
  comment: string | null;
}

/** The action pins of the workflow `file`. */
export function pinsOf(file: string): Pin[] {
  const lines = new LineCounter();
  const document = parseDocument(readFileSync(path.join(ROOT, file), 'utf8'), { lineCounter: lines });
  const found: Pin[] = [];
  visit(document, {
    Pair(_key, pair) {
      if (!isPair(pair) || !isScalar(pair.key) || pair.key.value !== 'uses') return;
      if (!isScalar(pair.value) || typeof pair.value.value !== 'string') throw new Error(`${file}: a uses value is no string`);
      const range = pair.value.range;
      if (!range) throw new Error(`${file}: the uses value ${pair.value.value} has no position`);
      found.push({ file, line: lines.linePos(range[0]).line, uses: pair.value.value, comment: pair.value.comment?.trim() ?? null });
    },
  });
  return found;
}
