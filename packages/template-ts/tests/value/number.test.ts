// Number formatting (VAL-9, FUN-20 to FUN-25).
import { describe, expect, it } from 'vitest';
import { formatNumber, numberToString, positional, roundNumber, shortestDigits } from '../../src/value/number.js';

describe('numberToString', () => {
  it('follows the ECMAScript layout', () => {
    expect(numberToString(1)).toBe('1');
    expect(numberToString(-0)).toBe('0');
    expect(numberToString(0.1 + 0.2)).toBe('0.30000000000000004');
    expect(numberToString(1e21)).toBe('1e+21');
    expect(numberToString(1e-7)).toBe('1e-7');
    expect(numberToString(123456789012345680000)).toBe('123456789012345680000');
  });
});

describe('shortestDigits and positional', () => {
  it('decomposes numbers into digits and exponent', () => {
    expect(shortestDigits(1234.5)).toEqual({ negative: false, digits: '12345', exponent: 4 });
    expect(shortestDigits(0.001)).toEqual({ negative: false, digits: '1', exponent: -2 });
    expect(positional(2.675)).toEqual({ negative: false, integer: '2', fraction: '675' });
    expect(positional(1e21)).toEqual({ negative: false, integer: '1000000000000000000000', fraction: '' });
    expect(positional(-0.5)).toEqual({ negative: true, integer: '0', fraction: '5' });
  });
});

describe('formatNumber', () => {
  it('rounds half away from zero on decimal digits', () => {
    expect(formatNumber(2.675, 2, '.', ',')).toBe('2.68');
    expect(formatNumber(1.005, 2, '.', ',')).toBe('1.01');
    expect(formatNumber(-2.5, 0, '.', ',')).toBe('-3');
    expect(formatNumber(-0.001, 2, '.', ',')).toBe('0.00');
    expect(formatNumber(12345.5, 0, '.', ',')).toBe('12,346');
    expect(formatNumber(1234567.891, 2, ',', '.')).toBe('1.234.567,89');
    expect(formatNumber(999.999, 2, '.', ',')).toBe('1,000.00');
  });
});

describe('roundNumber', () => {
  it('returns the rounded value as a number', () => {
    expect(roundNumber(2.675, 2)).toBe(2.68);
    expect(roundNumber(-2.5, 0)).toBe(-3);
    expect(roundNumber(0.5, 0)).toBe(1);
  });
});
