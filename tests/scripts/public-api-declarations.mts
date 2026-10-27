// SDK reference units consume the authoritative parity declarations.
import assert from 'node:assert/strict';
import { jsonDocument } from '../../scripts/json-document.mts';

interface Unit { kind: string; symbols?: { implementation: string; symbol?: string; symbols?: string[] }[] }
export const apiBindingSchema = {
  type: 'object',
  oneOf: [
    {
      required: ['implementation', 'symbol'], additionalProperties: false,
      properties: { implementation: { type: 'string' }, symbol: { type: 'string', minLength: 1 } },
    },
    {
      required: ['implementation', 'symbols'], additionalProperties: false,
      properties: {
        implementation: { type: 'string' },
        symbols: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', minLength: 1 } },
      },
    },
  ],
};

export const publicApiDeclarationsDocument = jsonDocument<{ units: Unit[] }>('public API declarations', {
  type: 'object', required: ['units'], properties: {
    units: { type: 'array', items: { type: 'object', required: ['kind'], properties: {
      kind: { type: 'string' }, symbols: { type: 'array', items: apiBindingSchema },
    } } },
  },
});

export function declaredApiSymbols(implementation: string): string[] {
  const units = publicApiDeclarationsDocument.read('config/parity.json').units.filter(unit => unit.kind === 'api');
  const symbols = units.flatMap(unit => {
    assert.ok(unit.symbols, 'an API unit must declare its native symbols');
    return unit.symbols.filter(item => item.implementation === implementation).flatMap(item => {
      if (item.symbol !== undefined) return [item.symbol];
      assert.ok(item.symbols, 'a native API binding must name its exact symbols');
      return item.symbols;
    });
  });
  assert.ok(symbols.length > 0, `${implementation} declares no API symbols`);
  return [...new Set(symbols)];
}
