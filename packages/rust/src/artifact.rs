//! The artifact-runtime of RT-56 (docs/spec/runtime.md): loads an AST artifact that the build compiler wrote, checks the
//! manifest and the digest of every file, and returns the program that renders its templates. The loaded templates keep
//! the digest of their file as their version (RT-10).

use crate::ast::decode_template;
use crate::loader::{Loaded, Loader};
use crate::render::engine::{AstProgram, EngineOptions};
use crate::sha256::sha256_hex;
use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;

#[derive(Deserialize)]
struct Manifest {
    mode: String,
    entry: String,
    files: HashMap<String, ManifestFile>,
}

#[derive(Deserialize)]
struct ManifestFile {
    path: String,
    #[serde(rename = "artifactDigest")]
    artifact_digest: String,
}

/// The templates of a loaded artifact, by name.
struct ArtifactLoader {
    templates: HashMap<String, (crate::ast::Template, String)>,
}

impl Loader for ArtifactLoader {
    fn load(&self, name: &str) -> Result<Option<Loaded>, String> {
        Ok(self.templates.get(name).map(|(ast, version)| Loaded::Ast {
            ast: ast.clone(),
            version: version.clone(),
        }))
    }
}

/// Loads the AST artifact in `directory` and returns the program that renders its templates (RT-56). It fails when the
/// manifest is not an AST manifest, a file is missing, or a file does not match its digest.
pub fn load_artifact(directory: &Path) -> Result<AstProgram, String> {
    let raw = std::fs::read_to_string(directory.join("manifest.json"))
        .map_err(|error| format!("AST artifact manifest is missing: {error}"))?;
    let manifest: Manifest = serde_json::from_str(&raw).map_err(|error| format!("AST artifact manifest is not JSON: {error}"))?;
    if manifest.mode != "ast" {
        return Err(format!("the artifact in {} is not an AST artifact: {}", directory.display(), manifest.mode));
    }
    if !manifest.files.contains_key(&manifest.entry) {
        return Err("AST artifact source graph is incomplete".to_string());
    }
    let mut templates = HashMap::new();
    for (name, file) in &manifest.files {
        let bytes = std::fs::read(directory.join(&file.path)).map_err(|_| format!("AST artifact is missing or corrupt: {name}"))?;
        if sha256_hex(&bytes) != file.artifact_digest {
            return Err(format!("AST artifact is missing or corrupt: {name}"));
        }
        let text = std::str::from_utf8(&bytes).map_err(|_| format!("AST artifact is missing or corrupt: {name}"))?;
        let ast = decode_template(text).map_err(|error| format!("AST artifact {name} does not decode: {error}"))?;
        templates.insert(name.clone(), (ast, file.artifact_digest.clone()));
    }
    AstProgram::new(EngineOptions {
        loader: Some(Box::new(ArtifactLoader { templates })),
        ..Default::default()
    })
    .map_err(|error| error.to_string())
}
