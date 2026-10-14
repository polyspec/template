//! The formatter: the formatting style of tag bodies, the indentation of lines by HTML elements and template blocks,
//! the safety invariant and idempotence, and the error results (docs/operations/editor-tools.md).

mod common;

use common::{case_delimiters, repo_root, templates};
use polyspec_template::format::invariant::{without_line_indentation, without_spans};
use polyspec_template::{
    FormatErrorReason, FormatOptions, Formatted, IndentUnit, ParseOptions, RequestError, TemplateBlocks, format, format_bytes, parse,
};
use std::fs;

fn options() -> FormatOptions {
    FormatOptions::default()
}

fn text(source: &str, options: &FormatOptions) -> String {
    match format(source, options) {
        Ok(formatted) => formatted.text,
        Err(error) => panic!("format failed for {source:?}: {error:?}"),
    }
}

// Formats once and checks that a second run changes nothing.
fn formatted(source: &str, options: &FormatOptions) -> String {
    let once = text(source, options);
    assert_eq!(
        format(&once, options).expect("second run"),
        Formatted {
            text: once.clone(),
            changed: false
        },
        "idempotence of {source:?}"
    );
    once
}

fn lines(items: &[&str]) -> String {
    items.join("\n")
}

fn unit(value: &str) -> Option<IndentUnit> {
    Some(IndentUnit::new(value).expect("indent unit"))
}

#[test]
fn formats_the_fixtures_and_is_idempotent_on_them() {
    let fixtures = repo_root().join("packages/language/tests/fixtures");
    let mut names: Vec<String> = fs::read_dir(fixtures.join("input"))
        .expect("fixtures")
        .map(|entry| entry.expect("fixture entry").file_name().to_string_lossy().to_string())
        .filter(|name| name.ends_with(".tpl"))
        .collect();
    names.sort();
    assert!(!names.is_empty());
    for name in names {
        let input = fs::read_to_string(fixtures.join("input").join(&name)).expect("input");
        let expected = fs::read_to_string(fixtures.join("expected").join(&name)).expect("expected");
        let options = FormatOptions {
            name: name.clone(),
            ..options()
        };
        assert_eq!(formatted(&input, &options), expected, "{name}");
    }
}

#[test]
fn applies_the_expression_spacing_of_the_style() {
    let cases = [
        ("{=a+b}", "{= a + b}"),
        ("{= -a - -1}", "{= -a - -1}"),
        ("{=!done&&(x||y)}", "{= !done && (x || y)}"),
        ("{= f( x ,g(y) )}", "{= f(x, g(y))}"),
        ("{= obj.method( 1 )}", "{= obj.method(1)}"),
        ("{=c?a:b}", "{= c ? a : b}"),
        ("{= a?:b}", "{= a ?: b}"),
        ("{=x|slice(0,10)}", "{= x | slice(0, 10)}"),
        ("{= [1,...rest,]}", "{= [1, ...rest,]}"),
        ("{= ['a'=>1]}", "{= ['a' => 1]}"),
        ("{= list[ i ].name}", "{= list[i].name}"),
        ("{= x in[1]}", "{= x in [1]}"),
        ("{= (-1)*2}", "{= (-1) * 2}"),
        ("{?a}{:?b}{:  }{/  }", "{? a}{:? b}{:}{/}"),
        ("{@item=items}{/}", "{@ item = items}{/}"),
        ("{:x+=1}{: y ++ }{:z=2}", "{:x += 1}{:y++}{:z = 2}"),
        ("{?#  side}{/}", "{?# side}{/}"),
        ("{+   a/b.tpl  }{+'q.tpl'}", "{+ a/b.tpl}{+ 'q.tpl'}"),
        (
            "{#  card   cards/card.tpl  title:page.title  x  }",
            "{# card cards/card.tpl title:page.title x}",
        ),
    ];
    for (source, expected) in cases {
        assert_eq!(formatted(source, &options()), expected, "{source}");
    }
}

#[test]
fn reports_an_unchanged_source_and_never_changes_a_comment() {
    for source in ["<p>{= a}</p>", "{*   a   *}{**}"] {
        assert_eq!(
            format(source, &options()).expect("format"),
            Formatted {
                text: source.to_string(),
                changed: false
            }
        );
    }
}

