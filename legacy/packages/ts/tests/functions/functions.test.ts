// Built-in functions that need checks beyond the fixture cases.
import { describe, expect, it } from 'vitest';
import { formatDate, parseOffset, toUnixSeconds } from '../../src/functions/date.js';
import { percentEncode, toJson } from '../../src/functions/encoding.js';
import { builtins } from '../../src/functions/index.js';
import { AstProgram, Engine, MapLoader } from '../../src/index.js';
import { SafeString } from '../../src/value/value.js';

const env = { env: { timezone: 'Z', now: 0 } };

describe('date', () => {
  // FUN-39: the output is computed in the fixed offset of the time zone; FUN-40: the format tokens.
  it('parses offsets and formats civil dates', () => {
    expect(parseOffset('+09:00')).toBe(32400);
    expect(parseOffset('-05:30')).toBe(-19800);
    expect(parseOffset('+24:00')).toBeNull();
    expect(formatDate(1789084800, 'Y-m-d H:i:s D P', 32400)).toBe('2026-09-11 09:00:00 Fri +09:00');
    expect(formatDate(0, 'Y-m-d l N w', 0)).toBe('1970-01-01 Thursday 4 4');
    expect(formatDate(-86400, 'Y-m-d', 0)).toBe('1969-12-31');
  });
  it('parses date strings with and without offsets', () => {
    expect(toUnixSeconds('1970-01-02', 0)).toBe(86400);
    expect(toUnixSeconds('1970-01-01T00:00:00+01:00', 0)).toBe(-3600);
    expect(toUnixSeconds('1970-01-01 00:00:00', 3600)).toBe(-3600);
    expect(() => toUnixSeconds('1970-13-01', 0)).toThrow();
  });
  it('rejects a date string whose offset is out of range', () => {
    expect(() => toUnixSeconds('2024-01-01T12:00:00+25:00', 0)).toThrow('is not a date');
    expect(() => toUnixSeconds('2024-01-01T12:00:00+05:60', 0)).toThrow('is not a date');
  });
});

describe('json and url', () => {
  it('escapes the characters that matter inside script and href', () => {
    expect(toJson(new Map([['a', '<&> ']]))).toBe('{"a":"\\u003c\\u0026\\u003e\\u2028"}');
    expect(toJson([1e21, 0.1, null, true, new SafeString('x')])).toBe('[1e+21,0.1,null,true,"x"]');
    expect(percentEncode("a b/é~!*'()")).toBe('a%20b%2F%C3%A9~%21%2A%27%28%29');
  });
});

describe('arity table', () => {
  // FUN-3: the number of arguments is checked at evaluation time against the declared minimum and maximum.
  it('declares minimum and maximum arguments for every built-in', () => {
    for (const [name, fn] of builtins) {
      expect(fn.min, name).toBeLessThanOrEqual(fn.max);
    }
    expect(builtins.get('now')?.call([], env)).toBe(0);
    for (const source of ['{= upper()}', "{= upper('a', 'b')}"]) {
      const engine = new Engine(new AstProgram({ loader: new MapLoader({ 'a.tpl': source }) }));
      expect(() => engine.render('a.tpl', {}), source).toThrow(expect.objectContaining({ code: 'E_RUNTIME_ARITY' }));
    }
  });
});
