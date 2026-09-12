//! date and now (FUN-37 to FUN-42).

use crate::functions::helpers::{BuiltIn, FunctionContext, FunctionError, arg_string, type_error};
use crate::value::Value;

const DAY_SHORT: [&str; 7] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LONG: [&str; 7] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_SHORT: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG: [&str; 12] = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

/// Offset in seconds of `Z` or `±HH:MM`, or None.
pub fn parse_offset(text: &str) -> Option<i64> {
    if text == "Z" {
        return Some(0);
    }
    let bytes = text.as_bytes();
    if bytes.len() != 6 || !(bytes[0] == b'+' || bytes[0] == b'-') || bytes[3] != b':' {
        return None;
    }
    let hours: i64 = text[1..3].parse().ok()?;
    let minutes: i64 = text[4..6].parse().ok()?;
    if !text[1..3].bytes().all(|b| b.is_ascii_digit()) || !text[4..6].bytes().all(|b| b.is_ascii_digit()) || hours > 23 || minutes > 59 {
        return None;
    }
    let sign = if bytes[0] == b'-' { -1 } else { 1 };
    Some(sign * (hours * 3600 + minutes * 60))
}

fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    (if month <= 2 { y + 1 } else { y }, month, day)
}

/// Fields of a parsed date text: year, month, day, hour, minute, second and the offset text.
struct DateText<'a> {
    year: i64,
    month: i64,
    day: i64,
    hour: i64,
    minute: i64,
    second: i64,
    offset: Option<&'a str>,
}

fn parse_date_text(text: &str) -> Option<DateText<'_>> {
    let bytes = text.as_bytes();
    if bytes.len() < 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return None;
    }
    let digits = |range: std::ops::Range<usize>| -> Option<i64> {
        let part = text.get(range)?;
        if part.bytes().all(|b| b.is_ascii_digit()) {
            part.parse().ok()
        } else {
            None
        }
    };
    let year = digits(0..4)?;
    let month = digits(5..7)?;
    let day = digits(8..10)?;
    let mut rest = &text[10..];
    let (mut hour, mut minute, mut second) = (0, 0, 0);
    if rest.starts_with(' ') || rest.starts_with('T') {
        if rest.len() < 9 || rest.as_bytes()[3] != b':' || rest.as_bytes()[6] != b':' {
            return None;
        }
        let time = &rest[1..9];
        let time_digits = |range: std::ops::Range<usize>| -> Option<i64> {
            let part = time.get(range)?;
            if part.bytes().all(|b| b.is_ascii_digit()) {
                part.parse().ok()
            } else {
                None
            }
        };
        hour = time_digits(0..2)?;
        minute = time_digits(3..5)?;
        second = time_digits(6..8)?;
        rest = &rest[9..];
    }
    let offset = if rest.is_empty() { None } else { Some(rest) };
    if let Some(offset) = offset {
        parse_offset(offset)?;
    }
    Some(DateText {
        year,
        month,
        day,
        hour,
        minute,
        second,
        offset,
    })
}

/// Unix seconds of a date value (FUN-37).
pub fn to_unix_seconds(value: &Value, env_offset: i64) -> Result<i64, FunctionError> {
    match value {
        Value::Number(number) => Ok(number.trunc() as i64),
        Value::Str(text) | Value::Safe(text) => {
            let Some(DateText {
                year,
                month,
                day,
                hour,
                minute,
                second,
                offset,
            }) = parse_date_text(text)
            else {
                return Err(type_error(format!("{text:?} is not a date")));
            };
            if !(1..=12).contains(&month) || !(1..=31).contains(&day) || hour > 23 || minute > 59 || second > 59 {
                return Err(type_error(format!("{text:?} is not a date")));
            }
            let offset = offset.and_then(parse_offset).unwrap_or(env_offset);
            Ok(days_from_civil(year, month, day) * 86400 + hour * 3600 + minute * 60 + second - offset)
        }
        _ => Err(type_error("date requires a number or a string")),
    }
}

/// Formats unix seconds with the tokens of FUN-40 in a fixed offset.
pub fn format_date(seconds: i64, format: &str, offset: i64) -> String {
    let local = seconds + offset;
    let days = local.div_euclid(86400);
    let second_of_day = local - days * 86400;
    let (year, month, day) = civil_from_days(days);
    let hour = second_of_day / 3600;
    let minute = (second_of_day % 3600) / 60;
    let second = second_of_day % 60;
    let weekday = ((days % 7) + 11).rem_euclid(7) as usize;
    let sign = if offset < 0 { '-' } else { '+' };
    let abs_offset = offset.abs();
    let mut result = String::new();
    let chars: Vec<char> = format.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        match chars[i] {
            '\\' => {
                if let Some(next) = chars.get(i + 1) {
                    result.push(*next);
                }
                i += 1;
            }
            'Y' => result.push_str(&format!("{year:04}")),
            'y' => result.push_str(&format!("{:02}", year.rem_euclid(100))),
            'm' => result.push_str(&format!("{month:02}")),
            'n' => result.push_str(&month.to_string()),
            'd' => result.push_str(&format!("{day:02}")),
            'j' => result.push_str(&day.to_string()),
            'H' => result.push_str(&format!("{hour:02}")),
            'G' => result.push_str(&hour.to_string()),
            'i' => result.push_str(&format!("{minute:02}")),
            's' => result.push_str(&format!("{second:02}")),
            'D' => result.push_str(DAY_SHORT[weekday]),
            'l' => result.push_str(DAY_LONG[weekday]),
            'N' => result.push_str(&(if weekday == 0 { 7 } else { weekday }).to_string()),
            'w' => result.push_str(&weekday.to_string()),
            'M' => result.push_str(MONTH_SHORT[(month - 1) as usize]),
            'F' => result.push_str(MONTH_LONG[(month - 1) as usize]),
            'U' => result.push_str(&seconds.to_string()),
            'P' => result.push_str(&format!("{sign}{:02}:{:02}", abs_offset / 3600, (abs_offset % 3600) / 60)),
            other => result.push(other),
        }
        i += 1;
    }
    result
}

fn env_offset(context: &FunctionContext<'_>) -> Result<i64, FunctionError> {
    parse_offset(&context.env.timezone).ok_or_else(|| type_error(format!("{:?} is not a time zone offset", context.env.timezone)))
}

fn date(args: &[Value], context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    if args[0] == Value::Null {
        return Ok(Value::text(String::new()));
    }
    let offset = env_offset(context)?;
    let seconds = to_unix_seconds(&args[0], offset)?;
    Ok(Value::text(format_date(seconds, &arg_string(&args[1], "date")?, offset)))
}

fn now(_args: &[Value], context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    Ok(Value::Number(context.env.now))
}

/// The time function group.
pub fn functions() -> Vec<(&'static str, BuiltIn)> {
    vec![
        (
            "date",
            BuiltIn {
                min: 2,
                max: 2,
                call: date,
            },
        ),
        ("now", BuiltIn { min: 0, max: 0, call: now }),
    ]
}