#[test]
fn keeps_a_byte_order_mark_and_crlf_line_terminators() {
    let source = "\u{feff}<ul>\r\n{@ x=xs}\r\n<li>{=x}</li>\r\n{/}\r\n</ul>\r\n";
    assert_eq!(
        text(source, &options()),
        "\u{feff}<ul>\r\n  {@ x = xs}\r\n    <li>{= x}</li>\r\n  {/}\r\n</ul>\r\n"
    );
    let options = FormatOptions {
        delimiters: Some("[]".to_string()),
        ..options()
    };
    assert_eq!(
        formatted("\u{feff}<ul>\r\n[@ x = xs]\r\n<li>[= x]</li>\r\n[/]\r\n</ul>\r\n", &options),
        "\u{feff}<ul>\r\n  [@ x = xs]\r\n    <li>[= x]</li>\r\n  [/]\r\n</ul>\r\n"
    );
}

#[test]
fn formats_only_the_tags_and_lines_inside_a_range() {
    let options = FormatOptions {
        range: Some(4..8),
        ..options()
    };
    assert_eq!(text("{=a}{=b}{=c}", &options), "{=a}{= b}{=c}");
    let source = lines(&["<ul>", "<li>a</li>", "<li>{=b}</li>", "</ul>"]);
    let start = source.find("<li>{=b}").expect("start");
    let options = FormatOptions {
        range: Some(start..source.len()),
        ..FormatOptions::default()
    };
    assert_eq!(text(&source, &options), lines(&["<ul>", "<li>a</li>", "  <li>{= b}</li>", "</ul>"]));
}

#[test]
fn formats_with_the_delimiter_option() {
    let brackets = FormatOptions {
        delimiters: Some("[]".to_string()),
        ..options()
    };
    assert_eq!(text("[= a[0]+1]\n[= [1,2][1]]", &brackets), "[= a[0] + 1]\n[= [1, 2][1]]");
    let semicolons = FormatOptions {
        delimiters: Some(";;".to_string()),
        ..options()
    };
    assert_eq!(
        text("var page = \";;=json(page)|raw;;\";", &semicolons),
        "var page = \";;= json(page) | raw;;\";"
    );
}

#[test]
fn returns_the_parser_error_position_for_a_source_that_does_not_parse() {
    let error = format("<p>\n  {? a}\n</p>", &options()).expect_err("parse error");
    assert_eq!(error.reason, FormatErrorReason::Parse);
    assert_eq!(error.code.as_deref(), Some("E_PARSE_UNCLOSED_BLOCK"));
    assert_eq!((error.line, error.col), (2, 3));
}

/// A source given as bytes formats as its text; bytes that are not UTF-8 do not parse (LEX-1), and the error says where.
#[test]
fn formats_bytes_and_reports_bytes_that_are_not_utf8_as_a_parse_error() {
    assert_eq!(format_bytes(b"{=a}", &options()).expect("format").text, "{= a}");
    let error = format_bytes(b"<p>\n\xff</p>", &options()).expect_err("parse error");
    assert_eq!(error.reason, FormatErrorReason::Parse);
    assert_eq!(error.code.as_deref(), Some("E_LEX_INVALID_UTF8"));
    assert_eq!((error.line, error.col), (2, 1));
}

const BOARD: &[&str] = &[
    "<div class=\"board-list\">",
    "<h2>{= t[\"list.heading\"]}</h2>",
    "{? length(p.props.posts) == 0}",
    "<p>{= t[\"list.empty\"]}</p>",
    "{:}",
    "<ul>",
    "{@ post = p.props.posts}",
    "<li><a href=\"{= post.href}\">{= post.title}</a></li>",
    "{/}",
    "</ul>",
    "{/}",
    "</div>",
    "",
];

#[test]
fn indents_html_elements_and_template_blocks() {
    assert_eq!(
        formatted(&lines(BOARD), &options()),
        lines(&[
            "<div class=\"board-list\">",
            "  <h2>{= t[\"list.heading\"]}</h2>",
            "  {? length(p.props.posts) == 0}",
            "    <p>{= t[\"list.empty\"]}</p>",
            "  {:}",
            "    <ul>",
            "      {@ post = p.props.posts}",
            "        <li><a href=\"{= post.href}\">{= post.title}</a></li>",
            "      {/}",
            "    </ul>",
            "  {/}",
            "</div>",
            "",
        ])
    );
    let flat = FormatOptions {
        template_blocks: TemplateBlocks::Flat,
        ..options()
    };
    assert_eq!(
        formatted(&lines(BOARD), &flat),
        lines(&[
            "<div class=\"board-list\">",
            "  <h2>{= t[\"list.heading\"]}</h2>",
            "  {? length(p.props.posts) == 0}",
            "  <p>{= t[\"list.empty\"]}</p>",
            "  {:}",
            "  <ul>",
            "    {@ post = p.props.posts}",
            "    <li><a href=\"{= post.href}\">{= post.title}</a></li>",
            "    {/}",
            "  </ul>",
            "  {/}",
            "</div>",
            "",
        ])
    );
}

