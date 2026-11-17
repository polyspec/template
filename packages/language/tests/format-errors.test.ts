// The formatter reports a source that does not parse and an invalid delimiters option as its parse result, and throws
// any other failure instead of reporting it as an error of the source.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/core.js', async original => {
  const actual = await original<typeof import('../src/core.js')>();
  return {
    ...actual,
    analyze: (...args: Parameters<typeof actual.analyze>) => {
      if (args[1] === 'broken.tpl') throw new TypeError('an internal failure of the analyzer');
      return actual.analyze(...args);
    },
  };
});

const { format } = await import('../src/index.js');

describe('format errors', () => {
  it('throws an internal failure of the analyzer instead of reporting it as a parse error', () => {
    expect(() => format('{= a}', { name: 'broken.tpl' })).toThrow(TypeError);
  });

  it('reports an invalid delimiters option as a parse error of the kind argument_delimiters, without a position', () => {
    const result = format('{= a}', { delimiters: 'x' });
    expect(result).toMatchObject({ ok: false, error: { reason: 'parse', code: 'argument_delimiters', line: 0, col: 0 } });
  });

  it('reports a source that does not parse with the code of the parser', () => {
    const result = format('{= a', {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('parse');
  });
});
