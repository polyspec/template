//! Command line interface (CNF-4): `<subcommand> [options] FILE`, the options before the operand.
//!   parse [--root DIR] [--delimiters OC] FILE
//!   render [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] FILE
//!   tokens [--root DIR] [--delimiters OC] FILE
//!   format [--indent none|tab|N] [--delimiters OC] FILE

use clap::error::ErrorKind;
use clap::{Args, CommandFactory, Parser, Subcommand};
use polyspec_template::{
    ArgumentError, AstProgram, BindError, Engine, EngineOptions, FormatOptions, IndentUnit, ParseOptions, RenderOptions, RenderTarget,
    RequestError, TemplateError, analyze, defines_from_json, env_from_json, format_bytes, parse, read_json as parse_json_text,
};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::exit;

#[derive(Parser)]
#[command(name = "template", about = "Parse, analyze, format and render templates (CNF-4)")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Print the AST JSON of FILE.
    #[command(override_usage = "template parse [--root DIR] [--delimiters OC] FILE")]
    Parse {
        #[command(flatten)]
        input: Input,
    },
    /// Print the tokens of FILE as a JSON array of [start, end, type].
    #[command(override_usage = "template tokens [--root DIR] [--delimiters OC] FILE")]
    Tokens {
        #[command(flatten)]
        input: Input,
    },
    /// Print the formatted text of FILE.
    #[command(override_usage = "template format [--indent none|tab|N] [--delimiters OC] FILE")]
    Format {
        /// Indent unit: none, tab or a number of spaces from 1 to 8; the default is two spaces.
        #[arg(long, value_name = "none|tab|N", value_parser = indent)]
        indent: Option<Indent>,
        /// Delimiter pair of two characters.
        #[arg(long, value_name = "OC")]
        delimiters: Option<String>,
        #[command(flatten)]
        file: Operand,
    },
    /// Print the HTML that FILE renders.
    #[command(override_usage = "template render [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] FILE")]
    Render {
        /// JSON file of the data, relative to the root.
        #[arg(long, value_name = "F")]
        data: Option<String>,
        /// JSON file of the defines, relative to the root.
        #[arg(long, value_name = "F")]
        define: Option<String>,
        /// JSON file of the environment, relative to the root.
        #[arg(long, value_name = "F")]
        env: Option<String>,
        #[command(flatten)]
        input: Input,
    },
}

/// The root, the delimiters and the operand of parse, tokens and render.
#[derive(Args)]
struct Input {
    /// Template root directory; the default is the directory of FILE.
    #[arg(long, value_name = "DIR")]
    root: Option<String>,
    /// Delimiter pair of two characters.
    #[arg(long, value_name = "OC")]
    delimiters: Option<String>,
    #[command(flatten)]
    file: Operand,
}

/// The operand FILE. Options come before it: clap reads every argument from FILE on as an operand, and
/// [`Operand::file`] rejects any argument after FILE.
#[derive(Args)]
struct Operand {
    /// The template file.
    #[arg(value_name = "FILE", required = true, num_args = 1.., trailing_var_arg = true)]
    operands: Vec<String>,
}

impl Operand {
    /// FILE, or a usage error of the subcommand when an argument follows it.
    fn file(&self, subcommand: &str) -> &str {
        match self.operands.as_slice() {
            [file] => file,
            [_, after, ..] => {
                let mut command = Cli::command();
                let message = format!("unexpected argument {after:?} after FILE; options come before FILE");
                usage_error(
                    command
                        .find_subcommand_mut(subcommand)
                        .expect("subcommand")
                        .error(ErrorKind::UnknownArgument, message),
                )
            }
            [] => unreachable!("clap requires FILE"),
        }
    }
}

/// The --indent value: `None` keeps the indentation of every line.
#[derive(Clone)]
struct Indent(Option<IndentUnit>);

fn indent(value: &str) -> Result<Indent, String> {
    let unit = match value {
        "none" => return Ok(Indent(None)),
        "tab" => "\t".to_string(),
        count => match count.parse::<usize>() {
            Ok(count @ 1..=8) => " ".repeat(count),
            _ => return Err("--indent is none, tab or a number of spaces from 1 to 8".to_string()),
        },
    };
    IndentUnit::new(&unit).map(|unit| Indent(Some(unit))).map_err(|error| error.message)
}

/// A usage error of CNF-4 ends with status 1; help is printed to stdout with status 0.
fn usage_error(error: clap::Error) -> ! {
    let printed = error.print();
    exit(if printed.is_ok() && !error.use_stderr() { 0 } else { 1 })
}

fn usage(message: &str) -> ! {
    eprintln!("{message}");
    exit(1);
}

/// An argument error is not an ERR-1 error (ERR-13); it ends like a usage error.
fn argument(error: ArgumentError) -> ! {
    eprintln!("{error}");
    exit(1);
}

