#!/usr/bin/env node
// Checks the manifest-generated declarations, language implementations and runtime state proof.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pythonCommand, pythonEnvironment, pythonPackageCommand } from './python-toolchain.mts';
import { compilerManifestDocument, manifestPath, type AdapterLanguage } from './compiler-manifest.mts';
import { readJson } from './json-document.mts';
import { runtimePayloadDocument, scenarioIds, scenarioMetadataDocument, type RuntimePayload } from './showcase-documents.mts';
import { CARGO } from './temporary-workspace.mts';
import { tsc } from './tools.mts';
import { showcasePythonModule } from '../examples/showcase/python-module.mts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const adapterRoot = join(root, 'examples', 'showcase', 'adapters');
const scenariosRoot = join(root, 'examples', 'site', 'scenarios');
interface ExpectedRequest {
  target: string;
  assign: unknown;
  define: unknown;
  env?: unknown;
}

const manifest = compilerManifestDocument.read(manifestPath(root)).showcaseAdapter;
const operationNames = manifest.operations.map(operation => operation.name);
const languageNames = ['typescript', 'javascript', 'go', 'rust', 'php', 'python'];
const requiredSupportLevels = ['core-runtime', 'source-compiler', 'artifact-runtime', 'generated-compiler'];

/** The definition of `language` in the manifest; fails when the manifest maps no such language. */
function languageDefinition(language: string): AdapterLanguage {
  const definition = manifest.languages[language];
  if (!definition) throw new Error(`the manifest maps no language ${language}`);
  return definition;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function run(label: string, command: string, args: string[], cwd = root, extraEnv: NodeJS.ProcessEnv = {}): string {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${label} exited ${result.status}${detail ? `:\n${detail}` : ''}`);
  }
  return result.stdout;
}

function readContractFile(relativePath: string): string {
  const path = join(adapterRoot, relativePath);
  if (!existsSync(path)) throw new Error(`contract file is missing: examples/showcase/adapters/${relativePath}`);
  return readFileSync(path, 'utf8');
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function checkSupportLevels() {
  assert(manifest.schema === 3, 'interface manifest must use schema 3');
  assert(manifest.supportLevels && typeof manifest.supportLevels === 'object', 'support levels are missing');
  for (const level of requiredSupportLevels) {
    assert(manifest.supportLevels[level], `support level ${level} is missing`);
  }
  for (const language of languageNames) {
    const levels = manifest.languages[language]?.supportLevels;
    assert(Array.isArray(levels), `${language} does not declare support levels`);
    for (const level of requiredSupportLevels) assert(levels.includes(level), `${language} does not support ${level}`);
  }
  assert(manifest.executionModes?.ast?.requiredSupportLevel === 'artifact-runtime', 'AST execution mode must require artifact-runtime');
  assert(manifest.executionModes?.generated?.requiredSupportLevel === 'generated-compiler', 'generated execution mode must require generated-compiler');
  assert(manifest.executionModes?.ast?.status === 'implemented', 'AST execution mode must be implemented');
}

function checkGeneratedEngineRoute() {
  for (const removed of [
    join(root, 'examples/showcase/generate-direct.mts'),
    join(adapterRoot, 'generated/native_direct.ts'),
    join(adapterRoot, 'generated/native_direct.mjs'),
    join(adapterRoot, 'generated/native_direct.php'),
    join(adapterRoot, 'go/native_direct.go'),
    join(adapterRoot, 'rust/src/native_direct.rs'),
  ]) assert(!existsSync(removed), `removed showcase generator path returned: ${removed}`);
  const checks: Record<string, RegExp[]> = {
    typescript: [/new Engine\(generated[\s\S]*?generatedProgram\(root\)/],
    javascript: [/new Engine\(generated[\s\S]*?generatedProgram\(root\)/],
    go: [/program, err = generatedProgram/, /engine := template\.NewEngine\(program\)/],
    rust: [/generated_engine\([\s\S]*?Engine::new\(generated::/],
    php: [/generatedProgram\(\$root\)/, /new Engine\(\$program\)/],
    python: [/generated_program\(root\)/, /Engine\(program\)/],
  };
  for (const [language, patterns] of Object.entries(checks)) {
    const source = readContractFile(languageDefinition(language).file);
    for (const pattern of patterns) assert(pattern.test(source), `${language}: generated execution is not connected through a Program`);
  }
  const allSource = languageNames.map(language => readContractFile(languageDefinition(language).file)).join('\n');
  assert(!/GeneratedRenderer|GeneratedRequest|GeneratedPreparedRender|generated_renderer|generatedRenderer/.test(allSource), 'adapter still uses the removed generated callback contract');
  assert(!/CompileModeGen|CompileMode::Gen|compile\.mode/.test(allSource), 'adapter still selects generated execution inside an AST engine');
  assert(!allSource.includes('native_templates'), 'generated execution still packages an AST template loader');

  const scenarios = scenarioIds(scenariosRoot);
  const generatedChecks: Record<string, (id: string) => [string, RegExp]> = {
    typescript: id => [`generated/typed/${id}.ts`, /export class GeneratedProgram implements Program/],
    javascript: id => [`generated/javascript/${id}.js`, /export class GeneratedProgram/],
    go: id => [`go/generated/${id}/generated.go`, /type GeneratedProgram struct[\s\S]*?func \(p \*GeneratedProgram\) Prepare/],
    rust: id => [`generated/typed/${id}.rust`, /pub struct GeneratedProgram[\s\S]*?impl Program for GeneratedProgram/],
    php: id => [`generated/php/${id}/GeneratedProgram.php`, /final class GeneratedProgram implements Program/],
    python: id => [`generated/typed/${showcasePythonModule(id)}.py`, /class GeneratedProgram\(Program\):/],
  };
  for (const [language, generatedCheck] of Object.entries(generatedChecks)) {
    for (const scenario of scenarios) {
      const [file, pattern] = generatedCheck(scenario);
      const generated = readContractFile(file);
      assert(pattern.test(generated), `${language}/${scenario}: generated artifact does not implement Program`);
    }
  }
}

function assertOrderedShape(actual: unknown, expected: unknown, path = '$'): void {
  if (actual === null || expected === null || typeof actual !== 'object' || typeof expected !== 'object') {
    assert(Object.is(actual, expected), `${path} differs: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
    return;
  }
  assert(Array.isArray(actual) === Array.isArray(expected), `${path} changes array/object kind`);
  if (Array.isArray(actual) && Array.isArray(expected)) {
    assert(actual.length === expected.length, `${path} changes array length`);
    for (let index = 0; index < actual.length; index++) assertOrderedShape(actual[index], expected[index], `${path}[${index}]`);
    return;
  }
  const actualFields = new Map<string, unknown>(Object.entries(actual));
  const expectedFields = new Map<string, unknown>(Object.entries(expected));
  assert(JSON.stringify([...actualFields.keys()]) === JSON.stringify([...expectedFields.keys()]), `${path} changes ordered fields`);
  for (const [key, value] of expectedFields) assertOrderedShape(actualFields.get(key), value, `${path}.${key}`);
}

