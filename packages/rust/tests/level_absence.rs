//! RT-55: the Rust crate exposes no generated-program type and no source-compiler operation. The generated programs of the
//! Rust target come from the build compiler, so the crate keeps none of these names as public items.

use std::fs;
use std::path::Path;

fn sources(dir: &Path, found: &mut Vec<String>) {
    for entry in fs::read_dir(dir).expect("read source directory") {
        let path = entry.expect("read entry").path();
        if path.is_dir() {
            sources(&path, found);
        } else if path.extension().is_some_and(|e| e == "rs") {
            found.push(fs::read_to_string(&path).expect("read source file"));
        }
    }
}

#[test]
fn the_crate_exposes_no_generated_program_or_source_compiler_operation() {
    let mut texts = Vec::new();
    sources(&Path::new(env!("CARGO_MANIFEST_DIR")).join("src"), &mut texts);
    for forbidden in ["GeneratedProgram", "encode_artifact", "emit_artifact"] {
        for text in &texts {
            for line in text.lines() {
                let line = line.trim_start();
                let public = line.starts_with("pub ");
                assert!(
                    !(public && line.contains(forbidden)),
                    "a public item names {forbidden}, which RT-55 forbids at this level: {line}"
                );
            }
        }
    }
}
