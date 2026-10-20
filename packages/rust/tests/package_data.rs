//! RT-73: the schema that decode_template reads is embedded in the crate (`include_str!`), so a decode runs from a working
//! directory that holds no file of the repository. This file holds one test, because the working directory belongs to the
//! whole test process.

use polyspec_template::decode_template;

#[test]
fn decode_reads_the_embedded_schema_outside_the_repository() {
    let directory = std::env::temp_dir().join(format!("polyspec-package-data-{}", std::process::id()));
    std::fs::create_dir_all(&directory).expect("a directory of the test");
    std::env::set_current_dir(&directory).expect("enter the directory");
    let decoded = decode_template(r#"{"type":"Template","name":"x.tpl","body":[],"comments":[]}"#).expect("a valid AST decodes");
    assert_eq!(decoded.name, "x.tpl");
    let error = decode_template(r#"{"type":"Template","name":"x.tpl","body":[],"comments":1}"#).expect_err("an invalid AST");
    assert_eq!(error.path(), Some("/comments"));
    std::fs::remove_dir_all(&directory).expect("remove the directory");
}
