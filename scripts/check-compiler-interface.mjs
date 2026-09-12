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
  'RuntimeBindings', 'RuntimeServices', 'RuntimeEnvironment', 'FunctionSignature', 'DefinitionData<T>', 'Definition<T>',
  'Definitions', 'Input<T>', 'RenderFrame', 'RenderScope',
];
for (const name of requiredTypes) if (!manifest.types?.[name]) throw new Error(`compiler type ${name} is missing`);

const expectedOperations = {
  Compiler: ['loadSourceGraph', 'parseSourceGraph', 'lowerSourceGraph', 'emitArtifact'],
  LanguageBackend: ['emitDeclarations', 'emitRuntime', 'emitTemplates', 'emitEntry'],
  ArtifactStore: ['load', 'regenerate', 'loadOrRefresh'],
  Program: ['prepare', 'render'],
  RuntimeEnvironment: ['register', 'limits', 'hostFunction'],
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
  if (!mapping?.backend || mapping.program?.join(',') !== 'AstProgram,GeneratedProgram' || mapping.runtimeServices !== 'RuntimeServices' || !mapping.error) {
    throw new Error(`${language}: compiler mapping is incomplete`);
  }
  for (const operation of manifest.types.RuntimeServices.operations) {
    if (!mapping.runtimeServiceOperationNames?.[operation]) throw new Error(`${language}: RuntimeServices.${operation} name mapping is missing`);
  }
  if (mapping.runtimeEnvironmentFields?.length !== manifest.types.RuntimeEnvironment.fields.length) throw new Error(`${language}: RuntimeEnvironment field mapping is incomplete`);
  if (mapping.runtimeEnvironmentOperations?.length !== manifest.types.RuntimeEnvironment.operations.length) throw new Error(`${language}: RuntimeEnvironment operation mapping is incomplete`);
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
if (runtime.AstProgram?.owns?.join(',') !== 'runtime') throw new Error('AstProgram runtime ownership differs');
const runtimeBindingOperations = manifest.types.RuntimeBindings.operations;
if (runtime.RuntimeBindings?.operations?.map(item => item.name).join(',') !== runtimeBindingOperations.join(',')) throw new Error('RuntimeBindings operations differ');
const runtimeServiceOperations = manifest.types.RuntimeServices.operations;
if (runtime.RuntimeServices?.operations?.map(item => item.name).join(',') !== runtimeServiceOperations.join(',')) throw new Error('RuntimeServices operations differ');
const runtimeEnvironmentOperations = manifest.types.RuntimeEnvironment.operations;
if (runtime.RuntimeEnvironment?.implements !== 'RuntimeServices') throw new Error('RuntimeEnvironment implementation differs');
if (runtime.RuntimeEnvironment?.fields?.join(',') !== manifest.types.RuntimeEnvironment.fields.join(',')) throw new Error('RuntimeEnvironment fields differ');
if (runtime.RuntimeEnvironment?.operations?.map(item => item.name).join(',') !== runtimeEnvironmentOperations.join(',')) throw new Error('RuntimeEnvironment operations differ');
if (runtime.RenderFrame?.fields?.join(',') !== manifest.types.RenderFrame.fields.join(',')) throw new Error('RenderFrame fields differ');
if (runtime.RenderScope?.fields?.join(',') !== manifest.types.RenderScope.fields.join(',')) throw new Error('RenderScope fields differ');
if (runtime.RenderScope?.operations?.join(',') !== manifest.types.RenderScope.operations.join(',')) throw new Error('RenderScope operations differ');

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
const astProgramCore = declaration(engineSource, ts.SyntaxKind.ClassDeclaration, 'AstProgramCore');
if (!astProgramCore?.members.some(member => ts.isPropertyDeclaration(member) && member.name.getText(engineSource) === 'runtime')) throw new Error('typescript: AstProgram does not own RuntimeEnvironment');

const runtimeEnvironmentPath = resolve(root, 'packages/template-ts/src/render/runtime-environment.ts');
const runtimeEnvironmentSource = ts.createSourceFile(runtimeEnvironmentPath, readFileSync(runtimeEnvironmentPath, 'utf8'), ts.ScriptTarget.Latest, true);
const runtimeEnvironment = declaration(runtimeEnvironmentSource, ts.SyntaxKind.ClassDeclaration, 'RuntimeEnvironment');
if (!runtimeEnvironment?.heritageClauses?.some(clause => clause.types.some(type => type.expression.getText(runtimeEnvironmentSource) === 'RuntimeServices'))) throw new Error('typescript: RuntimeEnvironment does not implement RuntimeServices');
const runtimeEnvironmentFields = runtimeEnvironment.members.filter(ts.isPropertyDeclaration).map(item => item.name.getText(runtimeEnvironmentSource));
const runtimeEnvironmentMethods = runtimeEnvironment.members.filter(ts.isMethodDeclaration).map(item => item.name.getText(runtimeEnvironmentSource));
if (runtimeEnvironmentFields.join(',') !== manifest.languages.typescript.runtimeEnvironmentFields.join(',')) throw new Error('typescript: RuntimeEnvironment fields differ');
if (runtimeEnvironmentMethods.join(',') !== manifest.languages.typescript.runtimeEnvironmentOperations.join(',')) throw new Error('typescript: RuntimeEnvironment operations differ');
for (const operation of runtime.RuntimeEnvironment.operations) {
  const method = runtimeEnvironment.members.filter(ts.isMethodDeclaration).find(item => item.name.getText(runtimeEnvironmentSource) === operation.name);
  if (method?.parameters.length !== operation.parameters.length) throw new Error(`typescript: RuntimeEnvironment.${operation.name} signature differs`);
}

const bindingsPath = resolve(root, 'packages/template-ts/src/render/runtime-bindings.ts');
const bindingsSource = ts.createSourceFile(bindingsPath, readFileSync(bindingsPath, 'utf8'), ts.ScriptTarget.Latest, true);
const bindings = declaration(bindingsSource, ts.SyntaxKind.ClassDeclaration, 'RuntimeBindings');
const bindingMethods = bindings?.members.filter(ts.isMethodDeclaration);
if (bindingMethods?.map(item => item.name.getText(bindingsSource)).join(',') !== runtimeBindingOperations.join(',')) throw new Error(`typescript: RuntimeBindings operations differ`);
for (const operation of runtime.RuntimeBindings.operations) {
  const method = bindingMethods?.find(item => item.name.getText(bindingsSource) === operation.name);
  if (method?.parameters.length !== operation.parameters.length) throw new Error(`typescript: RuntimeBindings.${operation.name} signature differs`);
}

const contextPath = resolve(root, 'packages/template-ts/src/render/context.ts');
const contextSource = ts.createSourceFile(contextPath, readFileSync(contextPath, 'utf8'), ts.ScriptTarget.Latest, true);
const services = declaration(contextSource, ts.SyntaxKind.InterfaceDeclaration, 'RuntimeServices');
const serviceMethods = services?.members.filter(ts.isMethodSignature);
if (serviceMethods?.map(item => item.name.getText(contextSource)).join(',') !== runtimeServiceOperations.join(',')) throw new Error('typescript: RuntimeServices operations differ');
for (const operation of runtime.RuntimeServices.operations) {
  const method = serviceMethods?.find(item => item.name.getText(contextSource) === operation.name);
  if (method?.parameters.length !== operation.parameters.length) throw new Error(`typescript: RuntimeServices.${operation.name} signature differs`);
}
const frame = declaration(contextSource, ts.SyntaxKind.ClassDeclaration, 'Frame');
const frameConstructor = frame?.members.find(ts.isConstructorDeclaration);
const frameFields = frameConstructor?.parameters.map(parameter => parameter.name.getText(contextSource));
if (frameFields?.join(',') !== manifest.languages.typescript.frameFields.join(',')) throw new Error('typescript: RenderFrame fields differ');
if (frameFields?.join(',') !== runtime.RenderFrame.fields.join(',')) throw new Error('typescript: RenderFrame logical fields differ');
const scope = declaration(contextSource, ts.SyntaxKind.ClassDeclaration, 'Scope');
const scopeFields = scope?.members.filter(ts.isPropertyDeclaration).map(item => item.name.getText(contextSource));
const scopeOperations = scope?.members.filter(ts.isMethodDeclaration).map(item => item.name.getText(contextSource));
if (scopeFields?.join(',') !== manifest.languages.typescript.scopeFields.join(',')) throw new Error('typescript: RenderScope fields differ');
if (scopeOperations?.join(',') !== manifest.languages.typescript.scopeOperations.join(',')) throw new Error('typescript: RenderScope operations differ');

function run(label, command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${label} failed:\n${result.error?.message ?? ''}${result.stdout}${result.stderr}`);
}
run('go interface AST check', 'go', ['test', '-run', '^TestCompilerRuntimeInterface$', '.'], resolve(root, 'packages/template-go'));
run('rust interface AST check', resolve(process.env.HOME, '.cargo/bin/cargo'), ['test', '--locked', '--test', 'compiler_interface'], resolve(root, 'packages/template-rust'));
run('php interface reflection check', 'php', ['vendor/bin/phpunit', '--filter', 'CompilerInterfaceTest'], resolve(root, 'packages/template-php'));

process.stdout.write('compiler interface: manifest and TypeScript, Go, Rust, PHP runtime declarations passed\n');
