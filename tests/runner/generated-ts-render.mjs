// Worker of the TypeScript generated conformance runner: renders one compiled case and posts the
// output or the error, so the runner can stop a render that does not end.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parentPort, workerData } from 'node:worker_threads';
import { parseJsonBytes } from '../../packages/template-ts/dist/index.mjs';

function plain(value) {
  if (value instanceof Map) return Object.fromEntries([...value].map(([key, item]) => [key, plain(item)]));
  if (Array.isArray(value)) return value.map(plain);
  return value;
}

const { module, dir, hasData, hasDefine, hasEnv } = workerData;
try {
  const { GeneratedProgram } = await import(pathToFileURL(module).href);
  const assign = hasData ? parseJsonBytes(readFileSync(join(dir, 'data.json'))) : new Map();
  const define = hasDefine ? plain(parseJsonBytes(readFileSync(join(dir, 'define.json')))) : {};
  const env = hasEnv ? plain(parseJsonBytes(readFileSync(join(dir, 'env.json')))) : undefined;
  parentPort.postMessage({ html: new GeneratedProgram().render('input.tpl', assign, { define, env }) });
} catch (error) {
  parentPort.postMessage({ error: { code: error?.code, template: error?.template, line: error?.line, col: error?.col, message: error?.message ?? String(error) } });
}
