#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { loadSourceGraph, lowerSourceGraph } from './ir.mts';
import { templateBodies, usedCode, usedFiles, type Backend, type CompileOptions, type Part } from './backend-support.mts';
import { typeManifestDocument } from './documents.mts';
import { compileGeneratedArtifact } from './generated-artifact.mts';
import { generatedCompilerDigest } from './compiler-digest.mts';
import * as typescript from './backends/typescript.mts';
import * as go from './backends/go.mts';
import * as rust from './backends/rust.mts';
import * as php from './backends/php.mts';
import * as python from './backends/python.mts';

const backends = new Map(([typescript, go, rust, php, python] satisfies Backend[]).map((backend): [string, Backend] => [backend.language, backend]));

// A PHP namespace is one or more identifiers separated by a backslash (docs/spec/compiler.md).
const phpNamespacePattern = /^[A-Za-z_][A-Za-z0-9_]*(\\[A-Za-z_][A-Za-z0-9_]*)*$/;

// The PHP target writes one PSR-4 file per class (T25.1); every other target writes one file.
export const FILE_PER_CLASS_TARGETS = ['php'];

function compileParts(graphPath: string, manifestPath: string, language: string, options: CompileOptions): Part[] {
  const backend = backends.get(language);
  if (backend === undefined) throw new Error(`compiler: unsupported target language ${language}`);
  if (language === 'php' && !phpNamespacePattern.test(options.phpNamespace ?? '')) {
    throw new Error(`compiler: the PHP target requires a namespace; ${JSON.stringify(options.phpNamespace ?? null)} is not a PHP namespace`);
  }
  const manifest = typeManifestDocument.read(manifestPath);
  const program = lowerSourceGraph(loadSourceGraph(graphPath), manifest);
  const target = backend.createTarget({ program, manifest });
  const context = { program, manifest, options, target, templateBodies: templateBodies(program, target) };
  // An operation returns its code, or a list of code, definitions and file starts that the program keeps only when it
  // uses them.
  return [backend.emitDeclarations(context), backend.emitRuntime(context), backend.emitTemplates(context), backend.emitEntry(context)].flat();
}

/** The source of a target that writes one file. */
export function compileSource(graphPath: string, manifestPath: string, language: string, options: CompileOptions = {}): string {
  if (FILE_PER_CLASS_TARGETS.includes(language)) throw new Error(`compiler: the ${language} target writes one file per class; compileFiles returns them`);
  return `${usedCode(compileParts(graphPath, manifestPath, language, options))}\n`;
}

/** The files of a target that writes one file per class, by their paths under the output directory. */
export function compileFiles(graphPath: string, manifestPath: string, language: string, options: CompileOptions = {}): Record<string, string> {
  if (!FILE_PER_CLASS_TARGETS.includes(language)) throw new Error(`compiler: the ${language} target writes one file; compileSource returns it`);
  return usedFiles(compileParts(graphPath, manifestPath, language, options));
}

function main(args: string[]): void {
  const value = (name: string): string | null => { const index = args.indexOf(name); return index < 0 ? null : args[index + 1] ?? null; };
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
    compile: () => FILE_PER_CLASS_TARGETS.includes(language) ? compileFiles(graph, manifest, language, phpNamespace === null ? {} : { phpNamespace }) : compileSource(graph, manifest, language),
  });
  process.stdout.write(`compiler ${language}: ${check ? 'checked' : refresh === 'false' ? 'loaded' : 'ready'} ${output}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