#[test]
fn uses_the_indent_unit_or_keeps_every_line() {
    let source = lines(&["<ul>", "        <li>a</li>", "\t<li>b</li>", "</ul>"]);
    let tab = FormatOptions {
        indent: unit("\t"),
        ..options()
    };
    assert_eq!(formatted(&source, &tab), lines(&["<ul>", "\t<li>a</li>", "\t<li>b</li>", "</ul>"]));
    let four = FormatOptions {
        indent: unit("    "),
        ..options()
    };
    assert_eq!(
        formatted(&source, &four),
        lines(&["<ul>", "    <li>a</li>", "    <li>b</li>", "</ul>"])
    );
    let keep = FormatOptions { indent: None, ..options() };
    assert_eq!(
        formatted("<ul>\n        <li>{=a}</li>\n</ul>", &keep),
        "<ul>\n        <li>{= a}</li>\n</ul>"
    );
    assert_eq!(text("<div>\n<p>{=a}</div>", &keep), "<div>\n<p>{= a}</div>");
}

#[test]
fn rejects_an_indent_unit_that_is_not_spaces_or_one_tab() {
    assert!(IndentUnit::new(" \t").is_err());
    assert!(IndentUnit::new("").is_err());
    assert!(IndentUnit::new("\t\t").is_err());
}

#[test]
fn empties_blank_lines_and_keeps_the_text_after_the_indentation() {
    assert_eq!(formatted("<div>\n   \n  a   b  \n</div>", &options()), "<div>\n\n  a   b  \n</div>");
}

#[test]
fn keeps_the_indentation_inside_pre_textarea_script_style_and_comments() {
    let source = lines(&[
        "<div>",
        "<pre>",
        "    code {= x}",
        "</pre>",
        "<textarea>",
        "   <b>text</b>",
        "   </textarea>",
        "<script>",
        "  if (a < b) { f(\"</div>\"); }",
        "    </script>",
        "<style>",
        "      p { color: red; }",
        "</style>",
        "<!--",
        "        <div>",
        "-->",
        "<p>a</p>",
        "</div>",
    ]);
    assert_eq!(
        formatted(&source, &options()),
        lines(&[
            "<div>",
            "  <pre>",
            "    code {= x}",
            "</pre>",
            "  <textarea>",
            "   <b>text</b>",
            "   </textarea>",
            "  <script>",
            "  if (a < b) { f(\"</div>\"); }",
            "    </script>",
            "  <style>",
            "      p { color: red; }",
            "</style>",
            "  <!--",
            "        <div>",
            "-->",
            "  <p>a</p>",
            "</div>",
        ])
    );
}

#[test]
fn indents_multi_line_start_tags_and_keeps_lines_inside_quoted_values_and_tags() {
    let source = lines(&[
        "<div>",
        "<input",
        "type=\"text\"",
        "      name=\"q\">",
        "<p title=\"first",
        "      second\">x</p>",
        "</div>",
    ]);
    assert_eq!(
        formatted(&source, &options()),
        lines(&[
            "<div>",
            "  <input",
            "    type=\"text\"",
            "    name=\"q\">",
            "  <p title=\"first",
            "      second\">x</p>",
            "</div>"
        ])
    );
    let source = lines(&["<div>", "{= a +", "      b}", "</div>"]);
    assert_eq!(formatted(&source, &options()), lines(&["<div>", "  {= a +", "      b}", "</div>"]));
}

#[test]
fn opens_no_element_for_void_and_self_closing_tags_doctype_and_processing_instructions() {
    let source = lines(&[
        "<!DOCTYPE html>",
        "<div>",
        "<br>",
        "<img src=\"a.png\" />",
        "<svg><path d=\"M0\"/></svg>",
        "<p>x</p>",
        "</div>",
    ]);
    assert_eq!(
        formatted(&source, &options()),
        lines(&[
            "<!DOCTYPE html>",
            "<div>",
            "  <br>",
            "  <img src=\"a.png\" />",
            "  <svg><path d=\"M0\"/></svg>",
            "  <p>x</p>",
            "</div>"
        ])
    );
}

