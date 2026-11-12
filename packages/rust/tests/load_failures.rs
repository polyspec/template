//! Loader failures (RT-9, RT-10, ERR-6, ERR-9) and JSON text that is not one document (VAL-12).

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    reason = "a test states its expectation with unwrap and expect; a failure there is the failure of the test"
)]

use polyspec_template::{
    AstProgram, EngineOptions, ErrorCode, FsLoader, HostError, LoadError, Loaded, Loader, OrderedMap, RenderError, RenderOptions,
    RenderTarget, read_json,
};
use std::os::unix::fs::PermissionsExt;

struct FailingLoader {
    failing: &'static str,
    judged: &'static str,
}

impl Loader for FailingLoader {
    fn load(&self, name: &str) -> Result<Option<Loaded>, LoadError> {
        if name == self.failing {
            return Err(LoadError::Host(HostError::Callback(format!("cannot read {name}").into())));
        }
        if name == self.judged {
            return Err(LoadError::Failed(format!("{name} cannot be read")));
        }
        let source = if name == "page.tpl" { "a\n{+ part.tpl}" } else { "part" };
        Ok(Some(Loaded::Source {
            bytes: source.as_bytes().to_vec(),
            version: "1".to_string(),
        }))
    }
}

/// Returns one source with a fixed version for every name.
struct ResultLoader {
    bytes: Vec<u8>,
    version: &'static str,
}

impl Loader for ResultLoader {
    fn load(&self, _name: &str) -> Result<Option<Loaded>, LoadError> {
        Ok(Some(Loaded::Source {
            bytes: self.bytes.clone(),
            version: self.version.to_string(),
        }))
    }
}

fn render(loader: Box<dyn Loader>, target: &str) -> Result<String, RenderError> {
    let program = AstProgram::new(EngineOptions {
        loader: Some(loader),
        ..Default::default()
    })
    .expect("valid engine options");
    // RT-77: load reads the templates of a loader that reads files; the render reads none.
    program.load(RenderTarget::Name(target), &RenderOptions::default())?;
    program.render_values(RenderTarget::Name(target), OrderedMap::new(), &RenderOptions::default())
}

/// RT-9, FUN-46: the error of a host loader reaches the caller unchanged; a loader of the implementation that judges a
/// load failed is load_failed, with the template and line 0 and col 0 for the entry template (ERR-6).
#[test]
fn a_loader_error_reaches_the_caller_and_a_judged_failure_is_load_failed() {
    for failing in ["page.tpl", "part.tpl"] {
        match render(Box::new(FailingLoader { failing, judged: "" }), "page.tpl") {
            Err(RenderError::Callback(error)) => assert_eq!(error.to_string(), format!("cannot read {failing}")),
            other => panic!("expected the error of the loader, got {other:?}"),
        }
    }
    let entry = kind(
        render(
            Box::new(FailingLoader {
                failing: "",
                judged: "page.tpl",
            }),
            "page.tpl",
        )
        .unwrap_err(),
    );
    assert_eq!(
        (entry.code, entry.template.as_str(), entry.line, entry.col),
        (ErrorCode::E_LOAD_FAILED, "page.tpl", 0, 0)
    );
    assert!(entry.message.contains("page.tpl cannot be read"), "{}", entry.message);
    let include = kind(
        render(
            Box::new(FailingLoader {
                failing: "",
                judged: "part.tpl",
            }),
            "page.tpl",
        )
        .unwrap_err(),
    );
    assert_eq!(
        (include.code, include.template.as_str(), include.line, include.col),
        (ErrorCode::E_LOAD_FAILED, "page.tpl", 2, 1)
    );
}

/// A loader result holds a non-empty version (RT-9); an empty source is an empty template.
#[test]
fn a_loader_result_without_a_version_is_a_load_failure() {
    let error = render(
        Box::new(ResultLoader {
            bytes: b"a".to_vec(),
            version: "",
        }),
        "page.tpl",
    )
    .map_err(kind)
    .unwrap_err();
    assert_eq!(
        (error.code, error.message.as_str()),
        (
            ErrorCode::E_LOAD_FAILED,
            "template page.tpl cannot be loaded: the loader returned no version"
        )
    );
    let empty = render(
        Box::new(ResultLoader {
            bytes: Vec::new(),
            version: "1",
        }),
        "page.tpl",
    )
    .map_err(|error| kind(error).code);
    assert_eq!(empty, Ok(String::new()));
}

