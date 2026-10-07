package template_test

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	template "github.com/polyspec/template/packages/template-go"
	"github.com/polyspec/template/packages/template-go/errs"
	"github.com/polyspec/template/packages/template-go/value"
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

func renderWith(t *testing.T, loader template.Loader, target string) (string, error) {
	t.Helper()
	program, err := template.NewAstProgram(template.Options{Loader: loader})
	if err != nil {
		t.Fatal(err)
	}
	return program.Render(target, nil, template.RenderOptions{})
}

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

func TestFilesystemLoaderFailures(t *testing.T) {
	root := t.TempDir()
	locked := filepath.Join(root, "locked.tpl")
	if err := os.WriteFile(locked, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(locked, 0o000); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(locked, 0o600) })
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
