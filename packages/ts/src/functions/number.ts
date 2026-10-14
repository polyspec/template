// number, round, floor, ceil, abs, min, max, num (FUN-16, FUN-17, FUN-20 to FUN-25).
import { defined } from '../checked.js';
import { formatNumber, roundNumber } from '../value/number.js';
import type { Value } from '../value/value.js';
import { argInteger, argNumber, argString, typeError, type BuiltIn } from './helpers.js';

function finite(value: number): number {
  if (!Number.isFinite(value)) throw typeError('arithmetic result is not finite');
  return value;
}

export const numberFunctions: Record<string, BuiltIn> = {
  number: {
    min: 1,
    max: 4,
    call: ([x, decimals, dec, thousands]) => {
      const places = decimals === undefined ? 0 : argInteger(decimals, 'number');
      if (places < 0) throw typeError('number requires a non-negative decimal count');
      return formatNumber(
        argNumber(defined(x, 'the number argument'), 'number'),
        places,
        dec === undefined ? '.' : argString(dec, 'number'),
        thousands === undefined ? ',' : argString(thousands, 'number'),
      );
    },
  },
  round: {
    min: 1,
    max: 2,
    call: ([x, d]) => {
      const places = d === undefined ? 0 : argInteger(d, 'round');
      if (places < 0) throw typeError('round requires a non-negative decimal count');
      return roundNumber(argNumber(defined(x, 'the round argument'), 'round'), places);
    },
  },
  floor: { min: 1, max: 1, call: ([x]) => finite(Math.floor(argNumber(defined(x, 'the floor argument'), 'floor'))) },
  ceil: { min: 1, max: 1, call: ([x]) => finite(Math.ceil(argNumber(defined(x, 'the ceil argument'), 'ceil'))) },
  abs: { min: 1, max: 1, call: ([x]) => Math.abs(argNumber(defined(x, 'the abs argument'), 'abs')) },
  min: {
    min: 1,
    max: Infinity,
    call: args => Math.min(...args.map(arg => requireNumber(arg, 'min'))),
  },
  max: {
    min: 1,
    max: Infinity,
    call: args => Math.max(...args.map(arg => requireNumber(arg, 'max'))),
  },
  num: { min: 1, max: 1, call: ([v]) => argNumber(defined(v, 'the num argument'), 'num') },
};

function requireNumber(value: Value, name: string): number {
  if (typeof value !== 'number') throw typeError(`${name} accepts only numbers`);
  return value;
}
