package template_test

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	template "github.com/polyspec/template/packages/go"
)

// TestLoadOrRefreshPolicies checks RT-56 ArtifactStore.loadOrRefresh: dev builds on every call, true reuses an artifact that
// loads, and false never builds.
func TestLoadOrRefreshPolicies(t *testing.T) {
	directory := "../../tests/fixtures/artifact-runtime/artifact"
	builds := 0
	build := func(string) error { builds++; return nil }

	if _, err := template.LoadOrRefresh(directory, template.ArtifactRefreshTrue, build); err != nil {
		t.Fatal(err)
	}
	if builds != 0 {
		t.Fatalf("true built an artifact that loads: %d", builds)
	}
	if _, err := template.LoadOrRefresh(directory, template.ArtifactRefreshDev, build); err != nil {
		t.Fatal(err)
	}
	if builds != 1 {
		t.Fatalf("dev built %d times, want 1", builds)
	}
	if _, err := template.LoadOrRefresh(directory, template.ArtifactRefreshFalse, build); err != nil {
		t.Fatal(err)
	}
	if builds != 1 {
		t.Fatalf("false built an artifact: %d", builds)
	}
	failed := errors.New("missing")
	if _, err := template.LoadOrRefresh("../../tests/fixtures/artifact-runtime/none", template.ArtifactRefreshFalse, build); err == nil {
		t.Fatal("false loaded a missing artifact")
	}
	_ = failed
}

// TestLoadOrRefreshTrueFailsOnABrokenManifest checks that true rebuilds only a missing or stale artifact: a manifest that
// is not JSON fails with its error and builds nothing.
func TestLoadOrRefreshTrueFailsOnABrokenManifest(t *testing.T) {
	directory := t.TempDir()
	if err := os.WriteFile(filepath.Join(directory, "manifest.json"), []byte("not json"), 0o644); err != nil {
		t.Fatal(err)
	}
	builds := 0
	_, err := template.LoadOrRefresh(directory, template.ArtifactRefreshTrue, func(string) error { builds++; return nil })
	if err == nil || builds != 0 {
		t.Fatalf("true rebuilt a broken manifest: err %v, builds %d", err, builds)
	}
}
