import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ajv, type ValidateFunction } from 'ajv';
import {
  AstProgram,
  Engine,
  MapLoader,
  parseJsonBytes,
  type DefineInput,
  type Env,
  type Template,
} from '@polyspec/template';
import type {
  DefineRegistry,
  Environment,
  JsonObject,
  RenderAdapter,
  RenderRequest,
  RepeatResult,
  Scenario,
} from './generated/render_adapter.ts';
import { assertRenderAdapter, assertRequestShape } from './generated/render_adapter.ts';
import { GeneratedProgram as CompilerCoverageProgram } from './generated/typed/compiler-coverage.ts';
import { GeneratedProgram as EmptyStateProgram } from './generated/typed/empty-state.ts';
import { GeneratedProgram as HtmlSlotProgram } from './generated/typed/html-slot.ts';
import { GeneratedProgram as ReactBoundaryProgram } from './generated/typed/react-boundary.ts';
import { GeneratedProgram as ScopePrecedenceProgram } from './generated/typed/scope-precedence.ts';

function generatedProgram(root: string) {
  switch (basename(root)) {
    case 'compiler-coverage': return new CompilerCoverageProgram();
    case 'empty-state': return new EmptyStateProgram();
    case 'html-slot': return new HtmlSlotProgram();
    case 'react-boundary': return new ReactBoundaryProgram();
    case 'scope-precedence': return new ScopePrecedenceProgram();
    default: throw new Error(`generated program is missing for scenario ${basename(root)}`);
  }
}

function readJson(root: string, name: string): unknown {
  return parseJsonBytes(new Uint8Array(readFileSync(join(root, name))));
}

/** Whether `value` is a JSON object: no array and no null. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The parsed JSON text of a file, unknown until a check reads it. */
function readJsonText(path: string): unknown {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  return value;
}

// A compiled AST artifact holds one Template node of contracts/schema/ast.schema.json, which the AST program loads as it
// is; ajv checks each artifact against that schema. The validator is compiled on the first read, so the generated mode
// does not read the schema.
let validateTemplate: ValidateFunction<Template> | undefined;

function templateOf(value: unknown, path: string): Template {
  if (validateTemplate === undefined) {
    const schemaPath = fileURLToPath(new URL('../../../contracts/schema/ast.schema.json', import.meta.url));
    const schema = readJsonText(schemaPath);
    if (!isRecord(schema)) throw new Error(schemaPath + ' is no JSON object');
    validateTemplate = new Ajv({ strict: true }).compile<Template>(schema);
  }
  if (!validateTemplate(value)) throw new Error(path + ' is no Template of the AST schema: ' + JSON.stringify(validateTemplate.errors));
  return value;
}

function readArtifactTemplates(root: string): Map<string, Template> {
  const artifactRoot = join(root, 'compiled', 'ast');
  const manifestPath = join(artifactRoot, 'manifest.json');
  const manifest = readJsonText(manifestPath);
  const files = isRecord(manifest) ? manifest.files : undefined;
  if (!isRecord(files)) throw new Error(manifestPath + ' has no files object');
  const templates = new Map<string, Template>();
  for (const [name, entry] of Object.entries(files)) {
    const path = isRecord(entry) ? entry.path : undefined;
    if (typeof path !== 'string') throw new Error(manifestPath + ': files.' + name + '.path must be a string');
    const templatePath = join(artifactRoot, path);
    templates.set(name, templateOf(readJsonText(templatePath), templatePath));
  }
  return templates;
}

function objectValue(value: unknown, name: string): JsonObject {
  if (!(value instanceof Map)) throw new Error(name + ' must be an object');
  return value as JsonObject;
}

function stringField(object: JsonObject, name: string): string {
  const value = object.get(name);
  if (typeof value !== 'string') throw new Error(name + ' must be a string');
  return value;
}

function numberField(object: JsonObject, name: string): number {
  const value = object.get(name);
  if (typeof value !== 'number') throw new Error(name + ' must be a number');
  return value;
}

function defineValue(value: unknown): DefineRegistry {
  const object = objectValue(value, 'define.json');
  const define: DefineRegistry = new Map();
  for (const [id, raw] of object) {
    if (typeof raw === 'string') {
      define.set(id, { template: raw });
      continue;
    }
    const entry = objectValue(raw, 'define.' + id);
    const template = entry.get('template');
    const html = entry.get('html');
    const data = entry.get('data');
    const hasTemplate = typeof template === 'string';
    const hasHtml = typeof html === 'string';
    if (hasTemplate === hasHtml) throw new Error('define.' + id + ' needs one variant');
    if (data !== undefined && !(data instanceof Map)) throw new Error('define.' + id + '.data must be an object');
    if (hasHtml) {
      if (data !== undefined) throw new Error('define.' + id + '.html cannot have data');
      define.set(id, { html });
    } else if (hasTemplate) {
      define.set(id, data === undefined ? { template } : { template, data });
    }
  }
  return define;
}

function environmentValue(value: unknown): Environment {
  const object = objectValue(value, 'env.json');
  for (const key of object.keys()) {
    if (key !== 'timezone' && key !== 'now') throw new Error('env.json has an unknown field: ' + key);
  }
  return {
    ...(object.has('timezone') ? { timezone: stringField(object, 'timezone') } : {}),
    ...(object.has('now') ? { now: numberField(object, 'now') } : {}),
  };
}

