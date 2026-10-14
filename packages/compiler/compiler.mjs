#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadSourceGraph, lowerSourceGraph } from './ir.mjs';
import { templateBodies, usedCode, usedFiles } from './backend-support.mjs';
import { compileGeneratedArtifact } from './generated-artifact.mjs';
import { generatedCompilerDigest } from './compiler-digest.mjs';
import * as typescript from './backends/typescript.mjs';
import * as go from './backends/go.mjs';
import * as rust from './backends/rust.mjs';
import * as php from './backends/php.mjs';
import * as python from './backends/python.mjs';

const backends = new Map([typescript, go, rust, php, python].map(backend => [backend.language, backend]));
const backendOperations = ['emitDeclarations', 'emitRuntime', 'emitTemplates', 'emitEntry'];

// A PHP namespace is one or more identifiers separated by a backslash (docs/spec/compiler.md).
const phpNamespacePattern = /^[A-Za-z_][A-Za-z0-9_]*(\\[A-Za-z_][A-Za-z0-9_]*)*$/;

// The PHP target writes one PSR-4 file per class (T25.1); every other target writes one file.
export const FILE_PER_CLASS_TARGETS = ['php'];

function compileParts(graphPath, manifestPath, language, options) {
  const backend = backends.get(language);
  if (backend === undefined) throw new Error(`compiler: unsupported target language ${language}`);
  if (language === 'php' && !phpNamespacePattern.test(options.phpNamespace ?? '')) {
    throw new Error(`compiler: the PHP target requires a namespace; ${JSON.stringify(options.phpNamespace ?? null)} is not a PHP namespace`);
  }
  if (typeof backend.createTarget !== 'function') throw new Error(`compiler: backend ${language} does not implement createTarget`);
  for (const operation of backendOperations) if (typeof backend[operation] !== 'function') throw new Error(`compiler: backend ${language} does not implement ${operation}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const program = lowerSourceGraph(loadSourceGraph(graphPath), manifest);
  const target = backend.createTarget({ program, manifest });
  const context = { program, manifest, options, target, templateBodies: templateBodies(program, target) };
  // An operation returns its code, or a list of code, definitions and file starts that the program keeps only when it
  // uses them.
  return backendOperations.flatMap(operation => backend[operation](context));
}

/**
 * The source of a target that writes one file.
 * @param {string} graphPath
 * @param {string} manifestPath
 * @param {string} language
 * @param {{ phpNamespace?: string }} [options]
 * @returns {string}
 */
export function compileSource(graphPath, manifestPath, language, options = {}) {
  if (FILE_PER_CLASS_TARGETS.includes(language)) throw new Error(`compiler: the ${language} target writes one file per class; compileFiles returns them`);
  return `${usedCode(compileParts(graphPath, manifestPath, language, options))}\n`;
}

/**
 * The files of a target that writes one file per class, by their paths under the output directory.
 * @param {string} graphPath
 * @param {string} manifestPath
 * @param {string} language
 * @param {{ phpNamespace?: string }} [options]
 */
export function compileFiles(graphPath, manifestPath, language, options = {}) {
  if (!FILE_PER_CLASS_TARGETS.includes(language)) throw new Error(`compiler: the ${language} target writes one file; compileSource returns it`);
  return usedFiles(compileParts(graphPath, manifestPath, language, options));
}

function main(args) {
  const value = name => { const index = args.indexOf(name); return index < 0 ? null : args[index + 1]; };
  const graph = value('--graph');
  const manifest = value('--manifest');
  const language = value('--lang');
  const output = value('--output');
  const refresh = value('--refresh');
  const phpNamespace = value('--php-namespace');
  const check = args.includes('--check');
  if (!graph || !manifest || !language || !output || !refresh) {
    throw new Error('usage: compiler.mjs --graph MANIFEST --manifest FILE --lang ts|go|rust|php|python --output FILE|DIRECTORY --refresh dev|true|false [--php-namespace NAMESPACE] [--check]');
  }
  compileGeneratedArtifact({
    graphPath: graph,
    typeManifestPath: manifest,
    target: language,
    output,
    refresh,
    check,
    compilerDigest: generatedCompilerDigest(language),
    compile: () => FILE_PER_CLASS_TARGETS.includes(language) ? compileFiles(graph, manifest, language, { phpNamespace }) : compileSource(graph, manifest, language),
  });
  process.stdout.write(`compiler ${language}: ${check ? 'checked' : refresh === 'false' ? 'loaded' : 'ready'} ${output}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
