//! Number formatting, truthiness, equality, ordering and binding (VAL-9, EXP-33 to EXP-38, VAL-12).

use polyspec_template::value::number::{format_number, number_to_string, positional, round_number, shortest_digits};
use polyspec_template::value::{Value, compare_values, loose_equals, strict_equals};
use polyspec_template::{ErrorCode, bind, bind_value, parse_json};
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
    let value = parse_json("{\"2\": 1, \"1\": 2, \"x\": 1e15}").expect("json");
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

#[test]
fn binding_checks_the_numeric_value_and_not_its_spelling() {
    // VAL-2: an integer literal, a fraction and an exponent of the same magnitude fail alike.
    for text in ["9007199254740992", "9007199254740992.0", "1e19", "-9.007199254740992e15"] {
        assert_eq!(parse_json(text).unwrap_err().code, ErrorCode::E_DATA_NUMBER_RANGE, "{text}");
    }
    assert_eq!(parse_json("9007199254740991.0").expect("json"), Value::Number(9007199254740991.0));
    assert_eq!(parse_json("1.5e-300").expect("json"), Value::Number(1.5e-300));
    assert_eq!(
        parse_json(&format!("1{}", "0".repeat(400))).unwrap_err().code,
        ErrorCode::E_DATA_NUMBER_NOT_FINITE
    );
    assert_eq!(
        bind(&serde_json::json!(9007199254740992u64)).unwrap_err().code,
        ErrorCode::E_DATA_NUMBER_RANGE
    );
    assert_eq!(
        bind(&serde_json::json!(-9007199254740991i64)).expect("bind"),
        Value::Number(-9007199254740991.0)
    );
    assert_eq!(
        bind_value(&Value::Number(f64::NAN)).unwrap_err().code,
        ErrorCode::E_DATA_NUMBER_NOT_FINITE
    );
    assert_eq!(bind_value(&Value::Number(1e19)).unwrap_err().code, ErrorCode::E_DATA_NUMBER_RANGE);
}

#[test]
fn json_text_fails_at_the_first_violation_in_document_order() {
    assert_eq!(
        parse_json("{\"a\": 1e19, \"b\": \"\\ud800\"}").unwrap_err().code,
        ErrorCode::E_DATA_NUMBER_RANGE
    );
    assert_eq!(
        parse_json("{\"b\": \"\\ud800\", \"a\": 1e19}").unwrap_err().code,
        ErrorCode::E_DATA_INVALID_UTF8
    );
    assert_eq!(parse_json("[\"\\udc00\"]").unwrap_err().code, ErrorCode::E_DATA_INVALID_UTF8);
    assert_eq!(parse_json("{\"\\ud800x\": 1}").unwrap_err().code, ErrorCode::E_DATA_INVALID_UTF8);
    assert_eq!(parse_json("\"\\ud83d\\ude00\"").expect("json"), Value::text("\u{1F600}"));
}

#[test]
fn binding_limits_the_nesting_depth() {
    // VAL-20: 64 levels bind, 65 fail, and a deep or unterminated text fails before serde_json reads it.
    let nested = |levels: usize| format!("{}{}", "[".repeat(levels), "]".repeat(levels));
    assert!(parse_json(&nested(64)).is_ok());
    assert_eq!(parse_json(&nested(65)).unwrap_err().code, ErrorCode::E_DATA_DEPTH);
    assert_eq!(parse_json(&"[".repeat(200_000)).unwrap_err().code, ErrorCode::E_DATA_DEPTH);
    let mut deep = serde_json::Value::Null;
    for _ in 0..1000 {
        deep = serde_json::Value::Array(vec![deep]);
    }
    assert_eq!(bind(&deep).unwrap_err().code, ErrorCode::E_DATA_DEPTH);
    let mut value = Value::Null;
    for _ in 0..65 {
        value = Value::list(vec![value]);
    }
    assert_eq!(bind_value(&value).unwrap_err().code, ErrorCode::E_DATA_DEPTH);
    assert!(!value.depth_within(64));
    assert!(value.depth_within(65));
}
