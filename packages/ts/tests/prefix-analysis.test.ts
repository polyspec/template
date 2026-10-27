// EDT-11: prefix analysis preserves accepted ranges and the first parser error.
import { describe, expect, it } from 'vitest';
import { analyzePrefix, Source, TemplateError, type ErrorObject, type PrefixAnalysis } from '@polyspec/template';
import { analysisFixtures, projectRanges } from './analysis-fixtures.js';

const cases = analysisFixtures('prefix-analysis.json', 'prefix');

describe('public prefix analysis', () => {
  it.each(cases)('preserves $id', item => {
    const options = item.delimiters === undefined ? {} : { delimiters: item.delimiters };
    const result: PrefixAnalysis = analyzePrefix(item.source, item.name, options);
    expect(Object.keys(result).sort()).toEqual(['ast', 'error', 'tags', 'tokens']);
    const source = Source.fromText(item.name, item.source);
    let error: Omit<ErrorObject, 'message'> | null = null;
    if (result.error) {
      const { message, ...fields } = result.error.toObject();
      expect(message).not.toBe(''); // ERR-1: message is free English text.
      error = fields;
    }
    expect({ ast: result.ast, ...projectRanges(source, result), error }).toEqual(item.expected);
  });
  it('rejects invalid source and options at the SDK boundary', () => {
    try {
      analyzePrefix(new Uint8Array([255]), 'invalid.tpl');
      expect.unreachable('invalid UTF-8 was accepted');
    } catch (error) {
      expect(error).toBeInstanceOf(TemplateError);
      expect(error).toMatchObject({ code: 'E_LEX_INVALID_UTF8' });
    }
    expect(() => analyzePrefix('x', 'invalid.tpl', { delimiters: '[' })).toThrow('is not a delimiter pair');
    expect(() => analyzePrefix('x', 'invalid.tpl', { delimiters: '[' })).not.toThrow(TemplateError);
  });
});