/// The JSON text of a result or an error; a value that does not serialize ends the command with status 1.
fn json<T: serde::Serialize>(value: &T) -> String {
    serde_json::to_string(value).unwrap_or_else(|error| {
        eprintln!("cannot write JSON: {error}");
        exit(1)
    })
}

/// Writes a result to stdout; a write error ends the command with status 1.
fn write_stdout(text: &str) {
    let mut stdout = std::io::stdout().lock();
    if let Err(error) = stdout.write_all(text.as_bytes()).and_then(|()| stdout.flush()) {
        eprintln!("cannot write the result: {error}");
        exit(1);
    }
}

fn fail(error: TemplateError) -> ! {
    eprintln!("{}", json(&error));
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

/// The root directory and the template name of FILE: the name is FILE relative to the root.
fn locate(file: &str, root: Option<&str>) -> (PathBuf, PathBuf, String) {
    let root = match root {
        Some(root) => std::fs::canonicalize(root).unwrap_or_else(|_| PathBuf::from(root)),
        None => std::fs::canonicalize(file)
            .ok()
            .and_then(|path| path.parent().map(Path::to_path_buf))
            .unwrap_or_else(|| PathBuf::from(".")),
    };
    let file_path = std::fs::canonicalize(file).unwrap_or_else(|_| root.join(file));
    let relative = match file_path.strip_prefix(&root) {
        Ok(relative) => relative.to_path_buf(),
        Err(_) => usage("FILE is outside of --root"),
    };
    let name = relative
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join("/");
    (root, file_path, name)
}

fn read_source(file_path: &Path, file: &str) -> Vec<u8> {
    std::fs::read(file_path).unwrap_or_else(|error| usage(&format!("cannot read {file}: {error}")))
}

fn main() {
    let cli = Cli::try_parse().unwrap_or_else(|error| usage_error(error));
    match cli.command {
        Command::Format { indent, delimiters, file } => {
            let file = file.file("format");
            let (_, file_path, name) = locate(file, None);
            let source = read_source(&file_path, file);
            let defaults = FormatOptions::default();
            let options = FormatOptions {
                name,
                delimiters,
                indent: indent.map_or(defaults.indent.clone(), |Indent(unit)| unit),
                ..defaults
            };
            match format_bytes(&source, &options) {
                Ok(formatted) => write_stdout(&formatted.text),
                Err(error) => {
                    eprintln!("{}", json(&error));
                    exit(2);
                }
            }
        }
        Command::Tokens { input } => {
            let file = input.file.file("tokens");
            let (_, file_path, name) = locate(file, input.root.as_deref());
            let source = read_source(&file_path, file);
            let parse_options = ParseOptions {
                delimiters: input.delimiters,
            };
            match analyze(&source, &name, &parse_options) {
                Ok(analysis) => {
                    let tokens: Vec<_> = analysis.tokens.iter().map(|token| (token.start, token.end, token.kind)).collect();
                    write_stdout(&json(&tokens));
                }
                Err(RequestError::Template(error)) => fail(error),
                Err(RequestError::Argument(error)) => argument(error),
            }
        }
        Command::Parse { input } => {
            let file = input.file.file("parse");
            let (_, file_path, name) = locate(file, input.root.as_deref());
            let source = read_source(&file_path, file);
            let parse_options = ParseOptions {
                delimiters: input.delimiters,
            };
            match parse(&source, &name, &parse_options) {
                Ok(ast) => write_stdout(&json(&ast)),
                Err(RequestError::Template(error)) => fail(error),
                Err(RequestError::Argument(error)) => argument(error),
            }
        }
        Command::Render { data, define, env, input } => {
            let (root, _, name) = locate(input.file.file("render"), input.root.as_deref());
            render(&root, &name, input.delimiters, data, define, env);
        }
    }
}

fn render(root: &Path, name: &str, delimiters: Option<String>, data: Option<String>, define: Option<String>, env: Option<String>) {
    let engine = Engine::new(
        AstProgram::new(EngineOptions {
            loader: Some(Box::new(polyspec_template::FsLoader::new(root))),
            functions: Default::default(),
            limits: None,
            delimiters,
            artifact_refresh: Default::default(),
        })
        .unwrap_or_else(|error| argument(error)),
    );
    let assign = match &data {
        Some(path) => read_json(root, path, name),
        None => serde_json::Value::Object(Default::default()),
    };
    let mut render_options = RenderOptions::default();
    if let Some(path) = &define {
        render_options.define = defines_from_json(&read_json(root, path, name)).unwrap_or_else(|error| bind_failure(name, error));
    }
    if let Some(path) = &env {
        render_options.env = Some(env_from_json(&read_json(root, path, name)).unwrap_or_else(|error| bind_failure(name, error)));
    }
    match engine.render(RenderTarget::Name(name), &assign, &render_options) {
        Ok(output) => write_stdout(&output),
        Err(RequestError::Template(error)) => fail(error),
        Err(RequestError::Argument(error)) => argument(error),
    }
}
