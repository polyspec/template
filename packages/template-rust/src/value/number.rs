//! Number conversion and formatting (VAL-9, FUN-20 to FUN-25).

/// Largest safe integer magnitude (2^53 − 1).
pub const MAX_SAFE: f64 = 9007199254740991.0;

/// Shortest round-trip digits of a finite non-zero number: digits without leading or trailing
/// zeros, and the decimal exponent `n` such that value = 0.digits × 10^n.
pub fn shortest_digits(value: f64) -> (bool, String, i32) {
    let negative = value.is_sign_negative();
    let text = format!("{:e}", value.abs());
    let (mantissa, exponent) = text.split_once('e').expect("exponential form");
    let exponent: i32 = exponent.parse().expect("exponent");
    let mut digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    while digits.len() > 1 && digits.ends_with('0') {
        digits.pop();
    }
    (negative, digits, exponent + 1)
}

/// VAL-9: ECMAScript Number::toString.
pub fn number_to_string(value: f64) -> String {
    if value == 0.0 {
        return "0".to_string();
    }
    let (negative, digits, n) = shortest_digits(value);
    let k = digits.len() as i32;
    let body = if k <= n && n <= 21 {
        format!("{digits}{}", "0".repeat((n - k) as usize))
    } else if 0 < n && n <= 21 {
        format!("{}.{}", &digits[..n as usize], &digits[n as usize..])
    } else if -6 < n && n <= 0 {
        format!("0.{}{digits}", "0".repeat((-n) as usize))
    } else {
        let e = n - 1;
        let sign = if e < 0 { '-' } else { '+' };
        if k == 1 {
            format!("{digits}e{sign}{}", e.abs())
        } else {
            format!("{}.{}e{sign}{}", &digits[..1], &digits[1..], e.abs())
        }
    };
    if negative { format!("-{body}") } else { body }
}

/// Positional decimal expansion without exponent.
pub fn positional(value: f64) -> (bool, String, String) {
    if value == 0.0 {
        return (false, "0".to_string(), String::new());
    }
    let (negative, digits, exponent) = shortest_digits(value);
    let length = digits.len() as i32;
    if exponent <= 0 {
        (negative, "0".to_string(), format!("{}{digits}", "0".repeat((-exponent) as usize)))
    } else if exponent >= length {
        (
            negative,
            format!("{digits}{}", "0".repeat((exponent - length) as usize)),
            String::new(),
        )
    } else {
        (
            negative,
            digits[..exponent as usize].to_string(),
            digits[exponent as usize..].to_string(),
        )
    }
}

fn increment_digits(digits: &str) -> String {
    let mut chars: Vec<u8> = digits.bytes().collect();
    let mut index = chars.len();
    while index > 0 {
        index -= 1;
        if chars[index] == b'9' {
            chars[index] = b'0';
        } else {
            chars[index] += 1;
            return String::from_utf8(chars).expect("digits");
        }
    }
    format!("1{}", String::from_utf8(chars).expect("digits"))
}

/// FUN-22: rounds the positional digits to `decimals` fraction digits, half away from zero.
pub fn round_decimal(value: f64, decimals: usize) -> (bool, String, String) {
    let (negative, integer, fraction) = positional(value);
    if fraction.len() <= decimals {
        return (negative, integer, format!("{fraction}{}", "0".repeat(decimals - fraction.len())));
    }
    let round_up = fraction.as_bytes()[decimals] >= b'5';
    let mut kept = format!("{integer}{}", &fraction[..decimals]);
    if round_up {
        kept = increment_digits(&kept);
    }
    let split = kept.len() - decimals;
    let integer_part = if split == 0 { "0".to_string() } else { kept[..split].to_string() };
    (negative, integer_part, kept[split..].to_string())
}

/// FUN-20 to FUN-24.
pub fn format_number(value: f64, decimals: usize, dec: &str, thousands: &str) -> String {
    let (negative, integer, fraction) = round_decimal(value, decimals);
    let mut groups: Vec<String> = Vec::new();
    let mut rest = integer.as_str();
    while rest.len() > 3 {
        groups.insert(0, rest[rest.len() - 3..].to_string());
        rest = &rest[..rest.len() - 3];
    }
    groups.insert(0, rest.to_string());
    let mut text = groups.join(thousands);
    if decimals > 0 {
        text.push_str(dec);
        text.push_str(&fraction);
    }
    let all_zero = integer.bytes().chain(fraction.bytes()).all(|b| b == b'0');
    if negative && !all_zero { format!("-{text}") } else { text }
}

/// FUN-25: the rounded value as a number.
pub fn round_number(value: f64, decimals: usize) -> f64 {
    let (negative, integer, fraction) = round_decimal(value, decimals);
    let text = if fraction.is_empty() {
        integer
    } else {
        format!("{integer}.{fraction}")
    };
    let result: f64 = text.parse().unwrap_or(0.0);
    if negative && result != 0.0 { -result } else { result }
}
