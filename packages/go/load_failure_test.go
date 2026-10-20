package template_test

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	template "github.com/polyspec/template/packages/go"
	"github.com/polyspec/template/packages/go/errs"
	"github.com/polyspec/template/packages/go/value"
)

// Loader failures (RT-9, RT-10, ERR-6, ERR-9) and JSON text that is not one document (VAL-12).

type failingLoader struct{ failing string }

func (l failingLoader) Load(name string) (template.LoadResult, bool, error) {
	if name == l.failing {
		return template.LoadResult{}, false, fmt.Errorf("cannot read %s", name)
	}
	source := "part"
	if name == "page.tpl" {
		source = "a\n{+ part.tpl}"
	}
	return template.LoadResult{Source: []byte(source), Version: "1"}, true, nil
}

// resultLoader returns one fixed result for every name.
type resultLoader struct{ result template.LoadResult }

func (l resultLoader) Load(name string) (template.LoadResult, bool, error) {
	return l.result, true, nil
}

func renderWith(t *testing.T, loader template.Loader, target string) (string, error) {
	t.Helper()
	program, err := template.NewAstProgram(template.Options{Loader: loader})
	if err != nil {
		t.Fatal(err)
	}
	return program.Render(target, nil, template.RenderOptions{})
}

// RT-9, ERR-6: a loader that fails is E_LOAD_FAILED for the entry template, with that template, line 0 and col 0.
func TestLoaderErrorsAreLoadFailures(t *testing.T) {
	_, err := renderWith(t, failingLoader{failing: "page.tpl"}, "page.tpl")
	if got := templateError(t, err); got.Code != errs.LoadFailed || got.Template != "page.tpl" || got.Line != 0 || got.Col != 0 || !strings.Contains(got.Message, "cannot read page.tpl") {
		t.Errorf("entry = %v", got)
	}
	_, err = renderWith(t, failingLoader{failing: "part.tpl"}, "page.tpl")
	if got := templateError(t, err); got.Code != errs.LoadFailed || got.Template != "page.tpl" || got.Line != 2 || got.Col != 1 || !strings.Contains(got.Message, "cannot read part.tpl") {
		t.Errorf("include = %v", got)
	}
}

// A loader result holds a source text or an AST, and a non-empty version (RT-9).
func TestLoadResultWithoutSourceOrVersionIsALoadFailure(t *testing.T) {
	for name, message := range map[string]struct {
		result  template.LoadResult
		message string
	}{
		"no source":     {template.LoadResult{Version: "1"}, "template page.tpl cannot be loaded: the loader returned no source text and no AST"},
		"no version":    {template.LoadResult{Source: []byte("a")}, "template page.tpl cannot be loaded: the loader returned no version"},
		"empty version": {template.LoadResult{Source: []byte("a"), Version: ""}, "template page.tpl cannot be loaded: the loader returned no version"},
	} {
		_, err := renderWith(t, resultLoader{result: message.result}, "page.tpl")
		if got := templateError(t, err); got.Code != errs.LoadFailed || got.Message != message.message {
			t.Errorf("%s = %v, want %s: %s", name, got, errs.LoadFailed, message.message)
		}
	}
	// A source that is empty and not nil is an empty template, which stays valid.
	if out, err := renderWith(t, resultLoader{result: template.LoadResult{Source: []byte{}, Version: "1"}}, "page.tpl"); err != nil || out != "" {
		t.Errorf("empty source = %q, %v, want an empty template", out, err)
	}
}

// RT-9, RT-10: an unreadable regular file is E_LOAD_FAILED; a directory and a missing name do not exist, E_LOAD_NOT_FOUND.
func TestFilesystemLoaderFailures(t *testing.T) {
	root := t.TempDir()
	locked := filepath.Join(root, "locked.tpl")
	if err := os.WriteFile(locked, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(locked, 0o000); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := os.Chmod(locked, 0o600); err != nil {
			t.Errorf("restore %s: %v", locked, err)
		}
	})
	if err := os.Mkdir(filepath.Join(root, "folder.tpl"), 0o700); err != nil {
		t.Fatal(err)
	}
	loader := template.NewFSLoader(os.DirFS(root))
	// Root reads a file of mode 0o000, every other user cannot (T19.11): the file fails to load exactly when the process
	// cannot read it, and the process cannot read it exactly when it does not run as root.
	_, readErr := os.ReadFile(locked)
	if readable, root := readErr == nil, os.Geteuid() == 0; readable != root {
		t.Fatalf("locked.tpl readable = %v, running as root = %v", readable, root)
	}
	if readErr == nil {
		if out, err := renderWith(t, loader, "locked.tpl"); err != nil || out != "x" {
			t.Errorf("locked.tpl as root = %q, %v, want \"x\"", out, err)
		}
	} else if _, err := renderWith(t, loader, "locked.tpl"); templateError(t, err).Code != errs.LoadFailed {
		t.Errorf("locked.tpl = %s, want %s", templateError(t, err).Code, errs.LoadFailed)
	}
	for name, code := range map[string]errs.Code{"folder.tpl": errs.LoadNotFound, "missing.tpl": errs.LoadNotFound} {
		_, err := renderWith(t, loader, name)
		if got := templateError(t, err); got.Code != code {
			t.Errorf("%s = %s, want %s", name, got.Code, code)
		}
	}
}

func TestJSONTextThatIsNotOneDocument(t *testing.T) {
	for text, want := range map[string]errs.Code{
		"": errs.DataInvalidJSON, " ": errs.DataInvalidJSON, "{": errs.DataInvalidJSON, `{"a": }`: errs.DataInvalidJSON,
		"[1,]": errs.DataInvalidJSON, `{"a": 1} x`: errs.DataInvalidJSON, "nul": errs.DataInvalidJSON, `"a`: errs.DataInvalidJSON,
		"01": errs.DataInvalidJSON, `{"a": , "b": 1e19}`: errs.DataInvalidJSON, `{"a": 1e19, "b": }`: errs.DataNumberRange,
		`[` + strings.Repeat("[", 64) + `x`: errs.DataDepth, `[x, ` + strings.Repeat("[", 65): errs.DataInvalidJSON,
	} {
		_, err := value.ParseJSON([]byte(text))
		var bindErr *value.BindError
		if !errors.As(err, &bindErr) || bindErr.Code != want {
			t.Errorf("ParseJSON(%.30q) = %v, want %s", text, err, want)
		}
	}
}
