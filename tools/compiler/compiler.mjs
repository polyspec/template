#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadSourceGraph, lowerSourceGraph } from './ir.mjs';
import { templateBodies } from './backend-support.mjs';
import { compileGeneratedArtifact } from './generated-artifact.mjs';
import * as typescript from './backends/typescript.mjs';
import * as go from './backends/go.mjs';
import * as rust from './backends/rust.mjs';
import * as php from './backends/php.mjs';

const backends = new Map([typescript, go, rust, php].map(backend => [backend.language, backend]));
const backendOperations = ['emitDeclarations', 'emitRuntime', 'emitTemplates', 'emitEntry'];

export function compileSource(graphPath, manifestPath, language) {
  const backend = backends.get(language);
  if (backend === undefined) throw new Error(`compiler: unsupported target language ${language}`);
  if (typeof backend.createTarget !== 'function') throw new Error(`compiler: backend ${language} does not implement createTarget`);
  for (const operation of backendOperations) if (typeof backend[operation] !== 'function') throw new Error(`compiler: backend ${language} does not implement ${operation}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const program = lowerSourceGraph(loadSourceGraph(graphPath), manifest);
  const target = backend.createTarget();
  const context = { program, manifest, target, templateBodies: templateBodies(program, target) };
  return [...backendOperations.map(operation => backend[operation](context)), ''].join('\n');
}

function main(args) {
  const value = name => { const index = args.indexOf(name); return index < 0 ? null : args[index + 1]; };
  const graph = value('--graph');
  const manifest = value('--manifest');
  const language = value('--lang');
  const output = value('--output');
  const refresh = value('--refresh');
  const check = args.includes('--check');
  if (!graph || !manifest || !language || !output || !refresh) {
    throw new Error('usage: compiler.mjs --graph MANIFEST --manifest FILE --lang ts|go|rust|php --output FILE --refresh dev|true|false [--check]');
  }
  compileGeneratedArtifact({
    graphPath: graph,
    typeManifestPath: manifest,
    target: language,
    output,
    refresh,
    check,
    compile: () => compileSource(graph, manifest, language),
  });
  process.stdout.write(`compiler ${language}: ${check ? 'checked' : refresh === 'false' ? 'loaded' : 'ready'} ${output}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
