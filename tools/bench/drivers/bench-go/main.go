// Command bench-go measures render throughput of the Go implementation.
// Usage: bench-go FIXTURE_DIR ITERS WARMUP [TARGET] [LEGACY_WRAPPERS]
// It parses the templates once, renders WARMUP times, then measures ITERS renders.
package main

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	template "github.com/polyspec/template"
	"github.com/polyspec/template/value"
)

func fail(message string) {
	fmt.Fprintln(os.Stderr, message)
	os.Exit(1)
}

// collectTemplates reads every template file under dir into a name to source map.
func collectTemplates(dir string) map[string]string {
	sources := map[string]string{}
	err := filepath.WalkDir(dir, func(path string, entry os.DirEntry, err error) error {
		if err != nil || entry.IsDir() || !strings.HasSuffix(entry.Name(), ".tpl") {
			return err
		}
		relative, err := filepath.Rel(dir, path)
		if err != nil {
			return err
		}
		content, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		sources[filepath.ToSlash(relative)] = string(content)
		return nil
	})
	if err != nil {
		fail(err.Error())
	}
	return sources
}

// readJSON decodes an optional fixture file into a template value.
func readJSON(dir, name string) value.Value {
	data, err := os.ReadFile(filepath.Join(dir, name))
	if err != nil {
		return nil
	}
	parsed, err := value.ParseJSON(data)
	if err != nil {
		fail(err.Error())
	}
	return parsed
}

// defineInputs converts a define map into render options.
func defineInputs(v value.Value) map[string]template.DefineInput {
	m, ok := v.(*value.OrderedMap)
	if !ok {
		fail("define is not a map")
	}
	inputs := map[string]template.DefineInput{}
	for _, id := range m.Keys() {
		entryValue := m.MustGet(id)
		if path, ok := entryValue.(string); ok {
			inputs[id] = template.DefineInput{Template: path}
			continue
		}
		entry, ok := entryValue.(*value.OrderedMap)
		if !ok {
			fail("define " + id + " is not a path or map")
		}
		input := template.DefineInput{}
		if html, ok := entry.MustGet("html").(string); ok {
			input.HTML = &html
		}
		if path, ok := entry.MustGet("template").(string); ok {
			input.Template = path
		}
		if data, ok := entry.Get("data"); ok {
			input.Data = data
		}
		inputs[id] = input
	}
	return inputs
}

// envInput converts an env map into a render environment.
func envInput(v value.Value) *template.Env {
	m, ok := v.(*value.OrderedMap)
	if !ok {
		fail("env is not a map")
	}
	env := &template.Env{Timezone: "Z"}
	if timezone, ok := m.MustGet("timezone").(string); ok {
		env.Timezone = timezone
	}
	if now, ok := m.MustGet("now").(float64); ok {
		env.Now = now
	}
	return env
}

func main() {
	if len(os.Args) < 4 {
		fail("usage: bench-go FIXTURE_DIR ITERS WARMUP [TARGET]")
	}
	fixture, err := filepath.Abs(os.Args[1])
	if err != nil {
		fail(err.Error())
	}
	iters, err := strconv.Atoi(os.Args[2])
	if err != nil || iters <= 0 {
		fail("ITERS must be a positive integer")
	}
	warmup, err := strconv.Atoi(os.Args[3])
	if err != nil || warmup < 0 {
		fail("WARMUP must be a non-negative integer")
	}
	target := "input.tpl"
	if len(os.Args) >= 5 {
		target = os.Args[4]
	}
	legacyWrappers := len(os.Args) >= 6 && os.Args[5] == "true"

	engine, err := template.NewEngine(template.Options{Loader: template.NewMapLoader(collectTemplates(fixture)), LegacyWrappers: legacyWrappers})
	if err != nil {
		fail(err.Error())
	}
	var assign value.Value = value.NewOrderedMap()
	if parsed := readJSON(fixture, "data.json"); parsed != nil {
		assign = parsed
	}
	options := template.RenderOptions{}
	if define := readJSON(fixture, "define.json"); define != nil {
		options.Define = defineInputs(define)
	}
	if env := readJSON(fixture, "env.json"); env != nil {
		options.Env = envInput(env)
	}

	prepared, err := engine.Prepare(target, assign, options)
	if err != nil {
		fail(err.Error())
	}
	output, err := prepared.Render()
	if err != nil { fail(err.Error()) }
	for i := 0; i < warmup; i++ {
		if _, err := prepared.Render(); err != nil {
			fail(err.Error())
		}
	}

	start := time.Now()
	for i := 0; i < iters; i++ {
		if _, err := prepared.Render(); err != nil {
			fail(err.Error())
		}
	}
	seconds := time.Since(start).Seconds()
	repeated, err := prepared.Render()
	if err != nil {
		fail(err.Error())
	}

	line, err := json.Marshal(map[string]any{
		"lang":          "go",
		"fixture":       filepath.Base(fixture),
		"iters":         iters,
		"seconds":       seconds,
		"output_sha256": fmt.Sprintf("%x", sha256.Sum256([]byte(output))),
		"repeat_sha256": fmt.Sprintf("%x", sha256.Sum256([]byte(repeated))),
	})
	if err != nil {
		fail(err.Error())
	}
	fmt.Println(string(line))
}
