package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"time"

	template "github.com/polyspec/template"
	"github.com/polyspec/template/ast"
	"github.com/polyspec/template/loader"
	"github.com/polyspec/template/value"
	compilercoverage "showcase-adapter-go/generated/compiler-coverage"
	emptystate "showcase-adapter-go/generated/empty-state"
	htmlslot "showcase-adapter-go/generated/html-slot"
	reactboundary "showcase-adapter-go/generated/react-boundary"
	scopeprecedence "showcase-adapter-go/generated/scope-precedence"
)

type Adapter struct {
	root   string
	engine *template.Engine
}

var _ RenderAdapter = (*Adapter)(nil)

func NewAdapter(root string) (*Adapter, error) {
	var program template.Program
	if os.Getenv("SHOWCASE_EXECUTION_MODE") == "generated" {
		var err error
		program, err = generatedProgram(filepath.Base(root))
		if err != nil {
			return nil, err
		}
	} else {
		templateLoader, err := artifactLoader(root)
		if err != nil {
			return nil, err
		}
		program, err = template.NewAstProgram(template.Options{Loader: templateLoader})
		if err != nil {
			return nil, err
		}
	}
	engine := template.NewEngine(program)
	return &Adapter{root: root, engine: engine}, nil
}

func generatedProgram(scenario string) (template.Program, error) {
	options := template.Options{}
	switch scenario {
	case "compiler-coverage":
		return compilercoverage.NewGeneratedProgram(options)
	case "empty-state":
		return emptystate.NewGeneratedProgram(options)
	case "html-slot":
		return htmlslot.NewGeneratedProgram(options)
	case "react-boundary":
		return reactboundary.NewGeneratedProgram(options)
	case "scope-precedence":
		return scopeprecedence.NewGeneratedProgram(options)
	default:
		return nil, fmt.Errorf("generated program is missing for scenario %s", scenario)
	}
}

func artifactLoader(root string) (*loader.MapLoader, error) {
	base := filepath.Join(root, "compiled", "ast")
	manifestBytes, err := os.ReadFile(filepath.Join(base, "manifest.json"))
	if err != nil {
		return nil, fmt.Errorf("compiled AST manifest: %w", err)
	}
	var manifest struct {
		Files map[string]struct {
			Path string `json:"path"`
		} `json:"files"`
	}
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		return nil, fmt.Errorf("compiled AST manifest: %w", err)
	}
	result := loader.NewMapLoader(nil)
	for name, entry := range manifest.Files {
		data, err := os.ReadFile(filepath.Join(base, entry.Path))
		if err != nil {
			return nil, fmt.Errorf("compiled AST/%s: %w", name, err)
		}
		tree, err := ast.DecodeTemplate(data)
		if err != nil {
			return nil, fmt.Errorf("compiled AST/%s: %w", name, err)
		}
		result.SetAST(name, tree)
	}
	return result, nil
}

func readJSON(root, name string) (value.Value, error) {
	data, err := os.ReadFile(filepath.Join(root, name))
	if err != nil {
		return nil, err
	}
	return value.ParseJSON(data)
}

func readTarget(root string) (string, error) {
	data, err := readJSON(root, "scenario.json")
	if err != nil {
		return "", err
	}
	metadata, ok := data.(*value.OrderedMap)
	if !ok {
		return "", fmt.Errorf("scenario.json must contain an object")
	}
	rawTarget, ok := metadata.Get("target")
	if !ok {
		return "", fmt.Errorf("scenario target is missing")
	}
	target, ok := rawTarget.(string)
	if !ok || target == "" {
		return "", fmt.Errorf("scenario target is empty")
	}
	return target, nil
}

