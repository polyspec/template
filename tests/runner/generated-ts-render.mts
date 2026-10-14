// Worker of the TypeScript generated conformance runner: renders one compiled case and posts the
// output or the error, so the runner can stop a render that does not end.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parentPort, workerData } from 'node:worker_threads';
import { parseJsonBytes } from '../../packages/ts/dist/index.mjs';

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

const data: RenderCase = workerData;
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

try {
  const { GeneratedProgram } = await import(pathToFileURL(module).href);
  const assign = hasData ? parseJsonBytes(readFileSync(join(dir, 'data.json'))) : new Map();
  const define = hasDefine ? plain(parseJsonBytes(readFileSync(join(dir, 'define.json')))) : {};
  const env = hasEnv ? plain(parseJsonBytes(readFileSync(join(dir, 'env.json')))) : undefined;
  post({ html: new GeneratedProgram().render('input.tpl', assign, { define, env }) });
} catch (error) {
  post({ error: { code: field(error, 'code'), template: field(error, 'template'), line: field(error, 'line'), col: field(error, 'col'), message: field(error, 'message') ?? String(error) } });
}
