//! Number conversion and formatting (VAL-9, FUN-20 to FUN-25).

/// Largest safe integer magnitude (2^53 − 1).
pub const MAX_SAFE: f64 = 9007199254740991.0;

/// Shortest round-trip digits of a finite non-zero number: digits without leading or trailing
/// zeros, and the decimal exponent `n` such that value = 0.digits × 10^n.
pub fn shortest_digits(value: f64) -> (bool, String, i32) {
    let negative = value.is_sign_negative();
    let text = format!("{:e}", value.abs());
    // `{:e}` writes `<mantissa>e<exponent>` with an optional `-` and at most three exponent digits (VAL-10).
    let (mantissa, exponent_text) = match text.split_once('e') {
        Some(parts) => parts,
        None => (text.as_str(), "0"),
    };
    let (sign, exponent_digits) = match exponent_text.strip_prefix('-') {
        Some(digits) => (-1, digits),
        None => (1, exponent_text),
    };
    let exponent = sign
        * exponent_digits
            .bytes()
            .fold(0i32, |number, digit| number * 10 + i32::from(digit - b'0'));
    let mut digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    while digits.len() > 1 && digits.ends_with('0') {
        digits.pop();
    }
    (negative, digits, exponent + 1)
}

/// VAL-9: the text of a number is the JSON number token of ordered-json, the layout of ECMAScript Number::toString with
/// `-0` written as `0` (VAL-10). A number that is not finite has no text; no template value holds one (VAL-3).
pub fn number_to_string(value: f64) -> Result<String, polyspec_ordered_json::Error> {
    polyspec_ordered_json::number_text(value)
}

/// Positional decimal expansion without exponent.
#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_possible_wrap,
    clippy::cast_sign_loss,
    reason = "FUN-21: at most 17 digits and an exponent within ±325; each count is cast where the branch makes it positive"
)]
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
            return chars.into_iter().map(char::from).collect();
        }
    }
    format!("1{}", chars.into_iter().map(char::from).collect::<String>())
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

/// FUN-25: the rounded value as a number. The digits of [`round_decimal`] always spell a decimal literal; a failure
/// to read them back is an invariant failure that the caller reports as internal.
pub fn round_number(value: f64, decimals: usize) -> Result<f64, std::num::ParseFloatError> {
    let (negative, integer, fraction) = round_decimal(value, decimals);
    let text = if fraction.is_empty() {
        integer
    } else {
        format!("{integer}.{fraction}")
    };
    let result: f64 = text.parse()?;
    Ok(if negative && result != 0.0 { -result } else { result })
}