func parseDefine(input value.Value) (DefineRegistry, error) {
	entries, ok := input.(*value.OrderedMap)
	if !ok {
		return nil, fmt.Errorf("define.json must contain an object")
	}
	defines := value.NewOrderedMap()
	for _, id := range entries.Keys() {
		raw, ok := entries.Get(id)
		if !ok {
			return nil, fmt.Errorf("define %s is missing", id)
		}
		if path, ok := raw.(string); ok {
			defines.Set(id, DefineEntry{Template: &path})
			continue
		}
		fields, ok := raw.(*value.OrderedMap)
		if !ok {
			return nil, fmt.Errorf("define %s must be an object", id)
		}
		entry := DefineEntry{}
		for _, key := range fields.Keys() {
			if key != "template" && key != "data" && key != "html" {
				return nil, fmt.Errorf("define %s has an unknown field", id)
			}
		}
		if rawTemplate, ok := fields.Get("template"); ok {
			path, ok := rawTemplate.(string)
			if !ok {
				return nil, fmt.Errorf("define %s.template must be a string", id)
			}
			entry.Template = &path
		}
		if rawHTML, ok := fields.Get("html"); ok {
			html, ok := rawHTML.(string)
			if !ok {
				return nil, fmt.Errorf("define %s.html must be a string", id)
			}
			entry.HTML = &html
		}
		if data, ok := fields.Get("data"); ok {
			ordered, ok := data.(*value.OrderedMap)
			if !ok {
				return nil, fmt.Errorf("define %s.data must be an object", id)
			}
			entry.Data = ordered
		}
		if (entry.Template == nil) == (entry.HTML == nil) {
			return nil, fmt.Errorf("define %s needs exactly one of template or html", id)
		}
		if entry.Template == nil && entry.Data != nil {
			return nil, fmt.Errorf("define %s.html cannot have data", id)
		}
		defines.Set(id, entry)
	}
	return defines, nil
}

func parseEnvironment(input value.Value) (*Environment, error) {
	fields, ok := input.(*value.OrderedMap)
	if !ok {
		return nil, fmt.Errorf("env.json must contain an object")
	}
	env := &Environment{}
	for _, key := range fields.Keys() {
		if key != "timezone" && key != "now" {
			return nil, fmt.Errorf("env.json has an unknown field: %s", key)
		}
	}
	if timezone, ok := fields.Get("timezone"); ok {
		value, ok := timezone.(string)
		if !ok {
			return nil, fmt.Errorf("env.timezone must be a string")
		}
		env.Timezone = &value
	}
	if now, ok := fields.Get("now"); ok {
		value, ok := now.(float64)
		if !ok {
			return nil, fmt.Errorf("env.now must be a number")
		}
		env.Now = &value
	}
	return env, nil
}

func (a *Adapter) LoadScenario() (Scenario, error) {
	target, err := readTarget(a.root)
	if err != nil {
		return Scenario{}, err
	}
	assignValue, err := readJSON(a.root, "data.json")
	if err != nil {
		return Scenario{}, err
	}
	assign, ok := assignValue.(JsonObject)
	if !ok {
		return Scenario{}, fmt.Errorf("data.json must contain an object")
	}
	defineValue, err := readJSON(a.root, "define.json")
	if err != nil {
		return Scenario{}, err
	}
	define, err := parseDefine(defineValue)
	if err != nil {
		return Scenario{}, err
	}
	scenario := Scenario{Target: target, Assign: assign, Define: define}
	if _, err := os.Stat(filepath.Join(a.root, "env.json")); err == nil {
		envValue, err := readJSON(a.root, "env.json")
		if err != nil {
			return Scenario{}, err
		}
		scenario.Env, err = parseEnvironment(envValue)
		if err != nil {
			return Scenario{}, err
		}
	}
	return scenario, nil
}

func (a *Adapter) BuildRequest(scenario Scenario) (RenderRequest, error) {
	if scenario.Target == "" {
		return RenderRequest{}, fmt.Errorf("scenario target is empty")
	}
	return RenderRequest{
		Target: scenario.Target,
		Assign: scenario.Assign,
		Define: scenario.Define,
		Env:    scenario.Env,
	}, nil
}