/// RT-9, RT-10: an unreadable regular file and a directory are load_failed; a missing name and a name below a regular
/// file (ENOTDIR) do not exist, load_not_found.
#[test]
fn the_filesystem_loader_separates_missing_and_unreadable_files() {
    let root = std::env::temp_dir().join(format!("template-loader-{}", std::process::id()));
    std::fs::create_dir_all(root.join("folder.tpl")).expect("directory");
    let locked = root.join("locked.tpl");
    std::fs::write(&locked, "x").expect("file");
    std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o000)).expect("permissions");
    // Root reads a file of mode 0o000, every other user cannot (T19.11): the file fails to load exactly when the
    // process cannot read it, and the process cannot read it exactly when it does not run as root.
    let readable = std::fs::read(&locked).is_ok();
    let user = std::process::Command::new("id").arg("-u").output().expect("id -u");
    let as_root = String::from_utf8_lossy(&user.stdout).trim() == "0";
    let locked_result = render(Box::new(FsLoader::new(&root)), "locked.tpl").map_err(|error| kind(error).code);
    let codes: Vec<ErrorCode> = ["folder.tpl", "missing.tpl", "locked.tpl/inner.tpl", "missing/inner.tpl"]
        .iter()
        .map(|name| kind(render(Box::new(FsLoader::new(&root)), name).unwrap_err()).code)
        .collect();
    std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o600)).expect("permissions");
    std::fs::remove_dir_all(&root).expect("cleanup");
    assert_eq!(readable, as_root, "locked.tpl readable = {readable}, running as root = {as_root}");
    if readable {
        assert_eq!(locked_result, Ok("x".to_string()));
    } else {
        assert_eq!(locked_result, Err(ErrorCode::E_LOAD_FAILED));
    }
    assert_eq!(
        codes,
        vec![
            ErrorCode::E_LOAD_FAILED,
            ErrorCode::E_LOAD_NOT_FOUND,
            ErrorCode::E_LOAD_NOT_FOUND,
            ErrorCode::E_LOAD_NOT_FOUND
        ]
    );
}

#[test]
fn text_that_is_not_one_json_document_is_invalid_json() {
    let deep = format!("[{}x", "[".repeat(64));
    let syntax_first = format!("[x, {}", "[".repeat(65));
    let cases: Vec<(&str, ErrorCode)> = vec![
        ("", ErrorCode::E_DATA_INVALID_JSON),
        (" ", ErrorCode::E_DATA_INVALID_JSON),
        ("{", ErrorCode::E_DATA_INVALID_JSON),
        ("{\"a\": }", ErrorCode::E_DATA_INVALID_JSON),
        ("[1,]", ErrorCode::E_DATA_INVALID_JSON),
        ("{\"a\": 1} x", ErrorCode::E_DATA_INVALID_JSON),
        ("nul", ErrorCode::E_DATA_INVALID_JSON),
        ("\"a", ErrorCode::E_DATA_INVALID_JSON),
        ("01", ErrorCode::E_DATA_INVALID_JSON),
        ("{\"a\": , \"b\": 1e19}", ErrorCode::E_DATA_INVALID_JSON),
        ("{\"a\": 1e19, \"b\": }", ErrorCode::E_DATA_NUMBER_RANGE),
        (deep.as_str(), ErrorCode::E_DATA_DEPTH),
        (syntax_first.as_str(), ErrorCode::E_DATA_INVALID_JSON),
    ];
    for (text, code) in cases {
        assert_eq!(read_json(text).unwrap_err().code, code, "{text:.30}");
    }
}

/// The template error of a render failure; a test that expects a kind fails on the error of host code (FUN-46).
fn kind(error: RenderError) -> polyspec_template::TemplateError {
    match error {
        RenderError::Kind(error) => error,
        other => panic!("expected a template error, got the error of host code: {other}"),
    }
}
