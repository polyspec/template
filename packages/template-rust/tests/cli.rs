//! Command line contract (CNF-4).

mod common;

use common::repo_root;
use std::process::Command;

fn run(args: &[&str]) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_template")).args(args).output().expect("run")
}

#[test]
fn parse_prints_the_ast() {
    let file = repo_root().join("tests/cases/text/plain/input.tpl");
    let output = run(&["parse", file.to_str().expect("path")]);
    assert_eq!(output.status.code(), Some(0));
    let ast: serde_json::Value = serde_json::from_slice(&output.stdout).expect("json");
    assert_eq!(ast["type"], "Template");
}

#[test]
fn render_prints_html_and_errors_exit_with_status_2() {
    let file = repo_root().join("tests/cases/echo/path/input.tpl");
    let output = run(&["render", file.to_str().expect("path"), "--data", "data.json"]);
    assert_eq!(output.status.code(), Some(0));
    let file = repo_root().join("tests/cases/errors/unclosed-block/input.tpl");
    let output = run(&["render", file.to_str().expect("path")]);
    assert_eq!(output.status.code(), Some(2));
    let error: serde_json::Value = serde_json::from_slice(&output.stderr).expect("json");
    assert_eq!(error["code"], "E_PARSE_UNCLOSED_BLOCK");
}

#[test]
fn usage_errors_exit_with_status_1() {
    assert_eq!(run(&["parse"]).status.code(), Some(1));
    assert_eq!(run(&["render", "x.tpl", "--unknown", "1"]).status.code(), Some(1));
}
