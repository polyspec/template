#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync } from 'oxc-parser';
import { listCases } from '../tests/runner/cases.mjs';
import { pythonPackageCommand } from './python-toolchain.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

// The sources are parsed by oxc-parser into an ESTree AST with the TypeScript nodes of
// typescript-estree; a source that does not parse fails the check.
function parseSource(path) {
  const text = readFileSync(path, 'utf8');
  const { program, errors } = parseSync(path, text);
  if (errors.length > 0) throw new Error(`${path}: ${errors.map(error => error.message).join('; ')}`);
  return { text, statements: program.body };
}

// The source text of a node.
function textOf(source, node) {
  return source.text.slice(node.start, node.end);
}

// The declaration of a statement, which an export statement wraps.
function declared(statement) {
  return statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration' ? statement.declaration : statement;
}

// The name of a class member: the text of its key, with # for a private name.
function memberName(source, member) {
  return member.key ? textOf(source, member.key) : undefined;
}

const isMethod = member => (member.type === 'MethodDefinition' || member.type === 'TSAbstractMethodDefinition') && member.kind === 'method';
const isProperty = member => member.type === 'PropertyDefinition' || member.type === 'TSAbstractPropertyDefinition';
const isConstructor = member => member.type === 'MethodDefinition' && member.kind === 'constructor';

// The name of a parameter, also of a parameter property, without its type and default value.
function parameterName(source, parameter) {
  const binding = parameter.type === 'TSParameterProperty' ? parameter.parameter : parameter;
  const target = binding.type === 'AssignmentPattern' ? binding.left : binding.type === 'RestElement' ? binding.argument : binding;
  return target.type === 'Identifier' ? target.name : textOf(source, target);
}

