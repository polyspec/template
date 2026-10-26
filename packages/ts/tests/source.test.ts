// LEX-24: the published Source API preserves UTF-8 and native-index semantics.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { Source, TemplateError } from '@polyspec/template';
import { repoRoot } from './helpers.js';
import { jsonDocument } from '../../../scripts/json-document.mts';

interface Valid {
  id: string; name: string; input: string; rawHex: string; text: string; hex: string; lines: number[];
  offsets: { utf16: number[] }; probe: { offset: number; end: number; line: number; col: number };
}
interface Invalid { id: string; hex: string; offset: number; line: number; col: number }
const fixture = jsonDocument<{ valid: Valid[]; invalid: Invalid[] }>('source fixture', {
  type: 'object', required: ['valid', 'invalid'], properties: {
    valid: { type: 'array', items: { type: 'object', required: ['id', 'name', 'input', 'rawHex', 'text', 'hex', 'lines', 'offsets', 'probe'], properties: {
      id: { type: 'string' }, name: { type: 'string' }, input: { type: 'string' }, rawHex: { type: 'string' }, text: { type: 'string' }, hex: { type: 'string' },
      lines: { type: 'array', items: { type: 'integer' } }, offsets: { type: 'object', required: ['utf16'], properties: { utf16: { type: 'array', items: { type: 'integer' } } } },
      probe: { type: 'object', required: ['offset', 'end', 'line', 'col'], properties: { offset: { type: 'integer' }, end: { type: 'integer' }, line: { type: 'integer' }, col: { type: 'integer' } } },
    } } },
    invalid: { type: 'array', items: { type: 'object', required: ['id', 'hex', 'offset', 'line', 'col'], properties: {
      id: { type: 'string' }, hex: { type: 'string' }, offset: { type: 'integer' }, line: { type: 'integer' }, col: { type: 'integer' },
    } } },
  },
}).parse(readFileSync(join(repoRoot, 'tests/fixtures/source-context.json'), 'utf8'), 'source fixture');

describe('public source contexts', () => {
  it.each(fixture.valid)('preserves $id', item => {
    const input = Uint8Array.from(Buffer.from(item.rawHex, 'hex'));
    const contexts = [Source.fromBytes(item.name, input), Source.fromText(item.name, item.input)];
    input.fill(0);
    for (const source of contexts) {
      expect([source.name, source.text, Buffer.from(source.bytes).toString('hex'), source.lines]).toEqual([item.name, item.text, item.hex, item.lines]);
      expect(source.length).toBe(item.offsets.utf16.length - 1);
      for (let start = 0; start < item.offsets.utf16.length; start++) {
        expect(source.byteAt(start)).toBe(item.offsets.utf16[start]);
        for (let end = start; end < item.offsets.utf16.length; end++) {
          expect(source.span(start, end)).toEqual([item.offsets.utf16[start], item.offsets.utf16[end]]);
        }
      }
      expect(Source.lineIndex(source.bytes)).toEqual(item.lines);
      expect(Source.position(source.lines, item.probe.offset)).toEqual([item.probe.line, item.probe.col]);
      expect(source.error('E_PARSE_UNEXPECTED_TOKEN', item.probe.offset, item.probe.end, 'message').toObject()).toEqual({
        code: 'E_PARSE_UNEXPECTED_TOKEN', template: item.name, line: item.probe.line, col: item.probe.col,
        offset: item.probe.offset, end: item.probe.end, message: 'message',
      });
      expect(() => source.byteAt(source.length + 1)).toThrow(RangeError);
      expect(() => source.span(1, 0)).toThrow(RangeError);
    }
  });

  it.each(fixture.invalid)('rejects $id', item => {
    try { Source.fromBytes('invalid.tpl', Uint8Array.from(Buffer.from(item.hex, 'hex'))); assert.fail('invalid UTF-8 accepted'); }
    catch (error) {
      assert.ok(error instanceof TemplateError);
      expect([error.code, error.offset, error.end, error.line, error.col]).toEqual(['E_LEX_INVALID_UTF8', item.offset, item.offset + 1, item.line, item.col]);
    }
  });

  it('rejects an unpaired text surrogate as a lexical error', () => {
    expect(() => Source.fromText('invalid.tpl', 'a\n\ud800')).toThrow(TemplateError);
  });
});
