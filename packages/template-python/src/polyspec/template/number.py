"""Number conversion and formatting as defined in docs/spec/data-model.md (VAL-9)
and docs/spec/functions.md (FUN-20 to FUN-25)."""

from __future__ import annotations

import math

MAX_SAFE = 9007199254740991.0


def number_to_string(value: float) -> str:
    """VAL-9: ECMAScript Number::toString of a finite float."""
    if value == 0:
        return '0'
    negative = math.copysign(1.0, value) < 0
    digits, exponent = _shortest_digits(abs(value))
    text = _from_digits(digits, exponent)
    return '-' + text if negative else text


def _shortest_digits(value: float) -> tuple[str, int]:
    """The shortest round-trip decimal digits of a positive finite float and the
    decimal exponent n such that value = 0.digits x 10^n."""
    text = repr(value)
    exponent = None
    if 'e' in text or 'E' in text:
        mantissa, _, exponent_text = text.replace('E', 'e').partition('e')
        exponent = int(exponent_text) + 1
    else:
        mantissa = text
    whole, _, fraction = mantissa.partition('.')
    combined = whole + fraction
    digits = combined.lstrip('0')
    leading = len(combined) - len(digits)
    digits = digits.rstrip('0') or '0'
    if exponent is None:
        exponent = len(whole) - leading
    return digits, exponent


def _from_digits(digits: str, exponent: int) -> str:
    """The ECMAScript Number::toString form of 0.digits x 10^exponent."""
    k = len(digits)
    n = exponent
    if k <= n <= 21:
        return digits + '0' * (n - k)
    if 0 < n <= 21:
        return digits[:n] + '.' + digits[n:]
    if -6 < n <= 0:
        return '0.' + '0' * -n + digits
    mantissa = digits[0] + ('.' + digits[1:] if k > 1 else '')
    power = n - 1
    sign = '+' if power >= 0 else '-'
    return f'{mantissa}e{sign}{abs(power)}'


def positional(value: float) -> tuple[bool, str, str]:
    """The positional decimal expansion without exponent: the sign, the integer
    part and the fraction part digit strings."""
    if value == 0:
        return False, '0', ''
    negative = math.copysign(1.0, value) < 0
    digits, exponent = _shortest_digits(abs(value))
    if exponent <= 0:
        integer, fraction = '0', '0' * -exponent + digits
    elif exponent >= len(digits):
        integer, fraction = digits + '0' * (exponent - len(digits)), ''
    else:
        integer, fraction = digits[:exponent], digits[exponent:]
    return negative, integer, fraction


def round_decimal(value: float, decimals: int) -> tuple[bool, str, str]:
    """FUN-22: rounds a positional digit string to the given number of fraction
    digits, half away from zero on the decimal digits."""
    negative, integer, fraction = positional(value)
    if len(fraction) <= decimals:
        return negative, integer, fraction + '0' * (decimals - len(fraction))
    round_up = ord(fraction[decimals]) >= 0x35
    kept = integer + fraction[:decimals]
    if round_up:
        kept = _increment_digits(kept)
    split_at = len(kept) - decimals
    return negative, kept[:split_at] or '0', kept[split_at:]


def _increment_digits(digits: str) -> str:
    chars = list(digits)
    index = len(chars) - 1
    while index >= 0:
        if chars[index] == '9':
            chars[index] = '0'
            index -= 1
        else:
            chars[index] = chr(ord(chars[index]) + 1)
            return ''.join(chars)
    return '1' + ''.join(chars)


def format_number(value: float, decimals: int, dec: str, thousands: str) -> str:
    """FUN-20 to FUN-24."""
    negative, integer, fraction = round_decimal(value, decimals)
    groups = []
    while len(integer) > 3:
        groups.insert(0, integer[-3:])
        integer = integer[:-3]
    groups.insert(0, integer)
    text = thousands.join(groups)
    if decimals > 0:
        text += dec + fraction
    all_zero = integer == '0' and (fraction == '' or set(fraction) <= {'0'})
    return '-' + text if negative and not all_zero else text


def round_number(value: float, decimals: int) -> float:
    """FUN-25: the rounded value as a number."""
    negative, integer, fraction = round_decimal(value, decimals)
    text = integer + ('.' + fraction if fraction else '')
    result = float(text)
    return -result if negative and result != 0 else result
