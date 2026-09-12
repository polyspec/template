#!/usr/bin/env node
// Checks the manifest-generated declarations, language implementations and runtime state proof.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const adapterRoot = join(root, 'tools', 'showcase', 'adapters');
const scenariosRoot = join(root, 'examples', 'site', 'scenarios');
const manifest = JSON.parse(readFileSync(join(root, 'tools', 'compiler', 'interface.json'), 'utf8')).showcaseAdapter;
const operationNames = manifest.operations.map(operation => operation.name);
const languageNames = ['typescript', 'javascript', 'go', 'rust', 'php'];
const requiredSupportLevels = ['core-runtime', 'source-compiler', 'artifact-runtime', 'generated-compiler'];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function run(label, command, args, cwd = root, extraEnv = {}) {
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

function readContractFile(relativePath) {
  const path = join(adapterRoot, relativePath);
  if (!existsSync(path)) throw new Error(`contract file is missing: tools/showcase/adapters/${relativePath}`);
  return readFileSync(path, 'utf8');
}

function assert(condition, message) {
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
    join(root, 'tools/showcase/generate-direct.mjs'),
    join(adapterRoot, 'generated/native_direct.ts'),
    join(adapterRoot, 'generated/native_direct.mjs'),
    join(adapterRoot, 'generated/native_direct.php'),
    join(adapterRoot, 'go/native_direct.go'),
    join(adapterRoot, 'rust/src/native_direct.rs'),
  ]) assert(!existsSync(removed), `removed showcase generator path returned: ${removed}`);
  const checks = {
    typescript: [/new Engine\(generated[\s\S]*?generatedProgram\(root\)/, /render\(request:[\s\S]*?return this\.engine\.render/],
    javascript: [/new Engine\(generated[\s\S]*?generatedProgram\(root\)/, /render\(request\)[\s\S]*?return this\.engine\.render/],
    go: [/program, err = generatedProgram/, /engine := template\.NewEngine\(program\)/, /func \(a \*Adapter\) Render[\s\S]*?return a\.engine\.Render/],
    rust: [/generated_engine\([\s\S]*?Engine::new\(generated::/, /fn render\(&self,[\s\S]*?self\.engine\s*\.render/],
    php: [/generatedProgram\(\$root\)/, /new Engine\(\$program\)/, /public function render\(RenderRequest \$request\)[\s\S]*?\$this->engine->render/],
  };
  for (const [language, patterns] of Object.entries(checks)) {
    const source = readContractFile(manifest.languages[language].file);
    for (const pattern of patterns) assert(pattern.test(source), `${language}: generated execution is not connected through a Program`);
  }
  const allSource = languageNames.map(language => readContractFile(manifest.languages[language].file)).join('\n');
  assert(!/GeneratedRenderer|GeneratedRequest|GeneratedPreparedRender|generated_renderer|generatedRenderer/.test(allSource), 'adapter still uses the removed generated callback contract');
  assert(!/CompileModeGen|CompileMode::Gen|compile\.mode/.test(allSource), 'adapter still selects generated execution inside an AST engine');
  assert(!allSource.includes('native_templates'), 'generated execution still packages an AST template loader');

  const scenarios = readdirSync(scenariosRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(join(scenariosRoot, entry.name, 'scenario.json')))
    .map(entry => entry.name)
    .sort();
  const generatedChecks = {
    typescript: id => [`generated/typed/${id}.ts`, /export class GeneratedProgram implements Program/],
    javascript: id => [`generated/javascript/${id}.js`, /export class GeneratedProgram/],
    go: id => [`go/generated/${id}/generated.go`, /type GeneratedProgram struct[\s\S]*?func \(p \*GeneratedProgram\) Prepare/],
    rust: id => [`generated/typed/${id}.rust`, /pub struct GeneratedProgram[\s\S]*?impl Program for GeneratedProgram/],
    php: id => [`generated/typed/${id}.php`, /final class GeneratedProgram implements Program/],
  };
  for (const [language, generatedCheck] of Object.entries(generatedChecks)) {
    for (const scenario of scenarios) {
      const [file, pattern] = generatedCheck(scenario);
      const generated = readContractFile(file);
      assert(pattern.test(generated), `${language}/${scenario}: generated artifact does not implement Program`);
    }
  }
}

function assertOrderedShape(actual, expected, path = '$') {
  if (actual === null || expected === null || typeof actual !== 'object' || typeof expected !== 'object') {
    assert(Object.is(actual, expected), `${path} differs: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
    return;
  }
  assert(Array.isArray(actual) === Array.isArray(expected), `${path} changes array/object kind`);
  if (Array.isArray(actual)) {
    assert(actual.length === expected.length, `${path} changes array length`);
    for (let index = 0; index < actual.length; index++) assertOrderedShape(actual[index], expected[index], `${path}[${index}]`);
    return;
  }
  const actualKeys = Object.keys(actual);
  const expectedKeys = Object.keys(expected);
  assert(JSON.stringify(actualKeys) === JSON.stringify(expectedKeys), `${path} changes ordered fields`);
  for (const key of expectedKeys) assertOrderedShape(actual[key], expected[key], `${path}.${key}`);
}

function digest(bytes) {
  return {
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function expectedRequest(scenarioPath) {
  const metadata = JSON.parse(readFileSync(join(scenarioPath, 'scenario.json'), 'utf8'));
  const request = {
    target: metadata.target,
    assign: JSON.parse(readFileSync(join(scenarioPath, 'data.json'), 'utf8')),
    define: JSON.parse(readFileSync(join(scenarioPath, 'define.json'), 'utf8')),
  };
  const environmentPath = join(scenarioPath, 'env.json');
  if (existsSync(environmentPath)) request.env = JSON.parse(readFileSync(environmentPath, 'utf8'));
  return request;
}

function parseRuntimeOutput(language, stdout) {
  const text = stdout.trim();
  assert(text.length > 0, `${language} adapter produced no JSON output`);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${language} adapter produced invalid JSON: ${error.message}\n${text}`);
  }
}

function runtimeCommand(language, scenarioPath, mode = 'ast') {
  const definition = manifest.languages[language];
  const source = join(adapterRoot, definition.file);
  const env = mode === 'generated' ? { SHOWCASE_EXECUTION_MODE: 'generated' } : {};
  if (language === 'typescript') return [process.execPath, ['--experimental-strip-types', source, scenarioPath], root, env];
  if (language === 'javascript') return [process.execPath, [source, scenarioPath], root, env];
  if (language === 'go') return ['go', ['run', '.', scenarioPath], join(adapterRoot, 'go'), env];
  if (language === 'rust') {
    const cargo = join(process.env.HOME ?? '', '.cargo', 'bin', 'cargo');
    return [existsSync(cargo) ? cargo : 'cargo', ['run', '--quiet', '--locked', '--manifest-path', join(adapterRoot, 'rust', 'Cargo.toml'), '--', scenarioPath], root, env];
  }
  return ['php', [source, scenarioPath], root, env];
}

function checkStaticImplementation(language) {
  const definition = manifest.languages[language];
  const source = readContractFile(definition.file);
  const generated = readContractFile(definition.generated);
  const constructorName = definition.constructorName;
  const constructorPattern = language === 'typescript' || language === 'javascript'
    ? /\bconstructor\s*\(/
    : new RegExp(`(?:func|fn|function)\\s+${escapeRegExp(constructorName)}\\s*\\(`);
  assert(constructorPattern.test(source), `${language} does not declare constructor ${constructorName}`);
  for (const owned of manifest.constructor.owns) {
    const field = owned.split('.').pop();
    assert(new RegExp(`\\b${escapeRegExp(field)}\\b`).test(source), `${language} does not declare owned field ${field}`);
  }
  let previous = -1;
  for (const operation of manifest.operations) {
    const languageOperation = definition.operationNames[operation.name];
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
}

async function checkRuntimeAssertionHelpers() {
  const contract = await import(pathToFileURL(join(adapterRoot, manifest.languages.javascript.generated)).href);
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
  const source = join(adapterRoot, manifest.languages.php.file);
  const expected = JSON.stringify(operationNames.map(name => manifest.languages.php.operationNames[name]));
  const probe = [
    `require ${JSON.stringify(source)};`,
    `$reflection = new ReflectionClass('Adapter');`,
    `$expected = json_decode(${JSON.stringify(expected)}, true);`,
    `$actual = [];`,
    `foreach ($reflection->getMethods(ReflectionMethod::IS_PUBLIC) as $method) {`,
    `    if ($method->getDeclaringClass()->getName() === 'Adapter' && $method->getName() !== '__construct') $actual[] = $method->getName();`,
    `}`,
    `if ($actual !== $expected) { fwrite(STDERR, 'Adapter methods do not match the manifest' . PHP_EOL); exit(1); }`,
    `$constructor = $reflection->getConstructor();`,
    `if ($constructor === null || $constructor->getNumberOfParameters() !== 1 || $constructor->getParameters()[0]->getName() !== 'root') { fwrite(STDERR, 'Adapter constructor does not match the manifest' . PHP_EOL); exit(1); }`,
    `echo 'reflection passed' . PHP_EOL;`,
  ].join('\n');
  run('PHP ReflectionClass', 'php', ['-r', probe, '--', root]);
}

function checkRuntime(language, scenarioPath, request, expectedHtml, mode = 'ast') {
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
  run('manifest generator', process.execPath, ['scripts/generate-showcase-contract.mjs', '--check']);
  run('product generated compiler', process.execPath, ['tools/showcase/compile-generated.mjs', '--refresh', 'dev', '--check']);
  for (const language of languageNames) checkStaticImplementation(language);

  run('TypeScript declarations', 'npx', ['--no-install', 'tsc', '--noEmit', '-p', 'tools/showcase/adapters/tsconfig.json']);
  const gofmt = run('Go formatting', 'gofmt', ['-d', join(adapterRoot, 'go', 'main.go'), join(adapterRoot, 'go', 'render_adapter.go')]);
  assert(gofmt.trim() === '', `Go sources are not formatted:\n${gofmt}`);
  run('Go contract compilation', 'go', ['test', './...'], join(adapterRoot, 'go'));
  const cargo = join(process.env.HOME ?? '', '.cargo', 'bin', 'cargo');
  run('Rust contract compilation', existsSync(cargo) ? cargo : 'cargo', ['check', '--locked', '--manifest-path', join(adapterRoot, 'rust', 'Cargo.toml')]);
  run('PHP generated declaration syntax', 'php', ['-l', join(adapterRoot, manifest.languages.php.generated)]);
  run('PHP adapter syntax', 'php', ['-l', join(adapterRoot, manifest.languages.php.file)]);
  checkPhpReflection();
  await checkRuntimeAssertionHelpers();

  const scenarioIds = readdirSync(scenariosRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(join(scenariosRoot, entry.name, 'scenario.json')))
    .map(entry => entry.name)
    .sort();
  assert(scenarioIds.length > 0, 'showcase scenarios are missing');
  for (const scenarioId of scenarioIds) {
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
  process.stdout.write(`[contract] manifest, generated declarations, AST/generated mode parity, reflection, state recovery and ${scenarioIds.length} scenarios passed\n`);
}

main().catch(error => {
  process.stderr.write(`[contract] ${error.message}\n`);
  process.exitCode = 1;
});
