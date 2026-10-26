// API symbols must identify the operation of the shared compiler contract,
// rather than an arbitrary symbol that happens to exist in each implementation.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compilerManifestDocument } from '../../scripts/compiler-manifest.mts';
import { CATALOG, goName, parseCatalog } from '../../scripts/generate-error-codes.mts';
import { jsonDocument } from '../../scripts/json-document.mts';
import { readParityConfig } from '../../scripts/parity-config.mts';

interface Unit {
  id: string;
  kind: string;
  requirements: string[];
  symbols?: { implementation: string; symbol: string }[];
}

const parity = jsonDocument<{ units: Unit[] }>('API units', {
  type: 'object', required: ['units'],
  properties: { units: { type: 'array', items: {
    type: 'object', required: ['id', 'kind', 'requirements'],
    properties: {
      id: { type: 'string' }, kind: { type: 'string' },
      requirements: { type: 'array', items: { type: 'string' } },
      symbols: { type: 'array', items: {
        type: 'object', required: ['implementation', 'symbol'],
        properties: { implementation: { type: 'string' }, symbol: { type: 'string' } },
      } },
    },
  } } },
}).read('config/parity.json');
const manifest = compilerManifestDocument.read('packages/compiler/interface.json');

const owners: Record<string, Record<string, string>> = {
  RuntimeEnvironment: {
    ts: 'RuntimeEnvironment', go: 'github.com/polyspec/template/packages/go/render.RuntimeEnvironment',
    rust: 'polyspec_template::RuntimeEnvironment',
    php: 'Polyspec\\Template\\Render\\RuntimeEnvironment', python: 'template.runtime_environment.RuntimeEnvironment',
  },
  PreparedRender: {
    ts: 'PreparedRender', go: 'github.com/polyspec/template/packages/go/render.PreparedRender',
    rust: 'polyspec_template::PreparedRender', php: 'Polyspec\\Template\\PreparedRender',
    python: 'template.engine.PreparedRender',
  },
  RuntimeBindings: {
    ts: 'RuntimeBindings', go: 'github.com/polyspec/template/packages/go/render.RuntimeBindings',
    rust: 'polyspec_template::render::runtime_bindings::RuntimeBindings',
    php: 'Polyspec\\Template\\Render\\RuntimeBindings', python: 'template.runtime_bindings.RuntimeBindings',
  },
  RuntimeServices: {
    ts: 'RuntimeServices', go: 'github.com/polyspec/template/packages/go/render.RuntimeServices',
    rust: 'polyspec_template::render::context::RuntimeServices',
    php: 'Polyspec\\Template\\Render\\RuntimeServices', python: 'template.runtime_environment.RuntimeServices',
  },
  Program: {
    ts: 'Program', go: 'github.com/polyspec/template/packages/go.Program', rust: 'polyspec_template::Program',
    php: 'Polyspec\\Template\\Program', python: 'template.engine.Program',
  },
  Engine: {
    ts: 'Engine', go: 'github.com/polyspec/template/packages/go.Engine', rust: 'polyspec_template::Engine',
    php: 'Polyspec\\Template\\Engine', python: 'template.engine.Engine',
  },
};

const contracts = [
  { owner: 'RuntimeBindings', operations: manifest.runtimeContract.RuntimeBindings.operations.map(item => item.name) },
  { owner: 'RuntimeServices', operations: manifest.runtimeContract.RuntimeServices.operations.map(item => item.name) },
  { owner: 'Program', operations: manifest.runtimeContract.Program.operations.map(item => item.name) },
  { owner: 'Engine', operations: manifest.runtimeContract.Engine.operations },
  // The remaining RuntimeEnvironment operations implement RuntimeServices;
  // registration is the additional contract of the concrete environment.
  { owner: 'RuntimeEnvironment', operations: manifest.runtimeContract.RuntimeEnvironment.operations
    .map(item => item.name).filter(name => !manifest.runtimeContract.RuntimeServices.operations.some(item => item.name === name)) },
  { owner: 'PreparedRender', operations: ['render'] },
];

