// Package loader defines template loaders and name resolution (RT-7 to RT-10).
package loader

import (
	"errors"
	"fmt"
	"hash/fnv"
	"io/fs"
	"strings"

	"github.com/polyspec/template/ast"
)

// Result is a loaded template: source text or a parsed AST, and a version.
type Result struct {
	Source  []byte
	AST     *ast.Template
	Version string
}

// Loader returns the template for a name; ok is false when the name does not exist.
type Loader interface {
	Load(name string) (Result, bool)
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
	l.entries[name] = Result{AST: template, Version: ContentHash([]byte(name))}
}

// Load implements Loader.
func (l *MapLoader) Load(name string) (Result, bool) {
	r, ok := l.entries[name]
	return r, ok
}

// FSLoader reads templates from a file system.
type FSLoader struct {
	fsys fs.FS
}

// NewFSLoader creates a loader over a file system rooted at the loader root.
func NewFSLoader(fsys fs.FS) *FSLoader {
	return &FSLoader{fsys: fsys}
}

// Load implements Loader; the version is the modification time and size.
func (l *FSLoader) Load(name string) (Result, bool) {
	if !fs.ValidPath(name) {
		return Result{}, false
	}
	info, err := fs.Stat(l.fsys, name)
	if err != nil || info.IsDir() {
		return Result{}, false
	}
	data, err := fs.ReadFile(l.fsys, name)
	if err != nil {
		return Result{}, false
	}
	return Result{Source: data, Version: fmt.Sprintf("%d:%d", info.ModTime().UnixNano(), info.Size())}, true
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
