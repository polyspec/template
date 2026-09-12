#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadSourceGraph, lowerSourceGraph } from './ir.mjs';
import * as typescript from './backends/typescript.mjs';
import * as go from './backends/go.mjs';
import * as rust from './backends/rust.mjs';
import * as php from './backends/php.mjs';

const backends = new Map([typescript, go, rust, php].map(backend => [backend.language, backend]));

export function compileSource(graphPath, manifestPath, language) {
  const backend = backends.get(language);
  if (backend === undefined) throw new Error(`compiler: unsupported target language ${language}`);
  if (typeof backend.createTarget !== 'function' || typeof backend.emitProgram !== 'function') {
    throw new Error(`compiler: backend ${language} does not implement createTarget and emitProgram`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const program = lowerSourceGraph(loadSourceGraph(graphPath), manifest);
  return backend.emitProgram(program, manifest, backend.createTarget());
}

export function updateArtifact(output, source, check) {
  if (check) {
    if (!existsSync(output) || readFileSync(output, 'utf8') !== source) throw new Error(`compiler artifact is stale: ${output}`);
    return;
  }
  mkdirSync(dirname(output), { recursive: true });
  const temporary = `${output}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, source);
    renameSync(temporary, output);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function main(args) {
  const value = name => { const index = args.indexOf(name); return index < 0 ? null : args[index + 1]; };
  const graph = value('--graph');
  const manifest = value('--manifest');
  const language = value('--lang');
  const output = value('--output');
  const check = args.includes('--check');
  if (!graph || !manifest || !language || !output) {
    throw new Error('usage: compiler.mjs --graph MANIFEST --manifest FILE --lang ts|go|rust|php --output FILE [--check]');
  }
  const source = compileSource(graph, manifest, language);
  updateArtifact(output, source, check);
  process.stdout.write(`compiler ${language}: ${check ? 'checked' : 'generated'} ${output}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
