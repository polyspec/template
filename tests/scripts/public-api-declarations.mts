// SDK reference units consume the authoritative parity declarations.
import assert from 'node:assert/strict';
import { jsonDocument } from '../../scripts/json-document.mts';

interface Unit { kind: string; symbols?: { implementation: string; symbol: string }[] }
const config = jsonDocument<{ units: Unit[] }>('public API declarations', {
  type: 'object', required: ['units'], properties: {
    units: { type: 'array', items: { type: 'object', required: ['kind'], properties: {
      kind: { type: 'string' }, symbols: { type: 'array', items: { type: 'object',
        required: ['implementation', 'symbol'], properties: {
          implementation: { type: 'string' }, symbol: { type: 'string' },
        },
      } },
    } } },
  },
});

export function declaredApiSymbols(implementation: string): string[] {
  const units = config.read('config/parity.json').units.filter(unit => unit.kind === 'api');
  const symbols = units.flatMap(unit => {
    assert.ok(unit.symbols, 'an API unit must declare its native symbols');
    return unit.symbols.filter(item => item.implementation === implementation).map(item => item.symbol);
  });
  assert.ok(symbols.length > 0, `${implementation} declares no API symbols`);
  return [...new Set(symbols)];
}
