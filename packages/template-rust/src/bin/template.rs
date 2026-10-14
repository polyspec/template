//! Command line interface (CNF-4).
//!   parse FILE [--root DIR] [--delimiters OC]
//!   render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC]
//!   tokens FILE [--root DIR] [--delimiters OC]
//!   format FILE [--indent none|tab|N] [--delimiters OC]

use polyspec_template::{
    ArgumentError, AstProgram, BindError, Engine, EngineOptions, FormatError, FormatErrorReason, FormatOptions, IndentUnit, ParseOptions,
    RenderOptions, RenderTarget, RequestError, TemplateError, analyze, defines_from_json, env_from_json, format as format_template, parse,
    read_json as parse_json_text,
};
use std::path::{Path, PathBuf};
use std::process::exit;

fn usage(message: &str) -> ! {
    eprintln!("{message}");
    eprintln!("usage: template parse FILE [--root DIR] [--delimiters OC]");
    eprintln!("       template render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC]");
    eprintln!("       template tokens FILE [--root DIR] [--delimiters OC]");
    eprintln!("       template format FILE [--indent none|tab|N] [--delimiters OC]");
    exit(1);
}

struct Options {
    data: Option<String>,
    define: Option<String>,
    env: Option<String>,
    root: Option<String>,
    delimiters: Option<String>,
    indent: Option<String>,
}

/// An argument error is not an ERR-1 error (ERR-13); it ends like a usage error.
fn argument(error: ArgumentError) -> ! {
    eprintln!("{error}");
    exit(1);
}

fn fail(error: TemplateError) -> ! {
    eprintln!("{}", serde_json::to_string(&error).unwrap_or_default());
    exit(2);
}

fn read_json(root: &Path, path: &str, template: &str) -> serde_json::Value {
    let bytes = std::fs::read(root.join(path)).unwrap_or_else(|error| usage(&format!("cannot read {path}: {error}")));
    let text = match std::str::from_utf8(&bytes) {
        Ok(text) => text,
        Err(error) => fail(TemplateError::without_position(
            polyspec_template::ErrorCode::E_DATA_INVALID_UTF8,
            template,
            format!("invalid UTF-8 at byte {}", error.valid_up_to()),
        )),
    };
    // Syntax, numbers, unpaired surrogates and the nesting depth are data errors (VAL-12, VAL-20).
    parse_json_text(text).unwrap_or_else(|error| bind_failure(template, error))
}

