//! Loader failures (RT-9, RT-10, ERR-6, ERR-9) and JSON text that is not one document (VAL-12).

use polyspec_template::{
    AstProgram, EngineOptions, ErrorCode, FsLoader, Loaded, Loader, OrderedMap, RenderOptions, RenderTarget, TemplateError, read_json,
};
use std::os::unix::fs::PermissionsExt;

struct FailingLoader {
    failing: &'static str,
}

impl Loader for FailingLoader {
    fn load(&self, name: &str) -> Result<Option<Loaded>, String> {
        if name == self.failing {
            return Err(format!("cannot read {name}"));
        }
        let source = if name == "page.tpl" { "a\n{+ part.tpl}" } else { "part" };
        Ok(Some(Loaded::Source {
            bytes: source.as_bytes().to_vec(),
            version: "1".to_string(),
        }))
    }
}

fn render(loader: Box<dyn Loader>, target: &str) -> Result<String, TemplateError> {
    AstProgram::new(EngineOptions {
        loader: Some(loader),
        ..Default::default()
    })
    .expect("valid engine options")
    .render_values(RenderTarget::Name(target), OrderedMap::new(), &RenderOptions::default())
}

#[test]
fn a_loader_error_is_a_load_failure() {
    let entry = render(Box::new(FailingLoader { failing: "page.tpl" }), "page.tpl").unwrap_err();
    assert_eq!(
        (entry.code, entry.template.as_str(), entry.line, entry.col),
        (ErrorCode::E_LOAD_FAILED, "page.tpl", 0, 0)
    );
    assert!(entry.message.contains("cannot read page.tpl"), "{}", entry.message);
    let include = render(Box::new(FailingLoader { failing: "part.tpl" }), "page.tpl").unwrap_err();
    assert_eq!(
        (include.code, include.template.as_str(), include.line, include.col),
        (ErrorCode::E_LOAD_FAILED, "page.tpl", 2, 1)
    );
    assert!(include.message.contains("cannot read part.tpl"), "{}", include.message);
}

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
    let locked_result = render(Box::new(FsLoader::new(&root)), "locked.tpl").map_err(|error| error.code);
    let codes: Vec<ErrorCode> = ["folder.tpl", "missing.tpl"]
        .iter()
        .map(|name| render(Box::new(FsLoader::new(&root)), name).unwrap_err().code)
        .collect();
    std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o600)).expect("permissions");
    std::fs::remove_dir_all(&root).expect("cleanup");
    assert_eq!(readable, as_root, "locked.tpl readable = {readable}, running as root = {as_root}");
    if readable {
        assert_eq!(locked_result, Ok("x".to_string()));
    } else {
        assert_eq!(locked_result, Err(ErrorCode::E_LOAD_FAILED));
    }
    assert_eq!(codes, vec![ErrorCode::E_LOAD_NOT_FOUND, ErrorCode::E_LOAD_NOT_FOUND]);
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
