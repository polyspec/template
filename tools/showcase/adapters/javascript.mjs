import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AstProgram, Engine, MapLoader, parseJsonBytes } from '../../../packages/template-ts/dist/index.mjs';
import { assertRenderAdapter, assertRequestShape } from './generated/render_adapter.mjs';
import { GeneratedProgram } from './generated/native_direct.mjs';

/** @typedef {Map<string, unknown>} JsonObject */
/** @typedef {{ template: string, data?: JsonObject } | { html: string }} DefineEntry */
/** @typedef {{ timezone?: string, now?: number }} Environment */
/** @typedef {{ target: string, assign: JsonObject, define: Map<string, string | DefineEntry>, env?: Environment }} Scenario */
/** @typedef {{ target: string, assign: JsonObject, define: Map<string, string | DefineEntry>, env?: Environment }} RenderRequest */
/** @typedef {{ first: string, second: string }} RepeatResult */

function readJson(root, name) {
  return parseJsonBytes(new Uint8Array(readFileSync(join(root, name))));
}

function readArtifactTemplates(root, language) {
  const artifactRoot = join(root, 'compiled', language);
  const manifest = JSON.parse(readFileSync(join(artifactRoot, 'manifest.json'), 'utf8'));
  const templates = new Map();
  for (const [name, entry] of Object.entries(manifest.templates)) {
    templates.set(name, JSON.parse(readFileSync(join(artifactRoot, entry.artifact), 'utf8')));
  }
  return templates;
}

function objectValue(value, name) {
  if (!(value instanceof Map)) throw new Error(name + ' must be an object');
  return value;
}

function stringField(object, name) {
  const value = object.get(name);
  if (typeof value !== 'string') throw new Error(name + ' must be a string');
  return value;
}

function numberField(object, name) {
  const value = object.get(name);
  if (typeof value !== 'number') throw new Error(name + ' must be a number');
  return value;
}

function booleanField(object, name) {
  const value = object.get(name);
  if (typeof value !== 'boolean') throw new Error(name + ' must be a boolean');
  return value;
}

function defineValue(value) {
  const object = objectValue(value, 'define.json');
  const define = new Map();
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
    if (hasHtml && data !== undefined) throw new Error('define.' + id + '.html cannot have data');
    define.set(id, hasTemplate
      ? (data === undefined ? { template } : { template, data })
      : { html });
  }
  return define;
}

function environmentValue(value) {
  const object = objectValue(value, 'env.json');
  for (const key of object.keys()) {
    if (key !== 'timezone' && key !== 'now') throw new Error('env.json has an unknown field: ' + key);
  }
  const environment = {};
  if (object.has('timezone')) environment.timezone = stringField(object, 'timezone');
  if (object.has('now')) environment.now = numberField(object, 'now');
  return environment;
}

function engineDefines(define) {
  const result = {};
  for (const [id, entry] of define) result[id] = entry;
  return result;
}

export class Adapter {
  constructor(root) {
    this.root = root;
    const generated = process.env.SHOWCASE_EXECUTION_MODE === 'generated';
    this.engine = new Engine(generated
      ? new GeneratedProgram(root)
      : new AstProgram({ loader: new MapLoader(readArtifactTemplates(root, 'typescript')) }));
  }

  loadScenario() {
    const metadata = objectValue(readJson(this.root, 'scenario.json'), 'scenario.json');
    const scenario = {
      target: stringField(metadata, 'target'),
      assign: objectValue(readJson(this.root, 'data.json'), 'data.json'),
      define: defineValue(readJson(this.root, 'define.json')),
    };
    if (existsSync(join(this.root, 'env.json'))) {
      scenario.env = environmentValue(readJson(this.root, 'env.json'));
    }
    return scenario;
  }

  buildRequest(scenario) {
    return {
      target: scenario.target,
      assign: scenario.assign,
      define: scenario.define,
      ...(scenario.env === undefined ? {} : { env: scenario.env }),
    };
  }

  render(request) {
    const options = { define: engineDefines(request.define) };
    if (request.env !== undefined) options.env = request.env;
    return this.engine.render(request.target, request.assign, options);
  }

  renderTwice(request) {
    return { first: this.render(request), second: this.render(request) };
  }
}

function plain(value) {
  if (value instanceof Map) {
    return Object.fromEntries([...value].map(([key, item]) => [key, plain(item)]));
  }
  if (Array.isArray(value)) return value.map(plain);
  if (value !== null && typeof value === 'object') {
    if ('template' in value && typeof value.template === 'string' && value.data === undefined) return value.template;
    const result = {};
    for (const [key, item] of Object.entries(value)) result[key] = plain(item);
    return result;
  }
  return value;
}

function digest(text) {
  return {
    bytes: Buffer.byteLength(text, 'utf8'),
    sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2];
  if (!root) throw new Error('usage: node javascript.mjs SCENARIO_DIR');
  const adapter = assertRenderAdapter(new Adapter(root));
  const request = assertRequestShape(adapter.buildRequest(adapter.loadScenario()));
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
    language: 'javascript',
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
