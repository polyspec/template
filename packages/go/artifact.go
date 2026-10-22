package template

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/polyspec/template/packages/go/ast"
	"github.com/polyspec/template/packages/go/loader"
)

// ErrArtifactStale is the failure of an artifact that is missing or stale: its manifest or one of its files is absent, or a
// file does not match its digest. It is the one failure that a build fixes, so LoadOrRefresh rebuilds on it under true and
// on nothing else; LoadArtifact wraps it with %w.
var ErrArtifactStale = errors.New("AST artifact is missing or stale")

// artifactManifest is the manifest that the build compiler writes beside the AST files of an artifact.
type artifactManifest struct {
	Mode  string                  `json:"mode"`
	Entry string                  `json:"entry"`
	Files map[string]artifactFile `json:"files"`
}

type artifactFile struct {
	Path           string `json:"path"`
	ArtifactDigest string `json:"artifactDigest"`
}

// artifactLoader serves the decoded templates of a loaded artifact; the digest of each file is its version (RT-10).
type artifactLoader struct {
	templates map[string]loader.Result
}

// Load returns the decoded template of name and the digest of its file as its version; ok is false for a name the
// artifact does not hold.
func (l artifactLoader) Load(name string) (loader.Result, bool, error) {
	result, ok := l.templates[name]
	return result, ok, nil
}

// LoadArtifact loads the AST artifact in directory and returns the program that renders its templates (RT-56). A missing
// or stale artifact fails with an error that wraps ErrArtifactStale; any other failure (a file that cannot be read, a
// manifest that is not JSON, an AST that does not decode) fails with an error that wraps its cause.
func LoadArtifact(directory string) (*AstProgram, error) {
	manifestPath := filepath.Join(directory, "manifest.json")
	raw, err := os.ReadFile(manifestPath)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, fmt.Errorf("%w: the manifest %s is missing", ErrArtifactStale, manifestPath)
	}
	if err != nil {
		return nil, fmt.Errorf("AST artifact manifest cannot be read: %w", err)
	}
	var manifest artifactManifest
	if err := json.Unmarshal(raw, &manifest); err != nil {
		return nil, fmt.Errorf("AST artifact manifest is not JSON: %w", err)
	}
	if manifest.Mode != "ast" {
		return nil, fmt.Errorf("the artifact in %s is not an AST artifact: %s", directory, manifest.Mode)
	}
	if _, ok := manifest.Files[manifest.Entry]; !ok {
		return nil, fmt.Errorf("AST artifact source graph is incomplete")
	}
	templates := make(map[string]loader.Result, len(manifest.Files))
	for name, file := range manifest.Files {
		bytes, err := os.ReadFile(filepath.Join(directory, file.Path))
		if errors.Is(err, fs.ErrNotExist) {
			return nil, fmt.Errorf("%w: the file of %s is missing", ErrArtifactStale, name)
		}
		if err != nil {
			return nil, fmt.Errorf("AST artifact file of %s cannot be read: %w", name, err)
		}
		sum := sha256.Sum256(bytes)
		if hex.EncodeToString(sum[:]) != file.ArtifactDigest {
			return nil, fmt.Errorf("%w: the file of %s does not match its digest", ErrArtifactStale, name)
		}
		template, err := ast.DecodeTemplate(bytes)
		if err != nil {
			return nil, fmt.Errorf("AST artifact file of %s does not decode: %w", name, err)
		}
		templates[name] = loader.Result{AST: template, Version: file.ArtifactDigest}
	}
	return NewAstProgram(Options{Loader: artifactLoader{templates: templates}})
}

// LoadOrRefresh is ArtifactStore.loadOrRefresh (docs/spec/runtime.md): it returns the program of the artifact in directory,
// building it first when the policy asks. build writes the AST artifact of the sources; the build compiler is passed in by
// the host, so the runtime carries no compiler. dev builds on every call; true reuses a verified artifact and rebuilds only
// a missing or stale one (ErrArtifactStale), returning every other error; false loads the artifact that exists and never
// builds.
func LoadOrRefresh(directory string, refresh ArtifactRefresh, build func(directory string) error) (*AstProgram, error) {
	switch refresh {
	case ArtifactRefreshFalse:
		return LoadArtifact(directory)
	case ArtifactRefreshDev:
		if err := build(directory); err != nil {
			return nil, err
		}
		return LoadArtifact(directory)
	case ArtifactRefreshTrue:
		program, err := LoadArtifact(directory)
		if err == nil {
			return program, nil
		}
		if !errors.Is(err, ErrArtifactStale) {
			return nil, err
		}
		if err := build(directory); err != nil {
			return nil, err
		}
		return LoadArtifact(directory)
	default:
		return nil, fmt.Errorf("%s is not an artifact refresh policy", refresh)
	}
}
