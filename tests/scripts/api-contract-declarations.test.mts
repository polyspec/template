// API symbols must identify the operation of the shared compiler contract,
// rather than an arbitrary symbol that happens to exist in each implementation.
import assert from 'node:assert/strict';
import test from 'node:test';
import { compilerManifestDocument } from '../../scripts/compiler-manifest.mts';
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
];

for (const contract of contracts) test(`every ${contract.owner} operation declares its actual native API in every implementation`, { timeout: 5000 }, () => {
  const implementations = readParityConfig().implementations.map(item => item.name).sort();
  for (const operation of contract.operations) {
    const kebab = (value: string) => value.replace(/[A-Z]/g, (letter, index: number) => `${index === 0 ? '' : '-'}${letter.toLowerCase()}`);
    const id = `api-${kebab(contract.owner)}-${kebab(operation)}`;
    const unit = parity.units.find(item => item.id === id);
    assert.ok(unit !== undefined, `${id}: missing API operation`);
    assert.equal(unit.kind, 'api');
    assert.ok(unit.requirements.includes('RT-67'), `${id}: trace the compiler contract`);
    assert.ok(unit.symbols !== undefined);
    assert.deepEqual(unit.symbols.map(item => item.implementation).sort(), implementations, id);
    for (const binding of unit.symbols) {
      const language = { ts: 'typescript', go: 'go', rust: 'rust', php: 'php', 'php-ext': 'php', python: 'python' }[binding.implementation];
      assert.ok(language !== undefined);
      const mapping = manifest.languages[language];
      assert.ok(mapping !== undefined, `${id}: language mapping ${language}`);
      const mapped = (contract.owner === 'RuntimeBindings' ? mapping.runtimeBindingOperationNames : mapping.runtimeServiceOperationNames)?.[operation] ?? operation;
      const owner = owners[contract.owner]?.[binding.implementation === 'php-ext' ? 'php' : binding.implementation];
      assert.ok(owner !== undefined);
      const expected = binding.implementation === 'ts' ? `@polyspec/template!${owner}#${mapped}:member(1)`
        : binding.implementation === 'go' ? `${owner}.${mapped.charAt(0).toUpperCase()}${mapped.slice(1)}`
          : binding.implementation === 'rust' || language === 'php' ? `${owner}::${mapped}` : `${owner}.${mapped}`;
      assert.equal(binding.symbol, expected, `${id}: ${binding.implementation}`);
    }
  }
});
