// Truthiness, equality, ordering and binding (EXP-33 to EXP-38, VAL-13).
import { describe, expect, it } from 'vitest';
import { AstProgram, MapLoader } from '../../src/index.js';
import { bindValue, BindError } from '../../src/value/bind.js';
import { parseJson } from '../../src/value/json.js';
import { compareValues, isTruthy, looseEquals, strictEquals, SafeString } from '../../src/value/value.js';

describe('truthiness', () => {
  // EXP-33: only null, false, 0, -0, the empty string, the empty list and the empty map are falsy.
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

describe('bindValue', () => {
  it('rejects unsupported values and out-of-range integers', () => {
    expect(() => bindValue(NaN)).toThrow(BindError);
    expect(() => bindValue(() => 1)).toThrow(BindError);
    expect(() => bindValue(BigInt('9007199254740992'))).toThrow(BindError);
    expect(bindValue({ a: [1, 'b'] })).toEqual(new Map([['a', [1, 'b']]]));
  });

  it('binds a hole of a sparse host list as null, as it binds undefined (RT-4)', () => {
    // The list [1, , 3], whose index 1 is a hole.
    const sparse: number[] = [1];
    sparse[2] = 3;
    const program = new AstProgram({ loader: new MapLoader({ 'item.tpl': '[{= list.1}]' }) });
    expect(program.render('item.tpl', { list: sparse })).toBe(program.render('item.tpl', { list: [1, null, 3] }));
    expect(bindValue({ list: sparse })).toStrictEqual(new Map([['list', [1, null, 3]]]));
  });
});

describe('parseJson', () => {
  it('preserves document order and checks integer literals', () => {
    const value = parseJson('{"2": 1, "1": 2, "x": 1e15}');
    if (!(value instanceof Map)) throw new Error('a JSON object parses to a map');
    expect([...value.keys()]).toEqual(['2', '1', 'x']);
    expect(() => parseJson('9007199254740992')).toThrow(BindError);
    expect(() => parseJson('1e400')).toThrow(BindError);
  });
});
