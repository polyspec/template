package template

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/polyspec/template/packages/go/ast"
	"github.com/polyspec/template/packages/go/loader"
)

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

func (l artifactLoader) Load(name string) (loader.Result, bool, error) {
	result, ok := l.templates[name]
	return result, ok, nil
}

// LoadArtifact loads the AST artifact in directory and returns the program that renders its templates (RT-56). It checks
// the manifest and the digest of every file, and fails when a file is missing or changed.
func LoadArtifact(directory string) (*AstProgram, error) {
	raw, err := os.ReadFile(filepath.Join(directory, "manifest.json"))
	if err != nil {
		return nil, fmt.Errorf("AST artifact manifest is missing: %w", err)
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
		if err != nil {
			return nil, fmt.Errorf("AST artifact is missing or corrupt: %s", name)
		}
		sum := sha256.Sum256(bytes)
		if hex.EncodeToString(sum[:]) != file.ArtifactDigest {
			return nil, fmt.Errorf("AST artifact is missing or corrupt: %s", name)
		}
		template, err := ast.DecodeTemplate(bytes)
		if err != nil {
			return nil, err
		}
		templates[name] = loader.Result{AST: template, Version: file.ArtifactDigest}
	}
	return NewAstProgram(Options{Loader: artifactLoader{templates: templates}})
}
