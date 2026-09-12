// Truthiness, equality, ordering and binding (EXP-33 to EXP-38, VAL-13).
import { describe, expect, it } from 'vitest';
import { bind, BindError } from '../../src/value/bind.js';
import { parseJson } from '../../src/value/json.js';
import { compareValues, isTruthy, looseEquals, strictEquals, SafeString } from '../../src/value/value.js';

describe('truthiness', () => {
  it('treats only the listed values as falsy', () => {
    expect(isTruthy(null)).toBe(false);
    expect(isTruthy(false)).toBe(false);
    expect(isTruthy(0)).toBe(false);
    expect(isTruthy(-0)).toBe(false);
    expect(isTruthy('')).toBe(false);
    expect(isTruthy([])).toBe(false);
    expect(isTruthy(new Map())).toBe(false);
    expect(isTruthy('0')).toBe(true);
    expect(isTruthy(' ')).toBe(true);
    expect(isTruthy(new SafeString(''))).toBe(false);
  });
});

describe('equality', () => {
  it('coerces numeric strings for == only', () => {
    expect(looseEquals('3', 3)).toBe(true);
    expect(strictEquals('3', 3)).toBe(false);
    expect(looseEquals('x', 3)).toBe(false);
    expect(looseEquals(null, '')).toBe(false);
    expect(looseEquals([1, '2'], [1, 2])).toBe(true);
    expect(looseEquals(new Map([['a', 1], ['b', 2]]), new Map([['b', 2], ['a', 1]]))).toBe(true);
  });
});

describe('ordering', () => {
  it('orders numbers and strings only', () => {
    expect(compareValues(1, 2)).toBeLessThan(0);
    expect(compareValues('10', '9')).toBeLessThan(0);
    expect(compareValues('Ａ', '😀')).toBeLessThan(0);
    expect(compareValues(1, '2')).toBeNull();
  });
});

describe('bind', () => {
  it('rejects unsupported values and out-of-range integers', () => {
    expect(() => bind(NaN)).toThrow(BindError);
    expect(() => bind(() => 1)).toThrow(BindError);
    expect(() => bind(BigInt('9007199254740992'))).toThrow(BindError);
    expect(bind({ a: [1, 'b'] })).toEqual(new Map([['a', [1, 'b']]]));
  });
});

describe('parseJson', () => {
  it('preserves document order and checks integer literals', () => {
    const value = parseJson('{"2": 1, "1": 2, "x": 1e21}') as Map<string, unknown>;
    expect([...value.keys()]).toEqual(['2', '1', 'x']);
    expect(() => parseJson('9007199254740992')).toThrow(BindError);
    expect(() => parseJson('1e400')).toThrow(BindError);
  });
});
