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

test('every RuntimeBindings operation declares its actual native API in every implementation', { timeout: 5000 }, () => {
  const implementations = readParityConfig().implementations.map(item => item.name).sort();
  for (const operation of manifest.runtimeContract.RuntimeBindings.operations) {
    const id = `api-runtime-bindings-${operation.name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
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
      const mapped = mapping.runtimeBindingOperationNames?.[operation.name] ?? operation.name;
      const expected: Record<string, string> = {
        ts: `@polyspec/template!RuntimeBindings#${mapped}:member(1)`,
        go: `github.com/polyspec/template/packages/go/render.RuntimeBindings.${mapped.charAt(0).toUpperCase()}${mapped.slice(1)}`,
        rust: `polyspec_template::render::runtime_bindings::RuntimeBindings::${mapped}`,
        php: `Polyspec\\Template\\Render\\RuntimeBindings::${mapped}`,
        'php-ext': `Polyspec\\Template\\Render\\RuntimeBindings::${mapped}`,
        python: `template.runtime_bindings.RuntimeBindings.${mapped}`,
      };
      assert.equal(binding.symbol, expected[binding.implementation], `${id}: ${binding.implementation}`);
    }
  }
});
