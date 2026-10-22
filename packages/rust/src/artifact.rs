//! The artifact-runtime of RT-56 (docs/spec/runtime.md): loads an AST artifact that the build compiler wrote, checks the
//! manifest and the digest of every file, and returns the program that renders its templates. The loaded templates keep
//! the digest of their file as their version (RT-10).

use crate::ast::decode_template;
use crate::loader::{Loaded, Loader};
use crate::render::engine::{ArtifactRefresh, AstProgram, EngineOptions};
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

/// The failure of loading an artifact. `Stale` is an artifact that is missing or stale: its manifest or one of its files is
/// absent, or a file does not match its digest; it is the one failure that a build fixes, so `load_or_refresh` rebuilds on
/// it under `True` and on nothing else. `Failed` is every other failure, with its cause in the message.
#[derive(Debug)]
pub enum ArtifactError {
    /// The artifact is missing or stale.
    Stale(String),
    /// Any other failure: a file that cannot be read, a manifest that is not JSON, an AST that does not decode, a failed build.
    Failed(String),
}

impl std::fmt::Display for ArtifactError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ArtifactError::Stale(message) | ArtifactError::Failed(message) => formatter.write_str(message),
        }
    }
}

impl std::error::Error for ArtifactError {}

/// Reads a file of an artifact: an absent file is `Stale`, any other read failure is `Failed` with its cause.
fn read_artifact_file(path: &Path, what: &str) -> Result<Vec<u8>, ArtifactError> {
    std::fs::read(path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            ArtifactError::Stale(format!("{what} is missing: {}", path.display()))
        } else {
            ArtifactError::Failed(format!("{what} cannot be read: {}: {error}", path.display()))
        }
    })
}

/// Loads the AST artifact in `directory` and returns the program that renders its templates (RT-56). A missing or stale
/// artifact fails with `ArtifactError::Stale`; any other failure fails with `ArtifactError::Failed` and its cause.
pub fn load_artifact(directory: &Path) -> Result<AstProgram, ArtifactError> {
    let raw = read_artifact_file(&directory.join("manifest.json"), "AST artifact manifest")?;
    let manifest: Manifest =
        serde_json::from_slice(&raw).map_err(|error| ArtifactError::Failed(format!("AST artifact manifest is not JSON: {error}")))?;
    if manifest.mode != "ast" {
        return Err(ArtifactError::Failed(format!(
            "the artifact in {} is not an AST artifact: {}",
            directory.display(),
            manifest.mode
        )));
    }
    if !manifest.files.contains_key(&manifest.entry) {
        return Err(ArtifactError::Failed("AST artifact source graph is incomplete".to_string()));
    }
    let mut templates = HashMap::new();
    for (name, file) in &manifest.files {
        let bytes = read_artifact_file(&directory.join(&file.path), &format!("AST artifact file of {name}"))?;
        if sha256_hex(&bytes) != file.artifact_digest {
            return Err(ArtifactError::Stale(format!(
                "AST artifact file of {name} does not match its digest"
            )));
        }
        let text = std::str::from_utf8(&bytes)
            .map_err(|error| ArtifactError::Failed(format!("AST artifact file of {name} is not UTF-8: {error}")))?;
        let ast = decode_template(text)
            .map_err(|error| ArtifactError::Failed(format!("AST artifact file of {name} does not decode: {error}")))?;
        templates.insert(name.clone(), (ast, file.artifact_digest.clone()));
    }
    AstProgram::new(EngineOptions {
        loader: Some(Box::new(ArtifactLoader { templates })),
        ..Default::default()
    })
    .map_err(|error| ArtifactError::Failed(error.to_string()))
}

/// ArtifactStore.loadOrRefresh (docs/spec/runtime.md): returns the program of the artifact in `directory`, building it first
/// when the policy asks. `build` writes the AST artifact of the sources; the build compiler is passed in by the host, so the
/// runtime carries no compiler. `Dev` builds on every call; `True` reuses an artifact that loads and rebuilds only a missing
/// or stale one (`ArtifactError::Stale`), returning every other error; `False` loads the artifact that exists and never builds.
pub fn load_or_refresh(
    directory: &Path,
    refresh: ArtifactRefresh,
    build: impl Fn(&Path) -> Result<(), String>,
) -> Result<AstProgram, ArtifactError> {
    match refresh {
        ArtifactRefresh::False => load_artifact(directory),
        ArtifactRefresh::Dev => {
            build(directory).map_err(ArtifactError::Failed)?;
            load_artifact(directory)
        }
        ArtifactRefresh::True => match load_artifact(directory) {
            Err(ArtifactError::Stale(_)) => {
                build(directory).map_err(ArtifactError::Failed)?;
                load_artifact(directory)
            }
            result => result,
        },
    }
}
