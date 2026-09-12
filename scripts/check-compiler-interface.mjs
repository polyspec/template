#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifestPath = process.env.TEMPLATE_INTERFACE_MANIFEST
  ? resolve(process.env.TEMPLATE_INTERFACE_MANIFEST)
  : resolve(root, 'tools/compiler/interface.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.schema !== 2 || manifest.name !== 'TemplateCompiler') throw new Error('invalid compiler interface manifest');
if (existsSync(resolve(root, 'tools/runtime/interface.json'))) throw new Error('runtime contract must not duplicate the compiler manifest');
if (existsSync(resolve(root, 'tools/showcase/adapters/interface.json'))) throw new Error('showcase contract must not duplicate the compiler manifest');
if (manifest.showcaseAdapter?.name !== 'RenderAdapter' || manifest.showcaseAdapter?.schema !== 3) throw new Error('showcase adapter contract is missing');

const requiredTypes = [
  'CompileMode', 'ArtifactRefresh', 'SourceGraph', 'TypeManifest', 'TypedProgram',
  'ArtifactManifest', 'RenderRequest', 'Program', 'AstProgram', 'GeneratedProgram',
  'RuntimeBindings', 'FunctionSignature', 'DefinitionData<T>', 'Definition<T>',
  'Definitions', 'Input<T>',
];
for (const name of requiredTypes) if (!manifest.types?.[name]) throw new Error(`compiler type ${name} is missing`);

const expectedOperations = {
  Compiler: ['loadSourceGraph', 'parseSourceGraph', 'lowerSourceGraph', 'emitArtifact'],
  LanguageBackend: ['emitDeclarations', 'emitRuntime', 'emitTemplates', 'emitEntry'],
  ArtifactStore: ['load', 'regenerate', 'loadOrRefresh'],
  Program: ['prepare', 'render'],
  PageCache: ['get', 'put', 'getOrSet'],
};
for (const [owner, names] of Object.entries(expectedOperations)) {
  const actual = manifest.operations.filter(item => item.owner === owner).map(item => item.name);
  if (actual.join(',') !== names.join(',')) throw new Error(`${owner} operations differ: ${actual.join(',')}`);
}

const backendDirectory = process.env.TEMPLATE_BACKEND_DIRECTORY
  ? resolve(process.env.TEMPLATE_BACKEND_DIRECTORY)
  : resolve(root, 'tools/compiler/backends');
const backendFiles = { typescript: 'typescript.mjs', go: 'go.mjs', rust: 'rust.mjs', php: 'php.mjs' };
const backendOperations = manifest.components.LanguageBackend.operations;
for (const [language, filename] of Object.entries(backendFiles)) {
  const path = resolve(backendDirectory, filename);
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const exportedFunctions = source.statements
    .filter(ts.isFunctionDeclaration)
    .filter(statement => statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword))
    .map(statement => statement.name?.text)
    .filter(Boolean);
  for (const operation of backendOperations) {
    if (!exportedFunctions.includes(operation)) throw new Error(`${language}: LanguageBackend.${operation} is missing`);
  }
  if (!exportedFunctions.includes('createTarget')) throw new Error(`${language}: backend expression emitter is missing`);
  if (exportedFunctions.includes('emitProgram')) throw new Error(`${language}: backend bypasses the compiler section contract`);
}

const core = manifest.supportLevels?.core;
if (core?.languages?.join(',') !== 'typescript,go,rust,php') throw new Error('core languages are missing or reordered');
if (core?.compileModes?.join(',') !== 'ast,gen' || core.conformanceCases !== 211) throw new Error('core support level is incomplete');
for (const language of core.languages) {
  const mapping = manifest.languages?.[language];
  if (!mapping?.backend || mapping.program?.join(',') !== 'AstProgram,GeneratedProgram' || !mapping.error) {
    throw new Error(`${language}: compiler mapping is incomplete`);
  }
}
const rustContextOperations = ['stringify', 'escape', 'number', 'finite', 'compare', 'entries', 'call', 'limit', 'error'];
if (manifest.languages.rust.runtimeBindingsExplicitContext?.join(',') !== rustContextOperations.join(',')) {
  throw new Error('rust RuntimeBindings context mapping differs');
}

const requiredForbidden = [
  'generated renderer callback', 'AST fallback from generated mode',
  'showcase-specific compiler', 'legacy wrapper compatibility',
  'parsing or code generation during render',
];
if (manifest.forbidden?.join('\n') !== requiredForbidden.join('\n')) throw new Error('forbidden architecture list differs');

