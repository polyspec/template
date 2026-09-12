//! Loader trait, map loader, filesystem loader and template name resolution (RT-7 to RT-10).

use crate::ast::Template;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// A loaded template: source bytes or a parsed AST, with a version.
#[derive(Debug, Clone)]
pub enum Loaded {
    /// Source text.
    Source {
        /// UTF-8 bytes.
        bytes: Vec<u8>,
        /// Version of the source.
        version: String,
    },
    /// A parsed template.
    Ast {
        /// The AST.
        ast: Template,
        /// Version of the AST.
        version: String,
    },
}

impl Loaded {
    /// The version.
    pub fn version(&self) -> &str {
        match self {
            Loaded::Source { version, .. } | Loaded::Ast { version, .. } => version,
        }
    }
}

/// Loads templates by name (RT-9).
pub trait Loader {
    /// Returns the template for a name, or None when the name does not exist.
    fn load(&self, name: &str) -> Option<Loaded>;
}

/// FNV-1a hash of bytes, used as the version of in-memory sources.
pub fn content_hash(bytes: &[u8]) -> String {
    let mut hash: u32 = 0x811c9dc5;
    for byte in bytes {
        hash ^= *byte as u32;
        hash = hash.wrapping_mul(0x01000193);
    }
    format!("{hash:08x}")
}

/// In-memory loader.
#[derive(Debug, Default)]
pub struct MapLoader {
    entries: HashMap<String, Loaded>,
}

impl MapLoader {
    /// Creates an empty loader.
    pub fn new() -> MapLoader {
        MapLoader::default()
    }

    /// Adds a source.
    pub fn set(&mut self, name: &str, source: &str) {
        self.entries.insert(
            name.to_string(),
            Loaded::Source {
                bytes: source.as_bytes().to_vec(),
                version: content_hash(source.as_bytes()),
            },
        );
    }

    /// Adds a parsed template.
    pub fn set_ast(&mut self, name: &str, ast: Template) {
        let version = content_hash(serde_json::to_string(&ast).unwrap_or_default().as_bytes());
        self.entries.insert(name.to_string(), Loaded::Ast { ast, version });
    }
}

impl Loader for MapLoader {
    fn load(&self, name: &str) -> Option<Loaded> {
        self.entries.get(name).cloned()
    }
}

/// Filesystem loader rooted at a directory (RT-10).
#[derive(Debug, Clone)]
pub struct FsLoader {
    root: PathBuf,
}

impl FsLoader {
    /// Creates a loader for a root directory.
    pub fn new(root: impl AsRef<Path>) -> FsLoader {
        FsLoader {
            root: root.as_ref().to_path_buf(),
        }
    }

    /// Path of a template name under the root.
    pub fn path_of(&self, name: &str) -> PathBuf {
        let mut path = self.root.clone();
        for segment in name.split('/') {
            path.push(segment);
        }
        path
    }
}

impl Loader for FsLoader {
    fn load(&self, name: &str) -> Option<Loaded> {
        let path = self.path_of(name);
        let metadata = std::fs::metadata(&path).ok()?;
        if !metadata.is_file() {
            return None;
        }
        let bytes = std::fs::read(&path).ok()?;
        let modified = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        Some(Loaded::Source {
            bytes,
            version: format!("{modified}:{}", metadata.len()),
        })
    }
}

/// Error of a path that leaves the loader root.
#[derive(Debug)]
pub struct PathError(pub String);

/// RT-8: resolves a path written in a tag against the directory of the current template.
pub fn resolve_path(current: &str, path: &str) -> Result<String, PathError> {
    let mut segments: Vec<&str> = if path.starts_with('/') {
        Vec::new()
    } else {
        let parts: Vec<&str> = current.split('/').collect();
        parts[..parts.len().saturating_sub(1)]
            .iter()
            .copied()
            .filter(|s| !s.is_empty())
            .collect()
    };
    for segment in path.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                if segments.pop().is_none() {
                    return Err(PathError(format!("{path:?} leaves the loader root")));
                }
            }
            other => segments.push(other),
        }
    }
    Ok(segments.join("/"))
}
