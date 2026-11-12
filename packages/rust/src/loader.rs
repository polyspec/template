//! Loader trait, map loader, filesystem loader and template name resolution (RT-7 to RT-10).

use crate::ast::Template;
use std::collections::HashMap;
use std::fs::File;
use std::io::{ErrorKind, Read};
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
        /// The line index of the source of the AST, which an AST artifact records, so that an error names its line and
        /// column (ERR-3); without it the error has line 0 and column 0.
        lines: Option<crate::LineIndex>,
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

/// The failure of a loader (RT-9), the error of a core function that calls a callback (binding design E-1c): a kind,
/// which the program reports at the tag that names the template, `load_failed` with the cause as its message for a
/// load that the loader judges failed; or the error of host code, `Raised` or `Callback`, which reaches the caller of
/// `render` unchanged (FUN-46).
pub type LoadError = crate::RenderError;

/// The `load_failed` of a loader of the implementation, with the cause as its message (RT-9).
pub fn load_failed(name: &str, cause: impl Into<String>) -> LoadError {
    LoadError::Kind(crate::TemplateError::without_position(crate::ErrorCode::E_LOAD_FAILED, name, cause))
}

/// Loads templates by name (RT-9).
pub trait Loader: Send + Sync {
    /// Returns the template for a name, `Ok(None)` when the name does not exist, or the failure of the load.
    fn load(&self, name: &str) -> Result<Option<Loaded>, LoadError>;

    /// RT-77: whether the loader reads files. A program calls such a loader only in `prepare` and `load`, never during a
    /// render; a loader of host code is called during a render, synchronously.
    fn blocking_io(&self) -> bool {
        false
    }
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

    /// Adds a parsed template. Its version is the hash of its AST JSON (RT-10); an AST without a JSON form, which no
    /// parsed or decoded template is, is an error.
    pub fn set_ast(&mut self, name: &str, ast: Template) -> Result<(), String> {
        let json = crate::encode_template(&ast).map_err(|error| format!("the AST of {name} has no JSON form: {}", error.message))?;
        let version = content_hash(json.as_bytes());
        self.entries.insert(name.to_string(), Loaded::Ast { ast, version, lines: None });
        Ok(())
    }

    /// Adds a parsed template with the line index of its source: the byte offset of the start of each line, from 0, as
    /// an AST artifact records it. Offsets that do not start at 0 or do not increase are an error.
    pub fn set_ast_lines(&mut self, name: &str, starts: Vec<usize>, ast: Template) -> Result<(), String> {
        let lines = crate::LineIndex::try_from_starts(starts).map_err(|error| format!("the line index of {name}: {error}"))?;
        self.set_ast(name, ast)?;
        if let Some(Loaded::Ast { lines: held, .. }) = self.entries.get_mut(name) {
            *held = Some(lines);
        }
        Ok(())
    }
}

impl Loader for MapLoader {
    fn load(&self, name: &str) -> Result<Option<Loaded>, LoadError> {
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

/// RT-10: a name does not exist exactly when reading the metadata of a component fails with `ENOENT` or `ENOTDIR`;
/// every other metadata error, a symbolic link at any component, a name that is not a regular file, a regular file that
/// cannot be read and a file that the loader read under another name are failures.
impl Loader for FsLoader {
    fn load(&self, name: &str) -> Result<Option<Loaded>, LoadError> {
        self.load_file(name).map_err(|cause| load_failed(name, cause))
    }

    fn blocking_io(&self) -> bool {
        true
    }
}

impl FsLoader {
    fn load_file(&self, name: &str) -> Result<Option<Loaded>, String> {
        let segments: Vec<&str> = name.split('/').collect();
        let mut path = self.root.clone();
        let mut found = None;
        for (index, segment) in segments.iter().enumerate() {
            path.push(segment);
            let metadata = match std::fs::symlink_metadata(&path) {
                Ok(metadata) => metadata,
                // RT-10: the absence of an entry, and only it, is a name that does not exist.
                Err(error) if matches!(error.kind(), ErrorKind::NotFound | ErrorKind::NotADirectory) => return Ok(None),
                Err(error) => return Err(format!("{}: {error}", path.display())),
            };
            if metadata.file_type().is_symlink() {
                return Err(format!("{} is a symbolic link", segments[..=index].join("/")));
            }
            found = Some(metadata);
        }
        let Some(metadata) = found else {
            return Err(format!("{name:?} names no file"));
        };
        if !metadata.is_file() {
            return Err(format!("{} is not a regular file", path.display()));
        }
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
            .map_err(failure)?
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|error| format!("{}: {error}", path.display()))?
            .as_nanos();
        Ok(Some(Loaded::Source {
            bytes,
            version: format!("{modified}:{}", metadata.len()),
        }))
    }
}

/// RT-8: resolves a path written in a tag against the directory of the current template.
pub fn resolve_path(current: &str, path: &str) -> Result<String, crate::TemplateError> {
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
                    return Err(crate::TemplateError::without_position(
                        crate::ErrorCode::E_LOAD_OUTSIDE_ROOT,
                        current,
                        format!("{path:?} leaves the loader root"),
                    ));
                }
            }
            other => segments.push(other),
        }
    }
    Ok(segments.join("/"))
}
