// FMT-16: published formatter data carries native options, results and error fields.
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { FormatError, FormatOptions } from '@polyspec/template';
import { format } from '@polyspec/template-language';
import { jsonDocument } from '../../../scripts/json-document.mts';

const fixture = jsonDocument<{ cases: { id: string; source: string; options: FormatOptions; expected: unknown }[]; errors: FormatError[] }>('formatter SDK data', {
  type: 'object', required: ['cases', 'errors'], properties: {
    cases: { type: 'array', minItems: 1, items: { type: 'object', required: ['id', 'source', 'options', 'expected'], properties: {
      id: { type: 'string' }, source: { type: 'string' }, options: { type: 'object', properties: {
        name: { type: 'string' }, delimiters: { type: 'string' }, templateBlocks: { enum: ['indent', 'flat'] },
        indent: { type: ['string', 'null'] }, range: { type: 'object', required: ['start', 'end'], properties: {
          start: { type: 'integer', minimum: 0 }, end: { type: 'integer', minimum: 0 },
        } },
      } }, expected: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
    } } },
    errors: { type: 'array', minItems: 3, items: { type: 'object', required: ['reason', 'code', 'line', 'col', 'message'], properties: {
      reason: { enum: ['parse', 'invariant', 'html'] }, code: { type: ['string', 'null'] },
      line: { type: 'integer' }, col: { type: 'integer' }, message: { type: 'string' },
    } } },
  },
}).read(fileURLToPath(new URL('../../../tests/fixtures/formatter-sdk.json', import.meta.url)));

describe('formatter SDK data', () => {
  it.each(fixture.cases)('preserves $id', item => {
    const result = format(item.source, item.options);
    if (result.ok) expect(result).toEqual(item.expected);
    else {
      const { message, ...error } = result.error;
      expect(message).not.toBe('');
      expect({ ok: false, error }).toEqual(item.expected);
    }
  });
  it('covers all public error reasons', () => {
    expect([...new Set(fixture.errors.map(error => error.reason))].sort()).toEqual(['html', 'invariant', 'parse']);
  });
});
