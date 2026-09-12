//! Command line interface (CNF-4).
//!   parse FILE [--root DIR] [--delimiters OC] [--legacy-wrappers true]
//!   render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] [--legacy-wrappers true]

use polyspec_template::{
    BindError, Engine, EngineOptions, ParseOptions, RenderOptions, RenderTarget, TemplateError, defines_from_json, env_from_json, parse,
};
use std::path::{Path, PathBuf};
use std::process::exit;

fn usage(message: &str) -> ! {
    eprintln!("{message}");
    eprintln!("usage: template parse FILE [--root DIR] [--delimiters OC] [--legacy-wrappers true]");
    eprintln!("       template render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] [--legacy-wrappers true]");
    exit(1);
}

struct Options {
    data: Option<String>,
    define: Option<String>,
    env: Option<String>,
    root: Option<String>,
    delimiters: Option<String>,
    legacy_wrappers: bool,
}

fn fail(error: TemplateError) -> ! {
    eprintln!("{}", serde_json::to_string(&error).unwrap_or_default());
    exit(2);
}

fn read_json(root: &Path, path: &str, template: &str) -> serde_json::Value {
    let bytes = std::fs::read(root.join(path)).unwrap_or_else(|error| usage(&format!("cannot read {path}: {error}")));
    if let Err(error) = std::str::from_utf8(&bytes) {
        fail(TemplateError::without_position(
            polyspec_template::ErrorCode::E_DATA_INVALID_UTF8,
            template,
            format!("invalid UTF-8 at byte {}", error.valid_up_to()),
        ));
    }
    serde_json::from_slice(&bytes).unwrap_or_else(|error| usage(&format!("{path} is not JSON: {error}")))
}

fn bind_failure(template: &str, error: BindError) -> ! {
    fail(TemplateError::without_position(error.code, template, error.message))
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let (command, file) = match (args.first(), args.get(1)) {
        (Some(command), Some(file)) if command == "parse" || command == "render" => (command.clone(), file.clone()),
        _ => usage("command and FILE are required"),
    };
    let mut options = Options {
        data: None,
        define: None,
        env: None,
        root: None,
        delimiters: None,
        legacy_wrappers: false,
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
            "--legacy-wrappers" => options.legacy_wrappers = value == "true",
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
    if let Some(delimiters) = &options.delimiters
        && polyspec_template::parser::scanner::parse_delimiters(delimiters).is_none()
    {
        usage(&format!("{delimiters:?} is not a delimiter pair"));
    }

    if command == "parse" {
        let source = std::fs::read(&file_path).unwrap_or_else(|error| usage(&format!("cannot read {file}: {error}")));
        match parse(
            &source,
            &name,
            &ParseOptions {
                delimiters: options.delimiters.clone(),
                legacy_wrappers: options.legacy_wrappers,
            },
        ) {
            Ok(ast) => print!("{}", serde_json::to_string(&ast).unwrap_or_default()),
            Err(error) => fail(error),
        }
        return;
    }

    let engine = Engine::new(EngineOptions {
        loader: Some(Box::new(polyspec_template::FsLoader::new(&root))),
        functions: Default::default(),
        limits: None,
        delimiters: options.delimiters.clone(),
        legacy_wrappers: options.legacy_wrappers,
    });
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
        Err(error) => fail(error),
    }
}
