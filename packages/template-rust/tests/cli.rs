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
    let output = run(&["render", "--data", "data.json", file.to_str().expect("path")]);
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
    assert_eq!(run(&["render", "--unknown", "1", "x.tpl"]).status.code(), Some(1));
    // CNF-4: a data file that cannot be read is a usage error.
    let file = repo_root().join("tests/cases/echo/path/input.tpl");
    assert_eq!(
        run(&["render", "--data", "missing.json", file.to_str().expect("path")])
            .status
            .code(),
        Some(1)
    );
    // CNF-4: the options come before FILE; an option after FILE is a usage error.
    let file = file.to_str().expect("path");
    let cases = repo_root().join("tests/cases");
    for args in [
        vec!["render", file, "--data", "data.json"],
        vec!["parse", file, "--root", cases.to_str().expect("path")],
        vec!["tokens", file, "--delimiters", "[]"],
        vec!["format", file, "--indent", "tab"],
        vec!["format", "--root", ".", file],
        vec!["format"],
        vec!["unknown", file],
        vec![],
    ] {
        let output = run(&args);
        assert_eq!(output.status.code(), Some(1), "{args:?}");
        assert!(!output.stderr.is_empty(), "{args:?}");
    }
}

/// A result that cannot be written to stdout ends the command with status 1 and the write error on stderr.
#[test]
fn a_write_error_exits_with_status_1() {
    let file = repo_root().join("tests/cases/echo/path/input.tpl");
    let file = file.to_str().expect("path");
    for args in [
        vec!["parse", file],
        vec!["tokens", file],
        vec!["format", file],
        vec!["render", "--data", "data.json", file],
    ] {
        // A pipe without a reader refuses every write (EPIPE).
        let (reader, stdout) = std::io::pipe().expect("pipe");
        drop(reader);
        let output = Command::new(env!("CARGO_BIN_EXE_template"))
            .args(&args)
            .stdout(stdout)
            .output()
            .expect("run");
        assert_eq!(
            output.status.code(),
            Some(1),
            "{args:?}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(!output.stderr.is_empty(), "{args:?}");
    }
}

#[test]
fn tokens_prints_the_classified_ranges_and_errors_exit_with_status_2() {
    let file = repo_root().join("tests/cases/echo/path/input.tpl");
    let output = run(&["tokens", file.to_str().expect("path")]);
    assert_eq!(output.status.code(), Some(0));
    let tokens: serde_json::Value = serde_json::from_slice(&output.stdout).expect("json");
    assert_eq!(tokens[0][2], "delimiter");
    assert_eq!(tokens[1][2], "keyword");
    let file = repo_root().join("tests/cases/errors/unclosed-block/input.tpl");
    let output = run(&["tokens", file.to_str().expect("path")]);
    assert_eq!(output.status.code(), Some(2));
    let error: serde_json::Value = serde_json::from_slice(&output.stderr).expect("json");
    assert_eq!(error["code"], "E_PARSE_UNCLOSED_BLOCK");
}

#[test]
fn format_prints_the_formatted_text_and_errors_exit_with_status_2() {
    let dir = std::env::temp_dir().join(format!("polyspec-template-cli-format-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("directory");
    let file = dir.join("input.tpl");
    std::fs::write(&file, "<ul>\n<li>{=a}</li>\n</ul>").expect("write");
    let path = file.to_str().expect("path");
    let output = run(&["format", path]);
    assert_eq!(output.status.code(), Some(0));
    assert_eq!(String::from_utf8_lossy(&output.stdout), "<ul>\n  <li>{= a}</li>\n</ul>");
    assert_eq!(
        String::from_utf8_lossy(&run(&["format", "--indent", "tab", path]).stdout),
        "<ul>\n\t<li>{= a}</li>\n</ul>"
    );
    assert_eq!(
        String::from_utf8_lossy(&run(&["format", "--indent", "none", path]).stdout),
        "<ul>\n<li>{= a}</li>\n</ul>"
    );
    assert_eq!(run(&["format", "--indent", "9", path]).status.code(), Some(1));
    std::fs::write(&file, "<ul>\n<li>{=a}</ul>").expect("write");
    let output = run(&["format", path]);
    assert_eq!(output.status.code(), Some(2));
    let error: serde_json::Value = serde_json::from_slice(&output.stderr).expect("json");
    assert_eq!(error["reason"], "html");
    assert_eq!((error["line"].as_u64(), error["col"].as_u64()), (Some(2), Some(9)));
    std::fs::remove_dir_all(&dir).expect("cleanup");
}
