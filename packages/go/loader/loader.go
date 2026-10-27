// Package loader defines template loaders and name resolution (RT-7 to RT-10).
package loader

import (
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"io/fs"
	"os"
	"strings"
	"sync"

	"github.com/polyspec/template/packages/go/ast"
)

// Result is a loaded template: source text or a parsed AST, and a version.
type Result struct {
	Source  []byte
	AST     *ast.Template
	Version string
}

// Loader returns the template for a name (RT-9). ok is false when the name does not exist; a
// non-nil error reports a failure, which the engine reports as E_LOAD_FAILED.
type Loader interface {
	Load(name string) (result Result, ok bool, err error)
}

// ContentHash returns the FNV-1a hash of bytes as hex.
func ContentHash(data []byte) string {
	h := fnv.New32a()
	h.Write(data)
	return fmt.Sprintf("%08x", h.Sum32())
}

// MapLoader holds template sources in memory.
type MapLoader struct {
	entries map[string]Result
}

// NewMapLoader creates a map loader from name → source text.
func NewMapLoader(sources map[string]string) *MapLoader {
	l := &MapLoader{entries: map[string]Result{}}
	for name, source := range sources {
		l.Set(name, source)
	}
	return l
}

// Set stores a source.
func (l *MapLoader) Set(name, source string) {
	l.entries[name] = Result{Source: []byte(source), Version: ContentHash([]byte(source))}
}

// SetAST stores a parsed template.
func (l *MapLoader) SetAST(name string, template *ast.Template) {
	data, err := json.Marshal(template)
	if err != nil {
		panic(fmt.Errorf("cannot serialize parsed template: %w", err))
	}
	l.entries[name] = Result{AST: template, Version: ContentHash(data)}
}

// Load implements Loader.
func (l *MapLoader) Load(name string) (Result, bool, error) {
	r, ok := l.entries[name]
	return r, ok, nil
}

// FSLoader reads templates from a file system. It never follows a symbolic link and gives each file one name
// (RT-10).
type FSLoader struct {
	fsys  fs.FS
	mutex sync.Mutex
	// files holds the file of each name that the loader read; a name whose file is the file of another name fails.
	files map[string]fs.FileInfo
}

// NewFSLoader creates a loader over a file system rooted at the loader root. A file system that implements
// fs.ReadLinkFS, such as os.DirFS, reports its symbolic links; os.SameFile judges the identity of two files.
func NewFSLoader(fsys fs.FS) *FSLoader {
	return &FSLoader{fsys: fsys, files: map[string]fs.FileInfo{}}
}

// Load implements Loader; the version is the modification time and size (RT-10). A name for
// which no regular file can be found does not exist. A symbolic link at any component of the name,
// a regular file that cannot be read and a file that the loader read under another name are failures.
func (l *FSLoader) Load(name string) (Result, bool, error) {
	if !fs.ValidPath(name) {
		return Result{}, false, nil
	}
	segments := strings.Split(name, "/")
	var info fs.FileInfo
	for index := range segments {
		component := strings.Join(segments[:index+1], "/")
		var err error
		info, err = fs.Lstat(l.fsys, component)
		if err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				return Result{}, false, nil
			}
			return Result{}, false, err
		}
		if info.Mode()&fs.ModeSymlink != 0 {
			return Result{}, false, fmt.Errorf("%s is a symbolic link", component)
		}
		if index < len(segments)-1 && !info.IsDir() {
			return Result{}, false, nil
		}
	}
	if !info.Mode().IsRegular() {
		return Result{}, false, nil
	}
	if err := l.claim(name, info); err != nil {
		return Result{}, false, err
	}
	data, err := fs.ReadFile(l.fsys, name)
	if err != nil {
		return Result{}, false, err
	}
	return Result{Source: data, Version: fmt.Sprintf("%d:%d", info.ModTime().UnixNano(), info.Size())}, true, nil
}

// claim records the file of a name and fails when another name holds the same file.
func (l *FSLoader) claim(name string, info fs.FileInfo) error {
	l.mutex.Lock()
	defer l.mutex.Unlock()
	for other, file := range l.files {
		if other != name && os.SameFile(file, info) {
			return fmt.Errorf("%s is the file of %s", name, other)
		}
	}
	l.files[name] = info
	return nil
}

// ErrOutsideRoot is returned when a path leaves the loader root.
var ErrOutsideRoot = errors.New("path leaves the loader root")

// ResolvePath implements RT-8.
func ResolvePath(current, path string) (string, error) {
	var segments []string
	if !strings.HasPrefix(path, "/") {
		parts := strings.Split(current, "/")
		for _, part := range parts[:len(parts)-1] {
			if part != "" {
				segments = append(segments, part)
			}
		}
	}
	for _, segment := range strings.Split(path, "/") {
		switch segment {
		case "", ".":
			continue
		case "..":
			if len(segments) == 0 {
				return "", fmt.Errorf("%q: %w", path, ErrOutsideRoot)
			}
			segments = segments[:len(segments)-1]
		default:
			segments = append(segments, segment)
		}
	}
	return strings.Join(segments, "/"), nil
}
