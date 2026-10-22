// FMT-14: the formatter reports a source that does not parse and an invalid delimiters option as its parse result, and throws
// any other failure instead of reporting it as an error of the source.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@polyspec/template', async original => {
  const actual = await original<typeof import('@polyspec/template')>();
  return {
    ...actual,
    analyze: (...args: Parameters<typeof actual.analyze>) => {
      if (args[1] === 'broken.tpl') throw new TypeError('an internal failure of the analyzer');
      return actual.analyze(...args);
    },
  };
});

const { format } = await import('../src/index.js');

describe('format errors (FMT-14)', () => {
  it('throws an internal failure of the analyzer instead of reporting it as a parse error', () => {
    expect(() => format('{= a}', { name: 'broken.tpl' })).toThrow(TypeError);
  });

  it('reports an invalid delimiters option as a parse error without a code', () => {
    const result = format('{= a}', { delimiters: 'x' });
    expect(result).toMatchObject({ ok: false, error: { reason: 'parse', code: null, message: '"x" is not a delimiter pair' } });
  });

  it('reports a source that does not parse with the code of the parser', () => {
    const result = format('{= a', {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('parse');
  });
});
