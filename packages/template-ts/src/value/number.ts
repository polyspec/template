// Number conversion and formatting as defined in docs/spec/data-model.md (VAL-9)
// and docs/spec/functions.md (FUN-20 to FUN-25).

export const MAX_SAFE = 9007199254740991;

// VAL-9: ECMAScript Number::toString.
export function numberToString(value: number): string {
  if (value === 0) return '0';
  return String(value);
}

// Shortest round-trip decimal digits of a finite number: digits without leading zeros,
// and the decimal exponent n such that value = 0.digits × 10^n.
export function shortestDigits(value: number): { negative: boolean; digits: string; exponent: number } {
  const negative = value < 0 || Object.is(value, -0);
  const text = Math.abs(value).toExponential();
  const match = /^(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(text);
  if (!match) throw new Error(`cannot decompose ${text}`);
  let digits = (match[1] as string) + (match[2] ?? '');
  digits = digits.replace(/0+$/, '');
  if (digits === '') digits = '0';
  const exponent = Number(match[3]) + 1;
  return { negative, digits, exponent };
}

// Positional decimal expansion without exponent: integer part and fraction part digit strings.
export function positional(value: number): { negative: boolean; integer: string; fraction: string } {
  if (value === 0) return { negative: false, integer: '0', fraction: '' };
  const { negative, digits, exponent } = shortestDigits(value);
  let integer: string;
  let fraction: string;
  if (exponent <= 0) {
    integer = '0';
    fraction = '0'.repeat(-exponent) + digits;
  } else if (exponent >= digits.length) {
    integer = digits + '0'.repeat(exponent - digits.length);
    fraction = '';
  } else {
    integer = digits.slice(0, exponent);
    fraction = digits.slice(exponent);
  }
  return { negative, integer, fraction };
}

// FUN-22: rounds a positional digit string to the given number of fraction digits,
// half away from zero on the decimal digits.
export function roundDecimal(value: number, decimals: number): { negative: boolean; integer: string; fraction: string } {
  const { negative, integer, fraction } = positional(value);
  if (fraction.length <= decimals) {
    return { negative, integer, fraction: fraction + '0'.repeat(decimals - fraction.length) };
  }
  const roundUp = (fraction.charCodeAt(decimals) as number) >= 0x35;
  let kept = integer + fraction.slice(0, decimals);
  if (roundUp) kept = incrementDigits(kept);
  const splitAt = kept.length - decimals;
  return { negative, integer: kept.slice(0, splitAt) || '0', fraction: kept.slice(splitAt) };
}

function incrementDigits(digits: string): string {
  const chars = digits.split('');
  let index = chars.length - 1;
  while (index >= 0) {
    if (chars[index] === '9') {
      chars[index] = '0';
      index--;
    } else {
      chars[index] = String.fromCharCode((chars[index] as string).charCodeAt(0) + 1);
      return chars.join('');
    }
  }
  return '1' + chars.join('');
}

// FUN-20 to FUN-24.
export function formatNumber(value: number, decimals: number, dec: string, thousands: string): string {
  const rounded = roundDecimal(value, decimals);
  const groups: string[] = [];
  let integer = rounded.integer;
  while (integer.length > 3) {
    groups.unshift(integer.slice(-3));
    integer = integer.slice(0, -3);
  }
  groups.unshift(integer);
  let text = groups.join(thousands);
  if (decimals > 0) text += dec + rounded.fraction;
  const allZero = /^[0.]*$/.test(rounded.integer + rounded.fraction);
  return rounded.negative && !allZero ? '-' + text : text;
}

// FUN-25: the rounded value as a number.
export function roundNumber(value: number, decimals: number): number {
  const rounded = roundDecimal(value, decimals);
  const text = rounded.integer + (rounded.fraction ? '.' + rounded.fraction : '');
  const result = Number(text);
  return rounded.negative && result !== 0 ? -result : result;
}