function digest(bytes: Buffer): { bytes: number; sha256: string } {
  return {
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function expectedRequest(scenarioPath: string): ExpectedRequest {
  const metadata = scenarioMetadataDocument.read(join(scenarioPath, 'scenario.json'));
  const request: ExpectedRequest = {
    target: metadata.target,
    assign: readJson(join(scenarioPath, 'data.json')),
    define: readJson(join(scenarioPath, 'define.json')),
  };
  const environmentPath = join(scenarioPath, 'env.json');
  if (existsSync(environmentPath)) request.env = readJson(environmentPath);
  return request;
}

function parseRuntimeOutput(language: string, stdout: string): RuntimePayload {
  const text = stdout.trim();
  assert(text.length > 0, `${language} adapter produced no JSON output`);
  return runtimePayloadDocument.parse(text, `the output of the ${language} adapter`);
}

function runtimeCommand(language: string, scenarioPath: string, mode = 'ast'): [string, string[], string, NodeJS.ProcessEnv] {
  const definition = languageDefinition(language);
  const source = join(adapterRoot, definition.file);
  const env: NodeJS.ProcessEnv = mode === 'generated' ? { SHOWCASE_EXECUTION_MODE: 'generated' } : {};
  if (language === 'typescript') return [process.execPath, ['--experimental-strip-types', source, scenarioPath], root, env];
  if (language === 'javascript') return [process.execPath, [source, scenarioPath], root, env];
  if (language === 'go') return ['go', ['run', '.', scenarioPath], join(adapterRoot, 'go'), env];
  if (language === 'rust') {
    return [CARGO, ['run', '--quiet', '--locked', '--manifest-path', join(adapterRoot, 'rust', 'Cargo.toml'), '--', scenarioPath], root, env];
  }
  if (language === 'python') return [pythonPackageCommand(), [source, scenarioPath], root, { ...env, ...pythonEnvironment() }];
  // The adapter class is PSR-4 code that php.php loads and runs.
  return ['php', [join(adapterRoot, 'php.php'), scenarioPath], root, env];
}

function checkStaticImplementation(language: string): void {
  const definition = languageDefinition(language);
  const source = readContractFile(definition.file);
  const generated = readContractFile(definition.generated);
  const constructorName = definition.constructorName;
  const constructorPattern = language === 'typescript' || language === 'javascript'
    ? /\bconstructor\s*\(/
    : language === 'python'
      ? new RegExp(`\\bdef\\s+${escapeRegExp(constructorName)}\\s*\\(`)
      : new RegExp(`(?:func|fn|function)\\s+${escapeRegExp(constructorName)}\\s*\\(`);
  assert(constructorPattern.test(source), `${language} does not declare constructor ${constructorName}`);
  for (const owned of manifest.constructor.owns) {
    const field = owned.slice(owned.lastIndexOf('.') + 1);
    assert(new RegExp(`\\b${escapeRegExp(field)}\\b`).test(source), `${language} does not declare owned field ${field}`);
  }
  let previous = -1;
  for (const operation of manifest.operations) {
    const languageOperation = definition.operationNames[operation.name];
    if (languageOperation === undefined) throw new Error(`${language} has no name mapping for ${operation.name}`);
    const sourcePattern = new RegExp(`\\b${escapeRegExp(languageOperation)}\\s*\\(`);
    const sourcePosition = source.search(sourcePattern);
    const generatedPosition = language === 'javascript'
      ? generated.indexOf(JSON.stringify(languageOperation))
      : generated.search(new RegExp(`\\b${escapeRegExp(languageOperation)}\\s*\\(`));
    assert(sourcePosition >= 0, `${language} is missing operation ${languageOperation}`);
    assert(generatedPosition >= 0, `generated ${language} contract is missing operation ${languageOperation}`);
    assert(sourcePosition >= previous, `${language} changes manifest operation order at ${languageOperation}`);
    previous = sourcePosition;
  }
  if (language === 'typescript') assert(/export class Adapter implements RenderAdapter/.test(source), 'TypeScript Adapter does not implement RenderAdapter');
  if (language === 'javascript') assert(/export class Adapter\s*\{/.test(source), 'JavaScript Adapter class is missing');
  if (language === 'go') assert(/type Adapter struct\s*\{/.test(source) && /var _ RenderAdapter = \(\*Adapter\)\(nil\)/.test(source), 'Go Adapter does not assert RenderAdapter');
  if (language === 'rust') assert(/struct Adapter\s*\{/.test(source) && /impl RenderAdapter for Adapter/.test(source), 'Rust Adapter does not implement RenderAdapter');
  if (language === 'php') assert(/final class Adapter implements RenderAdapter/.test(source), 'PHP Adapter does not implement RenderAdapter');
  if (language === 'python') assert(/class Adapter\(RenderAdapter\):/.test(source), 'Python Adapter does not implement RenderAdapter');
}

/** The runtime assertions that the generated JavaScript contract exports. */
interface RuntimeAssertions {
  assertRenderAdapter(adapter: object): unknown;
  assertRequestShape(request: object): unknown;
}

/** Whether the module `value` exports both runtime assertions as functions. */
function isRuntimeAssertions(value: unknown): value is RuntimeAssertions {
  return typeof value === 'object' && value !== null
    && 'assertRenderAdapter' in value && typeof value.assertRenderAdapter === 'function'
    && 'assertRequestShape' in value && typeof value.assertRequestShape === 'function';
}

async function checkRuntimeAssertionHelpers() {
  const generated = join(adapterRoot, languageDefinition('javascript').generated);
  const contract: unknown = await import(pathToFileURL(generated).href);
  assert(isRuntimeAssertions(contract), `${generated} does not export assertRenderAdapter and assertRequestShape`);
  let rejectedMissingOperation = false;
  try {
    contract.assertRenderAdapter({});
  } catch {
    rejectedMissingOperation = true;
  }
  assert(rejectedMissingOperation, 'generated adapter assertion accepts a missing operation');
  let rejectedExtraField = false;
  try {
    contract.assertRequestShape({ target: 'layout', assign: new Map(), define: new Map(), extra: true });
  } catch {
    rejectedExtraField = true;
  }
  assert(rejectedExtraField, 'generated request assertion accepts an extra field');
}

function checkPhpReflection() {
  const php = languageDefinition('php');
  const expected = JSON.stringify(operationNames.map(name => php.operationNames[name]));
  // The adapter is a PSR-4 class of the namespace Polyspec\Showcase\Adapter\Php, loaded with the generated
  // declarations by the class loader of the PHP package, as php.php loads it.
  const adapterClass = 'Polyspec\\Showcase\\Adapter\\Php\\' + php.type;
  const probe = [
    `$loader = require ${JSON.stringify(join(root, 'packages/php/vendor/autoload.php'))};`,
    `$loader->addPsr4('Polyspec\\\\Showcase\\\\Adapter\\\\', ${JSON.stringify(join(adapterRoot, 'generated/php-adapter'))});`,
    `$loader->addPsr4('Polyspec\\\\Showcase\\\\Adapter\\\\Php\\\\', ${JSON.stringify(join(adapterRoot, 'php'))});`,
    `$class = ${JSON.stringify(adapterClass)};`,
    `$reflection = new ReflectionClass($class);`,
    `$expected = json_decode(${JSON.stringify(expected)}, true);`,
    `$actual = [];`,
    `foreach ($reflection->getMethods(ReflectionMethod::IS_PUBLIC) as $method) {`,
    `    if ($method->getDeclaringClass()->getName() === $class && $method->getName() !== '__construct') $actual[] = $method->getName();`,
    `}`,
    `if ($actual !== $expected) { fwrite(STDERR, 'Adapter methods do not match the manifest' . PHP_EOL); exit(1); }`,
    `$constructor = $reflection->getConstructor();`,
    `if ($constructor === null || $constructor->getNumberOfParameters() !== 1 || $constructor->getParameters()[0]->getName() !== 'root') { fwrite(STDERR, 'Adapter constructor does not match the manifest' . PHP_EOL); exit(1); }`,
    `echo 'reflection passed' . PHP_EOL;`,
  ].join('\n');
  run('PHP ReflectionClass', 'php', ['-r', probe, '--', root]);
}

function checkRuntime(language: string, scenarioPath: string, request: ExpectedRequest, expectedHtml: string, mode = 'ast'): void {
  const [command, args, cwd, env] = runtimeCommand(language, scenarioPath, mode);
  const payload = parseRuntimeOutput(language, run(`${language} ${mode} runtime`, command, args, cwd, env));
  const expectedDigest = digest(Buffer.from(expectedHtml, 'utf8'));
  assert(payload.language === language, `${language} reports language ${payload.language}`);
  assert(payload.type === manifest.concreteType, `${language} reports type ${payload.type}`);
  assert(JSON.stringify(payload.operations) === JSON.stringify(operationNames), `${language} reports a different operation contract`);
  assertOrderedShape(payload.request, request, `${language}.request`);
  assert(payload.bytes === expectedDigest.bytes, `${language} reports ${payload.bytes} bytes, expected ${expectedDigest.bytes}`);
  assert(payload.firstSha256 === expectedDigest.sha256, `${language} first output hash differs`);
  assert(payload.secondSha256 === expectedDigest.sha256, `${language} second output hash differs`);
  assert(payload.recoveredSha256 === expectedDigest.sha256, `${language} did not recover after the failed render`);
  assert(payload.requestUnchanged === true, `${language} changed the request during failure recovery`);
  assert(payload.failureObserved === true, `${language} did not observe the invalid-target failure`);
}

async function main() {
  checkSupportLevels();
  checkGeneratedEngineRoute();
  run('manifest generator', process.execPath, ['scripts/generate-showcase-contract.mts', '--check']);
  run('product generated compiler', process.execPath, ['examples/showcase/compile-generated.mts', '--refresh', 'dev', '--check']);
  for (const language of languageNames) checkStaticImplementation(language);

  run('TypeScript declarations', 'node', [tsc, '--noEmit', '-p', 'examples/showcase/adapters/tsconfig.json']);
  const gofmt = run('Go formatting', 'gofmt', ['-d', join(adapterRoot, 'go', 'main.go'), join(adapterRoot, 'go', 'render_adapter.go')]);
  assert(gofmt.trim() === '', `Go sources are not formatted:\n${gofmt}`);
  run('Go contract compilation', 'go', ['test', './...'], join(adapterRoot, 'go'));
  run('Rust contract compilation', CARGO, ['check', '--locked', '--manifest-path', join(adapterRoot, 'rust', 'Cargo.toml')]);
  run('PHP generated declaration syntax', 'php', ['-l', join(adapterRoot, languageDefinition('php').generated)]);
  run('PHP adapter syntax', 'php', ['-l', join(adapterRoot, languageDefinition('php').file)]);
  checkPhpReflection();
  // The compile builtin parses the sources and writes no bytecode into the checkout.
  const python = languageDefinition('python');
  for (const file of [python.file, python.generated]) {
    run(`Python syntax of ${file}`, pythonCommand(), ['-c', 'import sys; compile(open(sys.argv[1], "rb").read(), sys.argv[1], "exec")', join(adapterRoot, file)]);
  }
  await checkRuntimeAssertionHelpers();

  const scenarios = scenarioIds(scenariosRoot);
  assert(scenarios.length > 0, 'showcase scenarios are missing');
  for (const scenarioId of scenarios) {
    const scenarioPath = join(scenariosRoot, scenarioId);
    const expectedPath = join(scenarioPath, 'expected.html');
    assert(existsSync(expectedPath), `${scenarioId}: expected.html is missing`);
    const request = expectedRequest(scenarioPath);
    const expectedHtml = readFileSync(expectedPath, 'utf8');
    for (const language of languageNames) {
      checkRuntime(language, scenarioPath, request, expectedHtml);
      checkRuntime(language, scenarioPath, request, expectedHtml, 'generated');
    }
    process.stdout.write(`[contract] ${scenarioId} passed across ${languageNames.length} languages\n`);
  }
  process.stdout.write(`[contract] manifest, generated declarations, AST/generated mode parity, reflection, state recovery and ${scenarios.length} scenarios passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`[contract] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