const runtime = manifest.runtimeContract;
if (runtime?.Program?.operations?.map(item => item.name).join(',') !== 'prepare,render') throw new Error('Program runtime operations differ');
if (runtime.Engine?.owns?.join(',') !== 'program' || runtime.Engine?.implements !== 'Program') throw new Error('Engine ownership differs');
if (runtime.AstProgram?.implements !== 'Program' || runtime.GeneratedProgram?.implements !== 'Program') throw new Error('program implementation mapping differs');
const runtimeBindingOperations = manifest.types.RuntimeBindings.operations;
if (runtime.RuntimeBindings?.operations?.map(item => item.name).join(',') !== runtimeBindingOperations.join(',')) throw new Error('RuntimeBindings operations differ');

function declaration(source, kind, name) {
  return source.statements.find(statement => statement.name?.text === name && statement.kind === kind);
}

const enginePath = resolve(root, 'packages/template-ts/src/render/engine.ts');
const engineSource = ts.createSourceFile(enginePath, readFileSync(enginePath, 'utf8'), ts.ScriptTarget.Latest, true);
const program = declaration(engineSource, ts.SyntaxKind.InterfaceDeclaration, 'Program');
if (!program) throw new Error('typescript: Program interface is missing');
const programMethods = program.members.filter(ts.isMethodSignature);
for (const operation of runtime.Program.operations) {
  const method = programMethods.find(item => item.name.getText(engineSource) === operation.name);
  if (!method || method.parameters.length !== operation.parameters.length) throw new Error(`typescript: Program.${operation.name} signature differs`);
}
if (programMethods.length !== runtime.Program.operations.length) throw new Error('typescript: Program has undeclared operations');

const engine = declaration(engineSource, ts.SyntaxKind.ClassDeclaration, 'Engine');
if (!engine || !engine.heritageClauses?.some(clause => clause.types.some(type => type.expression.getText(engineSource) === 'Program'))) throw new Error('typescript: Engine does not implement Program');
const constructor = engine.members.find(ts.isConstructorDeclaration);
if (!constructor?.parameters.some(parameter => parameter.name.getText(engineSource) === 'program')) throw new Error('typescript: Engine does not own program');
const engineMethods = engine.members.filter(ts.isMethodDeclaration).map(item => item.name.getText(engineSource));
if (engineMethods.join(',') !== runtime.Engine.operations.join(',')) throw new Error('typescript: Engine operations differ');

const indexPath = resolve(root, 'packages/template-ts/src/index.ts');
const indexSource = ts.createSourceFile(indexPath, readFileSync(indexPath, 'utf8'), ts.ScriptTarget.Latest, true);
const astProgram = declaration(indexSource, ts.SyntaxKind.ClassDeclaration, 'AstProgram');
if (!astProgram?.heritageClauses?.some(clause => clause.types.some(type => type.expression.getText(indexSource) === 'AstProgramCore'))) throw new Error('typescript: AstProgram does not extend the AST Program implementation');

const bindingsPath = resolve(root, 'packages/template-ts/src/render/runtime-bindings.ts');
const bindingsSource = ts.createSourceFile(bindingsPath, readFileSync(bindingsPath, 'utf8'), ts.ScriptTarget.Latest, true);
const bindings = declaration(bindingsSource, ts.SyntaxKind.ClassDeclaration, 'RuntimeBindings');
const bindingMethods = bindings?.members.filter(ts.isMethodDeclaration);
if (bindingMethods?.map(item => item.name.getText(bindingsSource)).join(',') !== runtimeBindingOperations.join(',')) throw new Error(`typescript: RuntimeBindings operations differ`);
for (const operation of runtime.RuntimeBindings.operations) {
  const method = bindingMethods?.find(item => item.name.getText(bindingsSource) === operation.name);
  if (method?.parameters.length !== operation.parameters.length) throw new Error(`typescript: RuntimeBindings.${operation.name} signature differs`);
}

function run(label, command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${label} failed:\n${result.error?.message ?? ''}${result.stdout}${result.stderr}`);
}
run('go interface AST check', 'go', ['test', '-run', '^TestCompilerRuntimeInterface$', '.'], resolve(root, 'packages/template-go'));
run('rust interface AST check', resolve(process.env.HOME, '.cargo/bin/cargo'), ['test', '--locked', '--test', 'compiler_interface'], resolve(root, 'packages/template-rust'));
run('php interface reflection check', 'php', ['vendor/bin/phpunit', '--filter', 'CompilerInterfaceTest'], resolve(root, 'packages/template-php'));

process.stdout.write('compiler interface: manifest and TypeScript, Go, Rust, PHP runtime declarations passed\n');
