// Command template implements the command line contract of docs/spec/conformance.md (CNF-4).
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	template "github.com/polyspec/template/packages/template-go"
	"github.com/polyspec/template/packages/template-go/errs"
	"github.com/polyspec/template/packages/template-go/value"
)

func usage(message string) int {
	fmt.Fprintf(os.Stderr, "%s\nusage: template parse FILE [--root DIR] [--delimiters OC]\n       template tokens FILE [--root DIR] [--delimiters OC]\n       template format FILE [--indent none|tab|N] [--delimiters OC]\n       template render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC]\n", message)
	return 1
}

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func run(args []string, stdout, stderr io.Writer) int {
	optionsOf := map[string][]string{
		"parse":  {"root", "delimiters"},
		"tokens": {"root", "delimiters"},
		"format": {"indent", "delimiters"},
		"render": {"data", "define", "env", "root", "delimiters"},
	}
	if len(args) < 2 || optionsOf[args[0]] == nil {
		return usage("command and FILE are required")
	}
	command, file := args[0], args[1]
	options := map[string]string{}
	for _, key := range optionsOf[command] {
		options[key] = ""
	}
	rest := args[2:]
	for i := 0; i < len(rest); i++ {
		flag := rest[i]
		if !strings.HasPrefix(flag, "--") || i+1 >= len(rest) {
			return usage("invalid option " + flag)
		}
		key := flag[2:]
		if _, ok := options[key]; !ok {
			return usage("unknown option " + flag)
		}
		options[key] = rest[i+1]
		i++
	}
	filePath, err := filepath.Abs(file)
	if err != nil {
		return usage(err.Error())
	}
	root := filepath.Dir(filePath)
	if options["root"] != "" {
		if root, err = filepath.Abs(options["root"]); err != nil {
			return usage(err.Error())
		}
	}
	name, err := filepath.Rel(root, filePath)
	if err != nil || strings.HasPrefix(name, "..") {
		return usage("FILE is outside of --root")
	}
	name = filepath.ToSlash(name)

	fail := func(err error) int {
		var te *errs.Error
		if errors.As(err, &te) {
			fmt.Fprintln(stderr, string(te.JSON()))
			return 2
		}
		fmt.Fprintln(stderr, err.Error())
		return 1
	}
	readJSON := func(path string) (value.Value, error) {
		data, err := os.ReadFile(filepath.Join(root, path))
		if err != nil {
			return nil, err
		}
		v, err := value.ParseJSON(data)
		if err != nil {
			var be *value.BindError
			if errors.As(err, &be) {
				return nil, errs.WithoutPosition(be.Code, name, be.Message)
			}
			return nil, err
		}
		return v, nil
	}

	if command == "format" {
		return formatCommand(filePath, name, options, stdout, stderr)
	}
	if command == "tokens" {
		source, err := os.ReadFile(filePath)
		if err != nil {
			return usage(err.Error())
		}
		analysis, err := template.Analyze(source, name, template.ParseOptions{Delimiters: options["delimiters"]})
		if err != nil {
			return fail(err)
		}
		tokens := make([][3]any, len(analysis.Tokens))
		for i, token := range analysis.Tokens {
			tokens[i] = [3]any{token.Start, token.End, token.Kind}
		}
		out, err := json.Marshal(tokens)
		if err != nil {
			return fail(err)
		}
		_, _ = stdout.Write(out)
		return 0
	}
	if command == "parse" {
		source, err := os.ReadFile(filePath)
		if err != nil {
			return usage(err.Error())
		}
		tree, err := template.Parse(source, name, template.ParseOptions{Delimiters: options["delimiters"]})
		if err != nil {
			return fail(err)
		}
		out, err := json.Marshal(tree)
		if err != nil {
			return fail(err)
		}
		_, _ = stdout.Write(out)
		return 0
	}

	program, err := template.NewAstProgram(template.Options{Loader: template.NewFSLoader(os.DirFS(root)), Delimiters: options["delimiters"]})
	if err != nil {
		return fail(err)
	}
	engine := template.NewEngine(program)
	var assign value.Value = value.NewOrderedMap()
	if options["data"] != "" {
		if assign, err = readJSON(options["data"]); err != nil {
			return fail(err)
		}
	}
	renderOptions := template.RenderOptions{}
	if options["define"] != "" {
		defines, err := readJSON(options["define"])
		if err != nil {
			return fail(err)
		}
		renderOptions.Define, err = defineInputs(defines, name)
		if err != nil {
			return fail(err)
		}
	}
	if options["env"] != "" {
		envValue, err := readJSON(options["env"])
		if err != nil {
			return fail(err)
		}
		renderOptions.Env, err = envInput(envValue, name)
		if err != nil {
			return fail(err)
		}
	}
	output, err := engine.Render(name, assign, renderOptions)
	if err != nil {
		return fail(err)
	}
	_, _ = io.WriteString(stdout, output)
	return 0
}

// formatCommand writes the formatted text, or the format error as JSON with exit status 2.
func formatCommand(filePath, name string, options map[string]string, stdout, stderr io.Writer) int {
	formatOptions := template.FormatOptions{Name: name, Delimiters: options["delimiters"]}
	switch indent := options["indent"]; indent {
	case "":
	case "none":
		formatOptions.KeepIndentation = true
	case "tab":
		formatOptions.Indent = "\t"
	default:
		width, err := strconv.Atoi(indent)
		if err != nil || width < 1 || width > 8 {
			return usage("--indent is none, tab or a number of spaces from 1 to 8")
		}
		formatOptions.Indent = strings.Repeat(" ", width)
	}
	source, err := os.ReadFile(filePath)
	if err != nil {
		return usage(err.Error())
	}
	result, err := template.Format(string(source), formatOptions)
	var failure *template.FormatError
	if errors.As(err, &failure) {
		var code *string
		if failure.Code != "" {
			value := string(failure.Code)
			code = &value
		}
		out, _ := json.Marshal(struct {
			Reason  string  `json:"reason"`
			Code    *string `json:"code"`
			Line    int     `json:"line"`
			Col     int     `json:"col"`
			Message string  `json:"message"`
		}{string(failure.Reason), code, failure.Line, failure.Col, failure.Message})
		fmt.Fprintln(stderr, string(out))
		return 2
	}
	if err != nil {
		return usage(err.Error())
	}
	_, _ = io.WriteString(stdout, result.Text)
	return 0
}

func defineInputs(v value.Value, name string) (map[string]template.DefineInput, error) {
	m, ok := v.(*value.OrderedMap)
	if !ok {
		return nil, errs.WithoutPosition(errs.DataUnsupportedType, name, "define is not a map")
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
			return nil, errs.WithoutPosition(errs.DataUnsupportedType, name, "define "+id+" is not a path or map")
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
	return inputs, nil
}

func envInput(v value.Value, name string) (*template.Env, error) {
	m, ok := v.(*value.OrderedMap)
	if !ok {
		return nil, errs.WithoutPosition(errs.DataUnsupportedType, name, "env is not a map")
	}
	env := &template.Env{Timezone: "Z"}
	if tz, ok := m.MustGet("timezone").(string); ok {
		env.Timezone = tz
	}
	if now, ok := m.MustGet("now").(float64); ok {
		env.Now = now
	}
	return env, nil
}
