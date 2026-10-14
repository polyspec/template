// Command template implements the command line contract of docs/spec/conformance.md (CNF-4).
package main

import (
	"encoding/json"
	"errors"
	"flag"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	template "github.com/polyspec/template/packages/go"
	"github.com/polyspec/template/packages/go/errs"
	"github.com/polyspec/template/packages/go/value"
)

const usageText = "usage: template parse [--root DIR] [--delimiters OC] FILE\n" +
	"       template tokens [--root DIR] [--delimiters OC] FILE\n" +
	"       template format [--indent none|tab|N] [--delimiters OC] FILE\n" +
	"       template render [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] FILE\n"

// report writes a line to stderr and returns status; when stderr cannot be written, the command ends with the status
// of a write error, 1 (CNF-4), since the report reaches no one.
func report(stderr io.Writer, status int, line string) int {
	if _, err := io.WriteString(stderr, line+"\n"); err != nil {
		return 1
	}
	return status
}

// usage reports a usage error of CNF-4: a message on stderr and exit status 1.
func usage(stderr io.Writer, message string) int {
	return report(stderr, 1, message+"\n"+strings.TrimSuffix(usageText, "\n"))
}

// write writes a result to stdout; a write error ends the command with status 1.
func write(stdout, stderr io.Writer, data []byte) int {
	if _, err := stdout.Write(data); err != nil {
		return report(stderr, 1, err.Error())
	}
	return 0
}

// indentFlag is the --indent option of format (FMT-9): none, tab or a number of spaces from 1 to 8.
type indentFlag struct{ options *template.FormatOptions }

func (f indentFlag) String() string { return "" }

func (f indentFlag) Set(indent string) error {
	switch indent {
	case "none":
		f.options.KeepIndentation = true
	case "tab":
		f.options.Indent = "\t"
	default:
		width, err := strconv.Atoi(indent)
		if err != nil || width < 1 || width > 8 {
			return errors.New("--indent is none, tab or a number of spaces from 1 to 8")
		}
		f.options.Indent = strings.Repeat(" ", width)
	}
	return nil
}

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

// run parses `<subcommand> [options] FILE` (CNF-4): the options come before the operand, as the flag package reads them.
func run(args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 {
		return usage(stderr, "a subcommand is required")
	}
	command := args[0]
	flags := flag.NewFlagSet(command, flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	var rootOption, delimiters, dataFile, defineFile, envFile string
	var formatOptions template.FormatOptions
	switch command {
	case "parse", "tokens":
		flags.StringVar(&rootOption, "root", "", "template root directory")
	case "format":
		flags.Var(indentFlag{&formatOptions}, "indent", "indent unit: none, tab or 1 to 8 spaces")
	case "render":
		flags.StringVar(&dataFile, "data", "", "data JSON file")
		flags.StringVar(&defineFile, "define", "", "define JSON file")
		flags.StringVar(&envFile, "env", "", "env JSON file")
		flags.StringVar(&rootOption, "root", "", "template root directory")
	default:
		return usage(stderr, "unknown subcommand "+strconv.Quote(command))
	}
	flags.StringVar(&delimiters, "delimiters", "", "delimiter pair")
	if err := flags.Parse(args[1:]); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			if _, err := io.WriteString(stdout, usageText); err != nil {
				return report(stderr, 1, err.Error())
			}
			return 0
		}
		return usage(stderr, err.Error())
	}
	if flags.NArg() != 1 {
		return usage(stderr, "exactly one FILE is required after the options")
	}
	file := flags.Arg(0)
	filePath, err := filepath.Abs(file)
	if err != nil {
		return usage(stderr, err.Error())
	}
	root := filepath.Dir(filePath)
	if rootOption != "" {
		if root, err = filepath.Abs(rootOption); err != nil {
			return usage(stderr, err.Error())
		}
	}
	name, err := filepath.Rel(root, filePath)
	if err != nil || strings.HasPrefix(name, "..") {
		return usage(stderr, "FILE is outside of --root")
	}
	name = filepath.ToSlash(name)

	fail := func(err error) int {
		var te *errs.Error
		if errors.As(err, &te) {
			return report(stderr, 2, string(te.JSON()))
		}
		return report(stderr, 1, err.Error())
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
		formatOptions.Name = name
		formatOptions.Delimiters = delimiters
		return formatCommand(filePath, formatOptions, stdout, stderr)
	}
	if command == "tokens" {
		source, err := os.ReadFile(filePath)
		if err != nil {
			return usage(stderr, err.Error())
		}
		analysis, err := template.Analyze(source, name, template.ParseOptions{Delimiters: delimiters})
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
		return write(stdout, stderr, out)
	}
	if command == "parse" {
		source, err := os.ReadFile(filePath)
		if err != nil {
			return usage(stderr, err.Error())
		}
		tree, err := template.Parse(source, name, template.ParseOptions{Delimiters: delimiters})
		if err != nil {
			return fail(err)
		}
		out, err := json.Marshal(tree)
		if err != nil {
			return fail(err)
		}
		return write(stdout, stderr, out)
	}

	program, err := template.NewAstProgram(template.Options{Loader: template.NewFSLoader(os.DirFS(root)), Delimiters: delimiters})
	if err != nil {
		return fail(err)
	}
	engine := template.NewEngine(program)
	var assign value.Value = value.NewOrderedMap()
	if dataFile != "" {
		if assign, err = readJSON(dataFile); err != nil {
			return fail(err)
		}
	}
	renderOptions := template.RenderOptions{}
	if defineFile != "" {
		defines, err := readJSON(defineFile)
		if err != nil {
			return fail(err)
		}
		renderOptions.Define, err = defineInputs(defines, name)
		if err != nil {
			return fail(err)
		}
	}
	if envFile != "" {
		envValue, err := readJSON(envFile)
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
	return write(stdout, stderr, []byte(output))
}

// formatCommand writes the formatted text, or the format error as JSON with exit status 2.
func formatCommand(filePath string, formatOptions template.FormatOptions, stdout, stderr io.Writer) int {
	source, err := os.ReadFile(filePath)
	if err != nil {
		return usage(stderr, err.Error())
	}
	result, err := template.Format(string(source), formatOptions)
	var failure *template.FormatError
	if errors.As(err, &failure) {
		var code *string
		if failure.Code != "" {
			value := string(failure.Code)
			code = &value
		}
		out, err := json.Marshal(struct {
			Reason  string  `json:"reason"`
			Code    *string `json:"code"`
			Line    int     `json:"line"`
			Col     int     `json:"col"`
			Message string  `json:"message"`
		}{string(failure.Reason), code, failure.Line, failure.Col, failure.Message})
		if err != nil {
			return report(stderr, 1, err.Error())
		}
		return report(stderr, 2, string(out))
	}
	if err != nil {
		return usage(stderr, err.Error())
	}
	return write(stdout, stderr, []byte(result.Text))
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