// The names of the classes and interfaces that a class extends and implements.
function heritage(source, declaration) {
  return [declaration.superClass, ...(declaration.implements ?? []).map(clause => clause.expression)]
    .filter(Boolean)
    .map(expression => textOf(source, expression));
}
const manifestPath = process.env.TEMPLATE_INTERFACE_MANIFEST
  ? resolve(process.env.TEMPLATE_INTERFACE_MANIFEST)
  : resolve(root, 'packages/template-compiler/interface.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.schema !== 2 || manifest.name !== 'TemplateCompiler') throw new Error('invalid compiler interface manifest');
if (existsSync(resolve(root, 'tools/runtime/interface.json'))) throw new Error('runtime contract must not duplicate the compiler manifest');
if (existsSync(resolve(root, 'tools/showcase/adapters/interface.json'))) throw new Error('showcase contract must not duplicate the compiler manifest');
if (manifest.showcaseAdapter?.name !== 'RenderAdapter' || manifest.showcaseAdapter?.schema !== 3) throw new Error('showcase adapter contract is missing');

const evidence = manifest.evidence;
if (!Array.isArray(evidence?.readingOrder) || evidence.readingOrder[0] !== 'packages/template-compiler/interface.json' ||
    !evidence.readingOrder.every(path => existsSync(resolve(root, path)))) {
  throw new Error('compiler interface reading order is incomplete');
}
if (typeof evidence.fixtures !== 'string' || !existsSync(resolve(root, evidence.fixtures)) ||
    !Array.isArray(evidence.examples) || !evidence.examples.every(path => existsSync(resolve(root, path))) ||
    !Array.isArray(evidence.generatedEvidence) || !evidence.generatedEvidence.every(path => existsSync(resolve(root, path))) ||
    !Array.isArray(evidence.verificationCommands) || evidence.verificationCommands.length < 1) {
  throw new Error('compiler interface evidence links are incomplete');
}

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
  : resolve(root, 'packages/template-compiler/backends');
const backendFiles = { typescript: 'typescript.mjs', go: 'go.mjs', rust: 'rust.mjs', php: 'php.mjs', python: 'python.mjs' };
const backendOperations = manifest.components.LanguageBackend.operations;
for (const [language, filename] of Object.entries(backendFiles)) {
  const path = resolve(backendDirectory, filename);
  const source = parseSource(path);
  const exportedFunctions = source.statements
    .filter(statement => statement.type === 'ExportNamedDeclaration' && statement.declaration?.type === 'FunctionDeclaration')
    .map(statement => statement.declaration.id?.name)
    .filter(Boolean);
  for (const operation of backendOperations) {
    if (!exportedFunctions.includes(operation)) throw new Error(`${language}: LanguageBackend.${operation} is missing`);
  }
  if (!exportedFunctions.includes('createTarget')) throw new Error(`${language}: backend expression emitter is missing`);
  if (exportedFunctions.includes('emitProgram')) throw new Error(`${language}: backend bypasses the compiler section contract`);
}

const core = manifest.supportLevels?.core;
if (core?.languages?.join(',') !== 'typescript,go,rust,php,python') throw new Error('core languages are missing or reordered');
if (core?.compileModes?.join(',') !== 'ast,gen' || core.conformanceCases !== listCases().length) throw new Error('core support level is incomplete');
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
const rustContextOperations = ['unary', 'binary', 'stringify', 'escape', 'number', 'finite', 'compare', 'member', 'memberCall', 'classCall', 'index', 'depth', 'entries', 'listSpread', 'mapSpread', 'call', 'limit', 'error'];
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

// VAL-22: the bound map type has the operations bind and merge in every implementation, and the
// manifest names them, the operations that take a bound map as assign and the operations that it
// declares for generated programs.
const boundContract = runtime.BoundMap;
if (boundContract?.operations?.map(item => item.name).join(',') !== 'bind,merge' || manifest.types.BoundMap?.operations?.join(',') !== 'bind,merge') throw new Error('BoundMap operations differ');
if (boundContract.acceptedBy?.join(',') !== 'prepare,render') throw new Error('BoundMap acceptance differs');
for (const language of [...core.languages, 'php-extension', 'javascript-esm']) {
  const bound = manifest.languages?.[language]?.boundMap;
  if (typeof bound?.type !== 'string' || Object.keys(bound.operations ?? {}).join(',') !== 'bind,merge' || !Object.values(bound.operations).every(name => typeof name === 'string' && name !== '')) {
    throw new Error(`${language}: BoundMap mapping is incomplete`);
  }
  const accepted = Object.keys(bound.assign ?? {});
  if (!accepted.includes('render') || !accepted.every(name => boundContract.acceptedBy.includes(name)) || (language !== 'php-extension' && !accepted.includes('prepare'))) {
    throw new Error(`${language}: BoundMap assign mapping is incomplete`);
  }
  if (!Array.isArray(bound.generatedOperations)) throw new Error(`${language}: BoundMap generated operations are missing`);
}
if (manifest.languages['javascript-esm'].entry !== '@polyspec/template/render') throw new Error('javascript-esm: the browser entry is missing');

function declaration(source, type, name) {
  return source.statements.map(declared).find(statement => statement?.type === type && statement.id?.name === name);
}

const enginePath = resolve(root, 'packages/template-ts/src/render/engine.ts');
const engineSource = parseSource(enginePath);
const program = declaration(engineSource, 'TSInterfaceDeclaration', 'Program');
if (!program) throw new Error('typescript: Program interface is missing');
const programMethods = program.body.body.filter(member => member.type === 'TSMethodSignature');
for (const operation of runtime.Program.operations) {
  const method = programMethods.find(item => textOf(engineSource, item.key) === operation.name);
  if (!method || method.params.length !== operation.parameters.length) throw new Error(`typescript: Program.${operation.name} signature differs`);
}
if (programMethods.length !== runtime.Program.operations.length) throw new Error('typescript: Program has undeclared operations');

const engine = declaration(engineSource, 'ClassDeclaration', 'Engine');
if (!engine || !heritage(engineSource, engine).includes('Program')) throw new Error('typescript: Engine does not implement Program');
const constructor = engine.body.body.find(isConstructor);
if (!constructor?.value.params.some(parameter => parameterName(engineSource, parameter) === 'program')) throw new Error('typescript: Engine does not own program');
const engineMethods = engine.body.body.filter(isMethod).map(item => memberName(engineSource, item));
if (engineMethods.join(',') !== runtime.Engine.operations.join(',')) throw new Error('typescript: Engine operations differ');

const indexPath = resolve(root, 'packages/template-ts/src/index.ts');
const indexSource = parseSource(indexPath);
const astProgram = declaration(indexSource, 'ClassDeclaration', 'AstProgram');
if (!astProgram || !heritage(indexSource, astProgram).includes('AstProgramCore')) throw new Error('typescript: AstProgram does not extend the AST Program implementation');
const astProgramCore = declaration(engineSource, 'ClassDeclaration', 'AstProgramCore');
if (!astProgramCore?.body.body.some(member => isProperty(member) && memberName(engineSource, member) === 'runtime')) throw new Error('typescript: AstProgram does not own RuntimeEnvironment');

const runtimeEnvironmentPath = resolve(root, 'packages/template-ts/src/render/runtime-environment.ts');
const runtimeEnvironmentSource = parseSource(runtimeEnvironmentPath);
const runtimeEnvironment = declaration(runtimeEnvironmentSource, 'ClassDeclaration', 'RuntimeEnvironment');
if (!runtimeEnvironment || !heritage(runtimeEnvironmentSource, runtimeEnvironment).includes('RuntimeServices')) throw new Error('typescript: RuntimeEnvironment does not implement RuntimeServices');
const runtimeEnvironmentFields = runtimeEnvironment.body.body.filter(isProperty).map(item => memberName(runtimeEnvironmentSource, item));
const runtimeEnvironmentMethods = runtimeEnvironment.body.body.filter(isMethod).map(item => memberName(runtimeEnvironmentSource, item));
if (runtimeEnvironmentFields.join(',') !== manifest.languages.typescript.runtimeEnvironmentFields.join(',')) throw new Error('typescript: RuntimeEnvironment fields differ');
if (runtimeEnvironmentMethods.join(',') !== manifest.languages.typescript.runtimeEnvironmentOperations.join(',')) throw new Error('typescript: RuntimeEnvironment operations differ');
for (const operation of runtime.RuntimeEnvironment.operations) {
  const method = runtimeEnvironment.body.body.filter(isMethod).find(item => memberName(runtimeEnvironmentSource, item) === operation.name);
  if (method?.value.params.length !== operation.parameters.length) throw new Error(`typescript: RuntimeEnvironment.${operation.name} signature differs`);
}

const bindingsPath = resolve(root, 'packages/template-ts/src/render/runtime-bindings.ts');
const bindingsSource = parseSource(bindingsPath);
const bindings = declaration(bindingsSource, 'ClassDeclaration', 'RuntimeBindings');
const bindingMethods = bindings?.body.body.filter(isMethod);
if (bindingMethods?.map(item => memberName(bindingsSource, item)).join(',') !== runtimeBindingOperations.join(',')) throw new Error(`typescript: RuntimeBindings operations differ`);
for (const operation of runtime.RuntimeBindings.operations) {
  const method = bindingMethods?.find(item => memberName(bindingsSource, item) === operation.name);
  if (method?.value.params.length !== operation.parameters.length) throw new Error(`typescript: RuntimeBindings.${operation.name} signature differs`);
}

// The TypeScript bound map class has no member other than its private state, its constructor and
// its static block, and both entries export bind and merge under the names of the manifest.
const boundPath = process.env.TEMPLATE_TS_BOUND_SOURCE ? resolve(process.env.TEMPLATE_TS_BOUND_SOURCE) : resolve(root, 'packages/template-ts/src/value/bound.ts');
const boundSource = parseSource(boundPath);
const boundClass = declaration(boundSource, 'ClassDeclaration', manifest.languages.typescript.boundMap.type);
if (!boundClass) throw new Error('typescript: BoundMap class is missing');
for (const member of boundClass.body.body) {
  const allowed = isConstructor(member) || member.type === 'StaticBlock' ||
    (isProperty(member) && member.key.type === 'PrivateIdentifier');
  if (!allowed) throw new Error(`typescript: BoundMap has the undeclared member ${memberName(boundSource, member) ?? member.type}`);
}
for (const [language, entry] of [['typescript', 'index.ts'], ['javascript-esm', 'render.ts']]) {
  const entryPath = resolve(root, 'packages/template-ts/src', entry);
  const entrySource = parseSource(entryPath);
  const exported = entrySource.statements
    .filter(statement => statement.type === 'ExportNamedDeclaration' && !statement.declaration)
    .flatMap(statement => statement.specifiers.map(specifier => specifier.exported.name ?? specifier.exported.value));
  for (const name of [...Object.values(manifest.languages[language].boundMap.operations), manifest.languages[language].boundMap.type]) {
    if (!exported.includes(name)) throw new Error(`${language}: ${entry} does not export ${name}`);
  }
}

const contextPath = resolve(root, 'packages/template-ts/src/render/context.ts');
const contextSource = parseSource(contextPath);
const services = declaration(contextSource, 'TSInterfaceDeclaration', 'RuntimeServices');
const serviceMethods = services?.body.body.filter(member => member.type === 'TSMethodSignature');
if (serviceMethods?.map(item => textOf(contextSource, item.key)).join(',') !== runtimeServiceOperations.join(',')) throw new Error('typescript: RuntimeServices operations differ');
for (const operation of runtime.RuntimeServices.operations) {
  const method = serviceMethods?.find(item => textOf(contextSource, item.key) === operation.name);
  if (method?.params.length !== operation.parameters.length) throw new Error(`typescript: RuntimeServices.${operation.name} signature differs`);
}
const frame = declaration(contextSource, 'ClassDeclaration', 'Frame');
const frameConstructor = frame?.body.body.find(isConstructor);
const frameFields = frameConstructor?.value.params.map(parameter => parameterName(contextSource, parameter));
if (frameFields?.join(',') !== manifest.languages.typescript.frameFields.join(',')) throw new Error('typescript: RenderFrame fields differ');
if (frameFields?.join(',') !== runtime.RenderFrame.fields.join(',')) throw new Error('typescript: RenderFrame logical fields differ');
const scope = declaration(contextSource, 'ClassDeclaration', 'Scope');
const scopeFields = scope?.body.body.filter(isProperty).map(item => memberName(contextSource, item));
const scopeOperations = scope?.body.body.filter(isMethod).map(item => memberName(contextSource, item));
if (scopeFields?.join(',') !== manifest.languages.typescript.scopeFields.join(',')) throw new Error('typescript: RenderScope fields differ');
if (scopeOperations?.join(',') !== manifest.languages.typescript.scopeOperations.join(',')) throw new Error('typescript: RenderScope operations differ');

function run(label, command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env: process.env });
  if (result.error || result.status !== 0) throw new Error(`${label} failed:\n${result.error?.message ?? ''}${result.stdout}${result.stderr}`);
}
run('go interface AST check', 'go', ['test', '-run', '^(TestCompilerRuntimeInterface|TestBoundMapInterface)$', '.'], resolve(root, 'packages/template-go'));
run('rust interface AST check', resolve(process.env.HOME, '.cargo/bin/cargo'), ['test', '--locked', '--test', 'compiler_interface'], resolve(root, 'packages/template-rust'));
run('php interface reflection check', 'php', ['vendor/bin/phpunit', '--filter', 'CompilerInterfaceTest'], resolve(root, 'packages/template-php'));
run('python interface check', pythonPackageCommand(), ['tests/test_compiler_interface.py'], resolve(root, 'packages/template-python'));

process.stdout.write('compiler interface: manifest and TypeScript, Go, Rust, PHP, Python runtime declarations passed\n');
