//! Number formatting, truthiness, equality, ordering and binding (VAL-9, EXP-33 to EXP-38, VAL-12).

use polyspec_template::value::number::{format_number, number_to_string, positional, round_number, shortest_digits};
use polyspec_template::value::{Value, compare_values, loose_equals, strict_equals};
use polyspec_template::{ErrorCode, parse_json};
use std::cmp::Ordering;

#[test]
fn number_to_string_follows_the_ecmascript_layout() {
    assert_eq!(number_to_string(1.0), "1");
    assert_eq!(number_to_string(-0.0), "0");
    assert_eq!(number_to_string(0.1 + 0.2), "0.30000000000000004");
    assert_eq!(number_to_string(1e21), "1e+21");
    assert_eq!(number_to_string(1e-7), "1e-7");
    assert_eq!(number_to_string(1.5e-7), "1.5e-7");
    assert_eq!(number_to_string(0.000001), "0.000001");
    assert_eq!(number_to_string(123456789012345680000.0), "123456789012345680000");
    assert_eq!(number_to_string(9007199254740991.0), "9007199254740991");
}

#[test]
fn digits_and_positional_expansion() {
    assert_eq!(shortest_digits(1234.5), (false, "12345".to_string(), 4));
    assert_eq!(shortest_digits(0.001), (false, "1".to_string(), -2));
    assert_eq!(positional(2.675), (false, "2".to_string(), "675".to_string()));
    assert_eq!(positional(1e21), (false, "1000000000000000000000".to_string(), String::new()));
    assert_eq!(positional(-0.5), (true, "0".to_string(), "5".to_string()));
}

#[test]
fn format_number_rounds_half_away_from_zero_on_decimal_digits() {
    assert_eq!(format_number(2.675, 2, ".", ","), "2.68");
    assert_eq!(format_number(1.005, 2, ".", ","), "1.01");
    assert_eq!(format_number(-2.5, 0, ".", ","), "-3");
    assert_eq!(format_number(-0.001, 2, ".", ","), "0.00");
    assert_eq!(format_number(12345.5, 0, ".", ","), "12,346");
    assert_eq!(format_number(1234567.891, 2, ",", "."), "1.234.567,89");
    assert_eq!(format_number(999.999, 2, ".", ","), "1,000.00");
    assert_eq!(round_number(2.675, 2), 2.68);
    assert_eq!(round_number(-2.5, 0), -3.0);
}

#[test]
fn truthiness_equality_and_ordering() {
    assert!(!Value::text("".to_string()).is_truthy());
    assert!(Value::text("0".to_string()).is_truthy());
    assert!(!Value::list(Vec::new()).is_truthy());
    assert!(loose_equals(&Value::text("3".to_string()), &Value::Number(3.0)));
    assert!(!strict_equals(&Value::text("3".to_string()), &Value::Number(3.0)));
    assert!(!loose_equals(&Value::Null, &Value::text(String::new())));
    assert_eq!(
        compare_values(&Value::text("10".to_string()), &Value::text("9".to_string())),
        Some(Ordering::Less)
    );
    assert_eq!(
        compare_values(&Value::text("Ａ".to_string()), &Value::text("😀".to_string())),
        Some(Ordering::Less)
    );
    assert_eq!(compare_values(&Value::Number(1.0), &Value::text("2".to_string())), None);
}

#[test]
fn json_parsing_preserves_order_and_checks_integer_literals() {
    let value = parse_json("{\"2\": 1, \"1\": 2, \"x\": 1e21}").expect("json");
    match value {
        Value::Map(map) => assert_eq!(map.keys().cloned().collect::<Vec<_>>(), vec!["2", "1", "x"]),
        _ => panic!("not a map"),
    }
    assert_eq!(parse_json("9007199254740992").unwrap_err().code, ErrorCode::E_DATA_NUMBER_RANGE);
    assert_eq!(parse_json("1e400").unwrap_err().code, ErrorCode::E_DATA_NUMBER_NOT_FINITE);
    assert_eq!(
        parse_json("{\"a\": 1, \"a\": 2}").expect("json"),
        parse_json("{\"a\": 2}").expect("json")
    );
}