for (const contract of contracts) test(`every ${contract.owner} operation declares its actual native API in every implementation`, { timeout: 5000 }, () => {
  const implementations = readParityConfig().implementations.map(item => item.name).sort();
  for (const operation of contract.operations) {
    const kebab = (value: string) => value.replace(/[A-Z]/g, (letter, index: number) => `${index === 0 ? '' : '-'}${letter.toLowerCase()}`);
    const id = `api-${kebab(contract.owner)}-${kebab(operation)}`;
    const unit = parity.units.find(item => item.id === id);
    assert.ok(unit !== undefined, `${id}: missing API operation`);
    assert.equal(unit.kind, 'api');
    assert.ok(unit.requirements.includes(contract.owner === 'PreparedRender' ? 'RT-62' : 'RT-67'), `${id}: trace the runtime contract`);
    assert.ok(unit.symbols !== undefined);
    assert.deepEqual(unit.symbols.map(item => item.implementation).sort(), implementations, id);
    for (const binding of unit.symbols) {
      const language = { ts: 'typescript', go: 'go', rust: 'rust', php: 'php', 'php-ext': 'php', python: 'python' }[binding.implementation];
      assert.ok(language !== undefined);
      const mapping = manifest.languages[language];
      assert.ok(mapping !== undefined, `${id}: language mapping ${language}`);
      const environmentIndex = manifest.runtimeContract.RuntimeEnvironment.operations.findIndex(item => item.name === operation);
      const mapped = contract.owner === 'RuntimeEnvironment'
        ? mapping.runtimeEnvironmentOperations[environmentIndex]
        : (contract.owner === 'RuntimeBindings' ? mapping.runtimeBindingOperationNames : mapping.runtimeServiceOperationNames)?.[operation] ?? operation;
      assert.ok(mapped !== undefined, `${id}: native operation name`);
      const owner = owners[contract.owner]?.[binding.implementation === 'php-ext' ? 'php' : binding.implementation];
      assert.ok(owner !== undefined);
      const expected = binding.implementation === 'ts' ? `@polyspec/template!${owner}#${mapped}:member(1)`
        : binding.implementation === 'go' ? `${owner}.${mapped.charAt(0).toUpperCase()}${mapped.slice(1)}`
          : binding.implementation === 'rust' || language === 'php' ? `${owner}::${mapped}` : `${owner}.${mapped}`;
      assert.equal(binding.symbol, expected, `${id}: ${binding.implementation}`);
    }
  }
});

test('each error code publishes its native literal or code type/catalog', { timeout: 5000 }, () => {
  // String-union and native-string representations do not introduce a named
  // constant per value. Their membership remains enforced by error-codes-check
  // and parity's complete catalog comparison, alongside these publication points.
  const codes = parseCatalog(readFileSync(CATALOG, 'utf8'));
  const implementations = readParityConfig().implementations.map(item => item.name).sort();
  const expectedIds = codes.map(({ code }) => `api-error-code-value-${code.slice(2).toLowerCase().replaceAll('_', '-')}`);
  assert.deepEqual(parity.units.filter(unit => unit.id.startsWith('api-error-code-value-')).map(unit => unit.id).sort(), [...expectedIds].sort());
  for (const { code } of codes) {
    const id = `api-error-code-value-${code.slice(2).toLowerCase().replaceAll('_', '-')}`;
    const unit = parity.units.find(item => item.id === id);
    assert.ok(unit !== undefined);
    assert.equal(unit.kind, 'api');
    assert.ok(unit.requirements.includes('ERR-1'));
    assert.ok(unit.symbols !== undefined);
    assert.deepEqual(unit.symbols.map(item => item.implementation).sort(), implementations, id);
    const expected: Record<string, string> = {
      ts: '@polyspec/template!ErrorCode:type',
      go: `github.com/polyspec/template/packages/go/errs.${goName(code)}`,
      rust: `polyspec_template::ErrorCode::${code}`,
      php: `Polyspec\\Template\\ErrorCode::${code}`,
      'php-ext': `Polyspec\\Template\\ErrorCode::${code}`,
      python: 'template.ERROR_CODES',
    };
    for (const binding of unit.symbols) assert.equal(binding.symbol, expected[binding.implementation], `${id}: ${binding.implementation}`);
  }
});
