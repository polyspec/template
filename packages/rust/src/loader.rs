//! Loader trait, map loader, filesystem loader and template name resolution (RT-7 to RT-10).

use crate::ast::Template;
use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

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
    /// Returns the template for a name, `Ok(None)` when the name does not exist, or `Err` with a
    /// message when loading fails; the engine reports a failure as `E_LOAD_FAILED`.
    fn load(&self, name: &str) -> Result<Option<Loaded>, String>;
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
    fn load(&self, name: &str) -> Result<Option<Loaded>, String> {
        Ok(self.entries.get(name).cloned())
    }
}

/// Filesystem loader rooted at a directory (RT-10). It never follows a symbolic link and gives each
/// file one name. A file is identified by the device and inode number on Unix and by the volume
/// serial number and file index on Windows, which the loader reads from the file while it is open to
/// be read; it keeps that identity, not the file, so it holds no file open after a load.
#[derive(Debug)]
pub struct FsLoader {
    root: PathBuf,
    /// The name of each file that the loader read, by the identity of the file.
    files: Mutex<HashMap<FileIdentity, String>>,
}

/// The identity of an open file: its device and inode number (Unix).
#[cfg(unix)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct FileIdentity {
    device: u64,
    inode: u64,
}

#[cfg(unix)]
fn file_identity(file: &File) -> std::io::Result<FileIdentity> {
    use std::os::unix::fs::MetadataExt;
    let metadata = file.metadata()?;
    Ok(FileIdentity {
        device: metadata.dev(),
        inode: metadata.ino(),
    })
}

/// The identity of an open file: its volume serial number and file index (Windows).
#[cfg(windows)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct FileIdentity {
    volume: u64,
    index: u64,
}

#[cfg(windows)]
fn file_identity(file: &File) -> std::io::Result<FileIdentity> {
    let information = winapi_util::file::information(file)?;
    Ok(FileIdentity {
        volume: information.volume_serial_number(),
        index: information.file_index(),
    })
}

impl FsLoader {
    /// Creates a loader for a root directory.
    pub fn new(root: impl AsRef<Path>) -> FsLoader {
        FsLoader {
            root: root.as_ref().to_path_buf(),
            files: Mutex::new(HashMap::new()),
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

/// RT-10: a name for which no regular file can be found does not exist; a symbolic link at any
/// component of the name, a regular file that cannot be read and a file that the loader read under
/// another name are failures.
impl Loader for FsLoader {
    fn load(&self, name: &str) -> Result<Option<Loaded>, String> {
        let segments: Vec<&str> = name.split('/').collect();
        let mut path = self.root.clone();
        let mut found = None;
        for (index, segment) in segments.iter().enumerate() {
            path.push(segment);
            let Ok(metadata) = std::fs::symlink_metadata(&path) else {
                return Ok(None);
            };
            if metadata.file_type().is_symlink() {
                return Err(format!("{} is a symbolic link", segments[..=index].join("/")));
            }
            if index + 1 < segments.len() && !metadata.is_dir() {
                return Ok(None);
            }
            found = Some(metadata);
        }
        let Some(metadata) = found.filter(|metadata| metadata.is_file()) else {
            return Ok(None);
        };
        let failure = |error: std::io::Error| format!("{}: {error}", path.display());
        let mut file = File::open(&path).map_err(failure)?;
        let identity = file_identity(&file).map_err(failure)?;
        let mut files = self.files.lock().map_err(|error| error.to_string())?;
        if let Some(owner) = files.get(&identity).filter(|owner| owner.as_str() != name) {
            return Err(format!("{name} is the file of {owner}"));
        }
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).map_err(failure)?;
        drop(file);
        files.entry(identity).or_insert_with(|| name.to_string());
        drop(files);
        let modified = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        Ok(Some(Loaded::Source {
            bytes,
            version: format!("{modified}:{}", metadata.len()),
        }))
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