fn bind_failure(template: &str, error: BindError) -> ! {
    fail(TemplateError::without_position(error.code, template, error.message))
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let (command, file) = match (args.first(), args.get(1)) {
        (Some(command), Some(file)) if matches!(command.as_str(), "parse" | "render" | "tokens" | "format") => {
            (command.clone(), file.clone())
        }
        _ => usage("command and FILE are required"),
    };
    let mut options = Options {
        data: None,
        define: None,
        env: None,
        root: None,
        delimiters: None,
        indent: None,
    };
    let mut index = 2;
    while index < args.len() {
        let flag = &args[index];
        let Some(value) = args.get(index + 1) else {
            usage(&format!("invalid option {flag}"))
        };
        match flag.as_str() {
            "--data" => options.data = Some(value.clone()),
            "--define" => options.define = Some(value.clone()),
            "--env" => options.env = Some(value.clone()),
            "--root" => options.root = Some(value.clone()),
            "--delimiters" => options.delimiters = Some(value.clone()),
            "--indent" if command == "format" => options.indent = Some(value.clone()),
            _ => usage(&format!("unknown option {flag}")),
        }
        index += 2;
    }
    let root = match &options.root {
        Some(root) => std::fs::canonicalize(root).unwrap_or_else(|_| PathBuf::from(root)),
        None => std::fs::canonicalize(&file)
            .ok()
            .and_then(|path| path.parent().map(Path::to_path_buf))
            .unwrap_or_else(|| PathBuf::from(".")),
    };
    let file_path = std::fs::canonicalize(&file).unwrap_or_else(|_| root.join(&file));
    let relative = match file_path.strip_prefix(&root) {
        Ok(relative) => relative.to_path_buf(),
        Err(_) => usage("FILE is outside of --root"),
    };
    let name: String = relative
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join("/");
    let parse_options = ParseOptions {
        delimiters: options.delimiters.clone(),
    };
    if command == "format" {
        let source = std::fs::read(&file_path).unwrap_or_else(|error| usage(&format!("cannot read {file}: {error}")));
        let indent = match options.indent.as_deref() {
            None => Some(IndentUnit::new("  ")),
            Some("none") => None,
            Some("tab") => Some(IndentUnit::new("\t")),
            Some(count) => match count.parse::<usize>() {
                Ok(count @ 1..=8) => Some(IndentUnit::new(&" ".repeat(count))),
                _ => usage(&format!("invalid indent {count}")),
            },
        }
        .transpose()
        .unwrap_or_else(|error| argument(error));
        let format_options = FormatOptions {
            name: name.clone(),
            delimiters: options.delimiters.clone(),
            indent,
            ..FormatOptions::default()
        };
        // A source that is not UTF-8 does not parse; the parser reports where (LEX-1).
        let result = match std::str::from_utf8(&source) {
            Ok(text) => format_template(text, &format_options),
            Err(_) => match analyze(&source, &name, &parse_options) {
                Err(RequestError::Template(error)) => Err(FormatError {
                    reason: FormatErrorReason::Parse,
                    code: Some(error.code.as_str().to_string()),
                    line: error.line,
                    col: error.col,
                    message: error.to_string(),
                }),
                Err(RequestError::Argument(error)) => argument(error),
                Ok(_) => unreachable!("a source that is not UTF-8 parses"),
            },
        };
        match result {
            Ok(formatted) => print!("{}", formatted.text),
            Err(error) => {
                eprintln!("{}", serde_json::to_string(&error).unwrap_or_default());
                exit(2);
            }
        }
        return;
    }
    if command == "tokens" {
        let source = std::fs::read(&file_path).unwrap_or_else(|error| usage(&format!("cannot read {file}: {error}")));
        match analyze(&source, &name, &parse_options) {
            Ok(analysis) => {
                let tokens: Vec<serde_json::Value> = analysis
                    .tokens
                    .iter()
                    .map(|token| serde_json::json!([token.start, token.end, token.kind]))
                    .collect();
                print!("{}", serde_json::Value::Array(tokens));
            }
            Err(RequestError::Template(error)) => fail(error),
            Err(RequestError::Argument(error)) => argument(error),
        }
        return;
    }
    if command == "parse" {
        let source = std::fs::read(&file_path).unwrap_or_else(|error| usage(&format!("cannot read {file}: {error}")));
        match parse(&source, &name, &parse_options) {
            Ok(ast) => print!("{}", serde_json::to_string(&ast).unwrap_or_default()),
            Err(RequestError::Template(error)) => fail(error),
            Err(RequestError::Argument(error)) => argument(error),
        }
        return;
    }

    let engine = Engine::new(
        AstProgram::new(EngineOptions {
            loader: Some(Box::new(polyspec_template::FsLoader::new(&root))),
            functions: Default::default(),
            limits: None,
            delimiters: options.delimiters.clone(),
            artifact_refresh: Default::default(),
        })
        .unwrap_or_else(|error| argument(error)),
    );
    let assign = match &options.data {
        Some(path) => read_json(&root, path, &name),
        None => serde_json::Value::Object(Default::default()),
    };
    let mut render_options = RenderOptions::default();
    if let Some(path) = &options.define {
        render_options.define = defines_from_json(&read_json(&root, path, &name)).unwrap_or_else(|error| bind_failure(&name, error));
    }
    if let Some(path) = &options.env {
        render_options.env = Some(env_from_json(&read_json(&root, path, &name)).unwrap_or_else(|error| bind_failure(&name, error)));
    }
    match engine.render(RenderTarget::Name(&name), &assign, &render_options) {
        Ok(output) => print!("{output}"),
        Err(RequestError::Template(error)) => fail(error),
        Err(RequestError::Argument(error)) => argument(error),
    }
}