#[test]
fn indents_each_branch_from_the_start_of_the_block_and_reads_tags_inside_start_tags() {
    let source = lines(&[
        "<main>",
        "{? a}",
        "<div class=\"x\">",
        "{:}",
        "<div class=\"y\">",
        "{/}",
        "<p>{= b}</p>",
        "</div>",
        "</main>",
    ]);
    assert_eq!(
        formatted(&source, &options()),
        lines(&[
            "<main>",
            "  {? a}",
            "    <div class=\"x\">",
            "  {:}",
            "    <div class=\"y\">",
            "  {/}",
            "    <p>{= b}</p>",
            "  </div>",
            "</main>"
        ])
    );
    let source = lines(&["<DIV {? a}class=\"x\"{/}>", "<span>{= b}</span>", "</div>"]);
    assert_eq!(
        formatted(&source, &options()),
        lines(&["<DIV {? a}class=\"x\"{/}>", "  <span>{= b}</span>", "</div>"])
    );
}

#[test]
fn reports_an_html_structure_that_cannot_be_indented() {
    let cases: &[(&str, usize, usize)] = &[
        ("<div>\n<p>a</div>", 2, 5),
        ("<ul>\n<li>a\n</ul>", 3, 1),
        ("<div>\n<p>a</p>", 1, 1),
        ("{? a}<div class=\"x\">{:}<p>{/}\n</div>", 1, 27),
        ("{? a}<div>{/}\n</div>", 1, 11),
        ("{? a}<div>{:? b}<div>{/}\n</div>", 1, 22),
    ];
    for (source, line, col) in cases {
        let error = format(source, &options()).expect_err("html error");
        assert_eq!(error.reason, FormatErrorReason::Html, "{source}");
        assert_eq!(error.code, None);
        assert_eq!((error.line, error.col), (*line, *col), "{source}");
    }
}

fn ast(source: &str, delimiters: &Option<String>) -> serde_json::Value {
    let options = ParseOptions {
        delimiters: delimiters.clone(),
    };
    without_spans(&serde_json::to_value(parse(source.as_bytes(), "input.tpl", &options).expect("parse")).expect("json"))
}

/// The invariant and idempotence over every case that parses, in both indentation modes: the formatted text parses to
/// the same AST without spans (and, when lines are indented, without line indentation), and formatting it again
/// changes nothing. A source whose HTML structure cannot be indented is kept with an html error.
#[test]
fn holds_the_invariant_and_idempotence_over_every_case() {
    let mut checked = 0;
    for file in templates() {
        let dir = file.parent().expect("case directory");
        let bytes = fs::read(&file).unwrap_or_else(|error| panic!("{}: {error}", file.display()));
        let delimiters = case_delimiters(dir);
        let parse_options = ParseOptions {
            delimiters: delimiters.clone(),
        };
        // A source that does not parse, bytes that are not UTF-8 among them, is kept with the parse error in both modes.
        if let Err(error) = parse(&bytes, "input.tpl", &parse_options) {
            let RequestError::Template(error) = error else {
                panic!("{}: {error:?}", file.display())
            };
            for indent in [unit("  "), None] {
                let options = FormatOptions {
                    indent,
                    delimiters: delimiters.clone(),
                    name: "input.tpl".to_string(),
                    ..FormatOptions::default()
                };
                let failure = format_bytes(&bytes, &options).expect_err("parse error");
                assert_eq!(failure.reason, FormatErrorReason::Parse, "{}", file.display());
                assert_eq!(failure.code.as_deref(), Some(error.code.as_str()), "{}", file.display());
                assert_eq!((failure.line, failure.col), (error.line, error.col), "{}", file.display());
            }
            continue;
        }
        let source = String::from_utf8(bytes).expect("a source that parses is UTF-8");
        for indent in [unit("  "), None] {
            let options = FormatOptions {
                indent: indent.clone(),
                delimiters: delimiters.clone(),
                name: "input.tpl".to_string(),
                ..FormatOptions::default()
            };
            let once = match format(&source, &options) {
                Ok(formatted) => formatted.text,
                Err(error) => {
                    assert!(
                        error.reason == FormatErrorReason::Html && indent.is_some(),
                        "{}: {error:?}",
                        file.display()
                    );
                    continue;
                }
            };
            let (before, after) = (ast(&source, &delimiters), ast(&once, &delimiters));
            if indent.is_some() {
                assert_eq!(
                    without_line_indentation(&before),
                    without_line_indentation(&after),
                    "{}",
                    file.display()
                );
            } else {
                assert_eq!(before, after, "{}", file.display());
            }
            let twice = format(&once, &options).expect("second run");
            assert_eq!(twice.text, once, "{}: idempotence", file.display());
            assert!(!twice.changed, "{}: idempotence", file.display());
            checked += 1;
        }
    }
    assert!(checked > 0);
}