function engineDefines(define: DefineRegistry): Record<string, DefineInput> {
  const result: Record<string, DefineInput> = {};
  for (const [id, entry] of define) result[id] = entry;
  return result;
}

export class Adapter implements RenderAdapter {
  private readonly root: string;
  private readonly engine: Engine;

  constructor(root: string) {
    this.root = root;
    const generated = process.env.SHOWCASE_EXECUTION_MODE === 'generated';
    this.engine = new Engine(generated
      ? generatedProgram(root)
      : new AstProgram({ loader: new MapLoader(readArtifactTemplates(root)) }));
  }

  loadScenario(): Scenario {
    const metadata = objectValue(readJson(this.root, 'scenario.json'), 'scenario.json');
    return {
      target: stringField(metadata, 'target'),
      assign: objectValue(readJson(this.root, 'data.json'), 'data.json'),
      define: defineValue(readJson(this.root, 'define.json')),
      ...(existsSync(join(this.root, 'env.json')) ? { env: environmentValue(readJson(this.root, 'env.json')) } : {}),
    };
  }

  buildRequest(scenario: Readonly<Scenario>): RenderRequest {
    return {
      target: scenario.target,
      assign: scenario.assign,
      define: scenario.define,
      ...(scenario.env === undefined ? {} : { env: scenario.env }),
    };
  }

  render(request: Readonly<RenderRequest>): string {
    const options: { define: Record<string, DefineInput>; env?: Partial<Env> } = {
      define: engineDefines(request.define),
    };
    if (request.env !== undefined) options.env = request.env;
    return this.engine.render(request.target, request.assign, options);
  }

  prepare(request: Readonly<RenderRequest>) {
    const options: { define: Record<string, DefineInput>; env?: Partial<Env> } = {
      define: engineDefines(request.define),
    };
    if (request.env !== undefined) options.env = request.env;
    return this.engine.prepare(request.target, request.assign, options);
  }

  renderTwice(request: Readonly<RenderRequest>): RepeatResult {
    return { first: this.render(request), second: this.render(request) };
  }
}

function plain(value: unknown): unknown {
  if (value instanceof Map) {
    return Object.fromEntries([...value].map(([key, item]) => [key, plain(item)]));
  }
  if (Array.isArray(value)) return value.map(plain);
  if (value !== null && typeof value === 'object') {
    if ('template' in value && typeof value.template === 'string' && (!('data' in value) || value.data === undefined)) return value.template;
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) result[key] = plain(item);
    return result;
  }
  return value;
}

function digest(value: string): { bytes: number; sha256: string } {
  return {
    bytes: Buffer.byteLength(value, 'utf8'),
    sha256: createHash('sha256').update(value, 'utf8').digest('hex'),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2];
  if (root === undefined) throw new Error('usage: node typescript.ts SCENARIO_DIR');
  const adapter = new Adapter(root);
  assertRenderAdapter(adapter);
  const request = assertRequestShape(adapter.buildRequest(adapter.loadScenario()));
  const benchmarkIterations = Number(process.env.SHOWCASE_BENCH_ITERATIONS ?? 0);
  if (benchmarkIterations > 0) {
    const warmup = Number(process.env.SHOWCASE_BENCH_WARMUP ?? 0);
    for (let index = 0; index < warmup; index += 1) adapter.render(request);
    let output = '';
    const started = process.hrtime.bigint();
    for (let index = 0; index < benchmarkIterations; index += 1) output = adapter.render(request);
    const renderSeconds = Number(process.hrtime.bigint() - started) / 1e9;
    const measured = digest(output);
    const repeated = digest(adapter.render(request));
    const prepared = adapter.prepare(request);
    let preparedOutput = '';
    const preparedStarted = process.hrtime.bigint();
    for (let index = 0; index < benchmarkIterations; index += 1) preparedOutput = prepared.render();
    const preparedRenderSeconds = Number(process.hrtime.bigint() - preparedStarted) / 1e9;
    const preparedMeasured = digest(preparedOutput);
    process.stdout.write(JSON.stringify({
      language: 'typescript', iterations: benchmarkIterations, renderSeconds, preparedRenderSeconds,
      bytes: measured.bytes, outputSha256: measured.sha256, repeatSha256: repeated.sha256,
      preparedSha256: preparedMeasured.sha256,
    }) + '\n');
    process.exit(0);
  }
  const result = adapter.renderTwice(request);
  const requestBeforeFailure = JSON.stringify(plain(request));
  let failureObserved = false;
  try {
    adapter.render({ ...request, target: '__contract_missing_target__' });
  } catch {
    failureObserved = true;
  }
  const recovered = digest(adapter.render(request));
  const first = digest(result.first);
  const second = digest(result.second);
  const requestUnchanged = JSON.stringify(plain(request)) === requestBeforeFailure;
  process.stdout.write(JSON.stringify({
    language: 'typescript',
    type: 'Adapter',
    operations: ['loadScenario', 'buildRequest', 'render', 'renderTwice'],
    request: plain(request),
    bytes: first.bytes,
    firstSha256: first.sha256,
    secondSha256: second.sha256,
    failureObserved,
    requestUnchanged,
    recoveredSha256: recovered.sha256,
  }) + '\n');
}