func nativeDefines(defines DefineRegistry) map[string]template.DefineInput {
	result := make(map[string]template.DefineInput, defines.Len())
	for _, id := range defines.Keys() {
		entry := defines.MustGet(id).(DefineEntry)
		input := template.DefineInput{HTML: entry.HTML}
		if entry.Template != nil {
			input.Template = *entry.Template
		}
		if entry.Data != nil {
			input.Data = entry.Data
		}
		result[id] = input
	}
	return result
}

func (a *Adapter) Render(request RenderRequest) (string, error) {
	prepared, err := a.Prepare(request)
	if err != nil {
		return "", err
	}
	return prepared.Render()
}

func (a *Adapter) Prepare(request RenderRequest) (template.Prepared, error) {
	options := template.RenderOptions{Define: nativeDefines(request.Define)}
	if request.Env != nil {
		env := template.Env{Timezone: "Z", Now: float64(time.Now().Unix())}
		if request.Env.Timezone != nil {
			env.Timezone = *request.Env.Timezone
		}
		if request.Env.Now != nil {
			env.Now = *request.Env.Now
		}
		options.Env = &env
	}
	return a.engine.Prepare(request.Target, request.Assign, options)
}

func (a *Adapter) RenderTwice(request RenderRequest) (RepeatResult, error) {
	first, err := a.Render(request)
	if err != nil {
		return RepeatResult{}, err
	}
	second, err := a.Render(request)
	if err != nil {
		return RepeatResult{}, err
	}
	return RepeatResult{First: first, Second: second}, nil
}

type orderedJSON struct {
	value any
}

func (item orderedJSON) MarshalJSON() ([]byte, error) {
	return marshalOrdered(item.value)
}

func marshalOrdered(input any) ([]byte, error) {
	switch item := input.(type) {
	case *value.OrderedMap:
		encoded := []byte{'{'}
		for index, key := range item.Keys() {
			if index > 0 {
				encoded = append(encoded, ',')
			}
			encodedKey, err := json.Marshal(key)
			if err != nil {
				return nil, err
			}
			encodedValue, err := marshalOrdered(item.MustGet(key))
			if err != nil {
				return nil, err
			}
			encoded = append(encoded, encodedKey...)
			encoded = append(encoded, ':')
			encoded = append(encoded, encodedValue...)
		}
		return append(encoded, '}'), nil
	case DefineEntry:
		if item.Template != nil && item.Data == nil && item.HTML == nil {
			return json.Marshal(*item.Template)
		}
		entry := value.NewOrderedMap()
		if item.Template != nil {
			entry.Set("template", *item.Template)
			if item.Data != nil {
				entry.Set("data", item.Data)
			}
		} else if item.HTML != nil {
			entry.Set("html", *item.HTML)
		}
		return marshalOrdered(entry)
	case value.List:
		encoded := []byte{'['}
		for index, value := range item {
			if index > 0 {
				encoded = append(encoded, ',')
			}
			encodedValue, err := marshalOrdered(value)
			if err != nil {
				return nil, err
			}
			encoded = append(encoded, encodedValue...)
		}
		return append(encoded, ']'), nil
	default:
		return json.Marshal(input)
	}
}

type requestOutput struct {
	Target string       `json:"target"`
	Assign orderedJSON  `json:"assign"`
	Define orderedJSON  `json:"define"`
	Env    *orderedJSON `json:"env,omitempty"`
}

func requestJSON(request RenderRequest) requestOutput {
	result := requestOutput{Target: request.Target, Assign: orderedJSON{request.Assign}, Define: orderedJSON{request.Define}}
	if request.Env != nil {
		env := value.NewOrderedMap()
		if request.Env.Timezone != nil {
			env.Set("timezone", *request.Env.Timezone)
		}
		if request.Env.Now != nil {
			env.Set("now", *request.Env.Now)
		}
		result.Env = &orderedJSON{env}
	}
	return result
}

