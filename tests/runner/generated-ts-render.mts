// Worker of the TypeScript generated conformance runner: renders one compiled case and posts the
// output or the error, so the runner can stop a render that does not end.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parentPort, workerData } from 'node:worker_threads';
import { BindError, parseJsonBytes } from '../../packages/ts/dist/index.mjs';

/** The case that the runner passes as workerData. */
export interface RenderCase {
  module: string;
  dir: string;
  hasData: boolean;
  hasDefine: boolean;
  hasEnv: boolean;
}

/** The message that the worker posts: the rendered HTML or the fields of the error. */
export type RenderMessage =
  | { html: string }
  | { error: { code: unknown; template: unknown; line: unknown; col: unknown; message: unknown } };

function plain(value: unknown): unknown {
  if (value instanceof Map) return Object.fromEntries([...value].map(([key, item]) => [key, plain(item)]));
  if (Array.isArray(value)) return value.map(plain);
  return value;
}

/** Whether the workerData of the runner is a RenderCase. */
function isRenderCase(value: unknown): value is RenderCase {
  if (typeof value !== 'object' || value === null) return false;
  const fields = (name: string) => Reflect.get(value, name);
  return typeof fields('module') === 'string' && typeof fields('dir') === 'string'
    && ['hasData', 'hasDefine', 'hasEnv'].every(name => typeof fields(name) === 'boolean');
}

const data: unknown = workerData;
if (!isRenderCase(data)) throw new Error(`the workerData of generated-ts-render.mts is no case: ${JSON.stringify(data)}`);
const { module, dir, hasData, hasDefine, hasEnv } = data;
if (parentPort === null) throw new Error('generated-ts-render.mts runs as a worker of conformance-generated-ts.mts, which has no parent port here');
const port = parentPort;

/** The field `name` of a thrown value, or undefined when it has none. */
function field(error: unknown, name: string): unknown {
  return typeof error === 'object' && error !== null && name in error ? Reflect.get(error, name) : undefined;
}

function post(message: RenderMessage): void {
  port.postMessage(message);
}

// The inputs of the case. A data error of data.json, define.json or env.json is the error of the template input.tpl
// without a position, as the command line of the conformance contract reports it (CNF-4), and the program never runs.
function inputs(): { assign: unknown; define: unknown; env: unknown } | null {
  try {
    return {
      assign: hasData ? parseJsonBytes(readFileSync(join(dir, 'data.json'))) : new Map(),
      define: hasDefine ? plain(parseJsonBytes(readFileSync(join(dir, 'define.json')))) : {},
      env: hasEnv ? plain(parseJsonBytes(readFileSync(join(dir, 'env.json')))) : undefined,
    };
  } catch (error) {
    if (!(error instanceof BindError)) throw error;
    post({ error: { code: error.code, template: 'input.tpl', line: 0, col: 0, message: error.message } });
    return null;
  }
}

try {
  const { GeneratedProgram } = await import(pathToFileURL(module).href);
  const request = inputs();
  if (request !== null) post({ html: new GeneratedProgram().render('input.tpl', request.assign, { define: request.define, env: request.env }) });
} catch (error) {
  post({ error: { code: field(error, 'code'), template: field(error, 'template'), line: field(error, 'line'), col: field(error, 'col'), message: field(error, 'message') ?? String(error) } });
}
