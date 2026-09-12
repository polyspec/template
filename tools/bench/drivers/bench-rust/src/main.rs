//! Measures render throughput of the Rust implementation.
//!
//! Usage: bench-rust FIXTURE_DIR ITERS WARMUP [TARGET] [LEGACY_WRAPPERS]
//! It parses the templates once, renders WARMUP times, then measures ITERS renders.

use polyspec_template::{
    Engine, EngineOptions, MapLoader, RenderOptions, RenderTarget, defines_from_json, env_from_json,
};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::time::Instant;

fn fail(message: &str) -> ! {
    eprintln!("{message}");
    std::process::exit(1);
}

/// Reads every template file under a directory into a name to source map.
fn collect_templates(dir: &Path, prefix: &str, into: &mut Vec<(String, String)>) {
    let entries = std::fs::read_dir(dir)
        .unwrap_or_else(|error| fail(&format!("cannot read {}: {error}", dir.display())));
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if path.is_dir() {
            collect_templates(&path, &format!("{prefix}{name}/"), into);
        } else if name.ends_with(".tpl") {
            let source = std::fs::read_to_string(&path)
                .unwrap_or_else(|error| fail(&format!("cannot read {}: {error}", path.display())));
            into.push((format!("{prefix}{name}"), source));
        }
    }
}

/// Decodes an optional fixture file into JSON.
fn read_json(dir: &Path, name: &str) -> Option<serde_json::Value> {
    let bytes = std::fs::read(dir.join(name)).ok()?;
    Some(
        serde_json::from_slice(&bytes)
            .unwrap_or_else(|error| fail(&format!("{name} is not JSON: {error}"))),
    )
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.len() < 3 {
        fail("usage: bench-rust FIXTURE_DIR ITERS WARMUP");
    }
    let fixture = std::fs::canonicalize(&args[0]).unwrap_or_else(|_| PathBuf::from(&args[0]));
    let iters: usize = args[1]
        .parse()
        .unwrap_or_else(|_| fail("ITERS must be a positive integer"));
    let warmup: usize = args[2]
        .parse()
        .unwrap_or_else(|_| fail("WARMUP must be a non-negative integer"));
    if iters == 0 {
        fail("ITERS must be a positive integer");
    }
    let target = args.get(3).map(String::as_str).unwrap_or("input.tpl");
    let legacy_wrappers = args.get(4).is_some_and(|value| value == "true");

    let mut sources = Vec::new();
    collect_templates(&fixture, "", &mut sources);
    let mut loader = MapLoader::new();
    for (name, source) in &sources {
        loader.set(name, source);
    }

    let engine = Engine::new(EngineOptions {
        loader: Some(Box::new(loader)),
        legacy_wrappers,
        ..Default::default()
    });
    let assign = read_json(&fixture, "data.json")
        .unwrap_or_else(|| serde_json::Value::Object(Default::default()));
    let mut options = RenderOptions::default();
    if let Some(define) = read_json(&fixture, "define.json") {
        options.define = defines_from_json(&define).unwrap_or_else(|error| fail(&error.message));
    }
    if let Some(env) = read_json(&fixture, "env.json") {
        options.env = Some(env_from_json(&env).unwrap_or_else(|error| fail(&error.message)));
    }

    // Preparation parses templates and binds assign/define once; repeated renders reuse it.
    let prepared = engine
        .prepare(RenderTarget::Name(target), &assign, &options)
        .unwrap_or_else(|error| fail(&error.message));
    let output = prepared.render().unwrap_or_else(|error| fail(&error.message));
    for _ in 0..warmup {
        prepared
            .render()
            .unwrap_or_else(|error| fail(&error.message));
    }

    let start = Instant::now();
    for _ in 0..iters {
        prepared
            .render()
            .unwrap_or_else(|error| fail(&error.message));
    }
    let seconds = start.elapsed().as_secs_f64();
    let repeated = prepared
        .render()
        .unwrap_or_else(|error| fail(&error.message));

    let digest = Sha256::digest(output.as_bytes());
    let repeat_digest = Sha256::digest(repeated.as_bytes());
    let line = serde_json::json!({
        "lang": "rust",
        "fixture": fixture.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
        "iters": iters,
        "seconds": seconds,
        "output_sha256": format!("{digest:x}"),
        "repeat_sha256": format!("{repeat_digest:x}"),
    });
    println!("{line}");
}