func main() {
	if len(os.Args) != 2 {
		panic("usage: showcase-adapter-go SCENARIO_DIR")
	}
	adapter, err := NewAdapter(os.Args[1])
	if err != nil {
		panic(err)
	}
	scenario, err := adapter.LoadScenario()
	if err != nil {
		panic(err)
	}
	request, err := adapter.BuildRequest(scenario)
	if err != nil {
		panic(err)
	}
	if rawIterations := os.Getenv("SHOWCASE_BENCH_ITERATIONS"); rawIterations != "" {
		iterations, err := strconv.Atoi(rawIterations)
		if err != nil || iterations <= 0 {
			panic("SHOWCASE_BENCH_ITERATIONS must be a positive integer")
		}
		warmup := 0
		if rawWarmup := os.Getenv("SHOWCASE_BENCH_WARMUP"); rawWarmup != "" {
			warmup, err = strconv.Atoi(rawWarmup)
			if err != nil || warmup < 0 {
				panic("SHOWCASE_BENCH_WARMUP must be a non-negative integer")
			}
		}
		for index := 0; index < warmup; index++ {
			if _, err := adapter.Render(request); err != nil {
				panic(err)
			}
		}
		var measured string
		started := time.Now()
		for index := 0; index < iterations; index++ {
			measured, err = adapter.Render(request)
			if err != nil {
				panic(err)
			}
		}
		renderSeconds := time.Since(started).Seconds()
		repeated, err := adapter.Render(request)
		if err != nil {
			panic(err)
		}
		measuredHash := sha256.Sum256([]byte(measured))
		repeatedHash := sha256.Sum256([]byte(repeated))
		prepared, err := adapter.Prepare(request)
		if err != nil {
			panic(err)
		}
		var preparedOutput string
		preparedStarted := time.Now()
		for index := 0; index < iterations; index++ {
			preparedOutput, err = prepared.Render()
			if err != nil {
				panic(err)
			}
		}
		preparedSeconds := time.Since(preparedStarted).Seconds()
		preparedHash := sha256.Sum256([]byte(preparedOutput))
		encoded, err := json.Marshal(map[string]any{
			"language": "go", "iterations": iterations, "renderSeconds": renderSeconds, "preparedRenderSeconds": preparedSeconds,
			"bytes": len([]byte(measured)), "outputSha256": hex.EncodeToString(measuredHash[:]),
			"repeatSha256": hex.EncodeToString(repeatedHash[:]), "preparedSha256": hex.EncodeToString(preparedHash[:]),
		})
		if err != nil {
			panic(err)
		}
		fmt.Println(string(encoded))
		return
	}
	repeated, err := adapter.RenderTwice(request)
	if err != nil {
		panic(err)
	}
	invalid := request
	invalid.Target = "__contract_missing_target__"
	beforeFailure, err := json.Marshal(requestJSON(request))
	if err != nil {
		panic(err)
	}
	failureObserved := false
	if _, err := adapter.Render(invalid); err != nil {
		failureObserved = true
	}
	afterFailure, err := json.Marshal(requestJSON(request))
	if err != nil {
		panic(err)
	}
	recovered, err := adapter.Render(request)
	if err != nil {
		panic(err)
	}
	first := sha256.Sum256([]byte(repeated.First))
	second := sha256.Sum256([]byte(repeated.Second))
	recoveredHash := sha256.Sum256([]byte(recovered))
	output := map[string]any{
		"language":         "go",
		"type":             "Adapter",
		"operations":       []string{"loadScenario", "buildRequest", "render", "renderTwice"},
		"request":          requestJSON(request),
		"bytes":            len([]byte(repeated.First)),
		"firstSha256":      hex.EncodeToString(first[:]),
		"secondSha256":     hex.EncodeToString(second[:]),
		"failureObserved":  failureObserved,
		"requestUnchanged": string(beforeFailure) == string(afterFailure),
		"recoveredSha256":  hex.EncodeToString(recoveredHash[:]),
	}
	encoded, err := json.Marshal(output)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(encoded))
}
