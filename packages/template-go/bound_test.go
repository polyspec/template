package template_test

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	template "github.com/polyspec/template/packages/template-go"
	"github.com/polyspec/template/packages/template-go/errs"
	"github.com/polyspec/template/packages/template-go/functions"
	"github.com/polyspec/template/packages/template-go/value"
)

// Bound data (VAL-22, ERR-14, RT-61) with the shared fixture of tests/fixtures/bound-data/cases.json.

var boundFixtureDir = filepath.Join("..", "..", "tests", "fixtures", "bound-data")

type boundPosition struct {
	Template string `json:"template"`
	Line     int    `json:"line"`
	Col      int    `json:"col"`
}

type boundCases struct {
	Assign         json.RawMessage          `json:"assign"`
	Second         json.RawMessage          `json:"second"`
	DefinitionData json.RawMessage          `json:"definitionData"`
	Outputs        map[string]string        `json:"outputs"`
	Rejections     map[string]boundPosition `json:"rejections"`
}

func readBoundCases(t *testing.T) boundCases {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(boundFixtureDir, "cases.json"))
	if err != nil {
		t.Fatal(err)
	}
	var cases boundCases
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	return cases
}

// fixtureValue parses a fixture value with its document order (VAL-12).
func fixtureValue(t *testing.T, raw json.RawMessage) value.Value {
	t.Helper()
	parsed, err := template.ParseJSON(raw)
	if err != nil {
		t.Fatal(err)
	}
	return parsed
}

func boundProgram(t *testing.T, result any) *template.AstProgram {
	t.Helper()
	templates := map[string]string{}
	for _, name := range []string{"page.tpl", "define.tpl", "part.tpl", "empty.tpl", "result.tpl"} {
		templates[name] = readBoundFixture(t, name)
	}
	program, err := template.NewAstProgram(template.Options{Loader: template.NewMapLoader(templates)})
	if err != nil {
		t.Fatal(err)
	}
	if err := program.Register("pick", func(_ []value.Value, _ functions.Context) (any, error) { return result, nil }); err != nil {
		t.Fatal(err)
	}
	return program
}

func readBoundFixture(t *testing.T, name string) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(boundFixtureDir, name))
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func mustBind(t *testing.T, input any) template.BoundMap {
	t.Helper()
	bound, err := template.Bind(input)
	if err != nil {
		t.Fatal(err)
	}
	return bound
}

func mustRender(t *testing.T, program *template.AstProgram, target string, assign any, options template.RenderOptions) string {
	t.Helper()
	output, err := program.Render(target, assign, options)
	if err != nil {
		t.Fatal(err)
	}
	return output
}

func definitionOptions(data any) template.RenderOptions {
	return template.RenderOptions{Define: map[string]template.DefineInput{"part": {Template: "part.tpl", Data: data}}}
}

func expectBindFailure(t *testing.T, err error, code errs.Code) {
	t.Helper()
	failure := templateError(t, err)
	if failure.Code != code || failure.Template != "" || failure.Line != 0 || failure.Col != 0 || failure.Offset != 0 || failure.End != 0 {
		t.Fatalf("expected %s without a template and position (ERR-14), got %+v", code, failure)
	}
}

func TestBoundMapRendersTheBytesOfTheHostMap(t *testing.T) {
	cases := readBoundCases(t)
	program := boundProgram(t, nil)
	if output := mustRender(t, program, "page.tpl", mustBind(t, fixtureValue(t, cases.Assign)), template.RenderOptions{}); output != cases.Outputs["page"] {
		t.Fatalf("bound map: %q", output)
	}
	if output := mustRender(t, program, "page.tpl", fixtureValue(t, cases.Assign), template.RenderOptions{}); output != cases.Outputs["page"] {
		t.Fatalf("host map: %q", output)
	}
	prepared, err := program.Prepare("page.tpl", mustBind(t, fixtureValue(t, cases.Assign)), template.RenderOptions{})
	if err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if output, err := prepared.Render(); err != nil || output != cases.Outputs["page"] {
			t.Fatalf("prepared: %q %v", output, err)
		}
	}
}

func TestBoundMapKeepsTheValuesThatBindChecked(t *testing.T) {
	cases := readBoundCases(t)
	list := []any{1, 2}
	inner := map[string]any{"k": "v"}
	bound := mustBind(t, map[string]any{"a": "1", "b": "x", "list": list, "m": inner})
	list[0] = 9
	inner["k"] = "changed"
	if output := mustRender(t, boundProgram(t, nil), "page.tpl", bound, template.RenderOptions{}); output != cases.Outputs["page"] {
		t.Fatalf("output %q", output)
	}
}

func TestMergeRendersTheMergedEntries(t *testing.T) {
	cases := readBoundCases(t)
	merged := template.Merge(mustBind(t, fixtureValue(t, cases.Assign)), mustBind(t, fixtureValue(t, cases.Second)))
	if output := mustRender(t, boundProgram(t, nil), "page.tpl", merged, template.RenderOptions{}); output != cases.Outputs["merged"] {
		t.Fatalf("output %q", output)
	}
}

func TestBoundMapAsDefinitionData(t *testing.T) {
	cases := readBoundCases(t)
	program := boundProgram(t, nil)
	bound := mustBind(t, fixtureValue(t, cases.DefinitionData))
	if output := mustRender(t, program, "define.tpl", fixtureValue(t, cases.Assign), definitionOptions(bound)); output != cases.Outputs["define"] {
		t.Fatalf("bound data: %q", output)
	}
	if output := mustRender(t, program, "define.tpl", fixtureValue(t, cases.Assign), definitionOptions(fixtureValue(t, cases.DefinitionData))); output != cases.Outputs["define"] {
		t.Fatalf("host data: %q", output)
	}
}

func TestEmptyBoundMaps(t *testing.T) {
	cases := readBoundCases(t)
	program := boundProgram(t, nil)
	var none *template.BoundMap
	for name, assign := range map[string]any{"nil": mustBind(t, nil), "nil pointer": mustBind(t, none), "zero value": template.BoundMap{}, "nil pointer assign": none} {
		if output := mustRender(t, program, "empty.tpl", assign, template.RenderOptions{}); output != cases.Outputs["empty"] {
			t.Fatalf("%s: %q", name, output)
		}
	}
}

func TestBoundMapRejectedPositions(t *testing.T) {
	cases := readBoundCases(t)
	bound := mustBind(t, map[string]any{"k": "v"})
	rejected := map[string]func() error{
		"list": func() error {
			_, err := boundProgram(t, nil).Render("page.tpl", map[string]any{"items": []any{bound}}, template.RenderOptions{})
			return err
		},
		"map": func() error {
			_, err := boundProgram(t, nil).Render("page.tpl", map[string]any{"inner": map[string]any{"k": bound}}, template.RenderOptions{})
			return err
		},
		"bind": func() error {
			_, err := template.Bind(map[string]any{"k": bound})
			return err
		},
		"definitionData": func() error {
			_, err := boundProgram(t, nil).Render("define.tpl", fixtureValue(t, cases.Assign), definitionOptions(map[string]any{"k": bound}))
			return err
		},
		"result": func() error {
			_, err := boundProgram(t, bound).Render("result.tpl", nil, template.RenderOptions{})
			return err
		},
	}
	for name, position := range cases.Rejections {
		failure := templateError(t, rejected[name]())
		if failure.Code != errs.DataUnsupportedType || failure.Template != position.Template || failure.Line != position.Line || failure.Col != position.Col {
			t.Fatalf("%s: %+v", name, failure)
		}
	}
}

func TestPointerToBoundMapFailsAtEveryPosition(t *testing.T) {
	bound := mustBind(t, map[string]any{"k": "v"})
	program := boundProgram(t, nil)
	if _, err := program.Render("page.tpl", &bound, template.RenderOptions{}); templateError(t, err).Code != errs.DataUnsupportedType {
		t.Fatalf("assign: %v", err)
	}
	if _, err := program.Render("define.tpl", nil, definitionOptions(&bound)); templateError(t, err).Code != errs.DataUnsupportedType {
		t.Fatalf("definition data: %v", err)
	}
	_, err := template.Bind(&bound)
	expectBindFailure(t, err, errs.DataUnsupportedType)
	_, err = template.Bind(map[string]any{"k": &bound})
	expectBindFailure(t, err, errs.DataUnsupportedType)
}

func TestBindErrors(t *testing.T) {
	for _, input := range []any{5, []any{1}, `{"a":1}`} {
		_, err := template.Bind(input)
		expectBindFailure(t, err, errs.DataUnsupportedType)
	}
	_, err := template.Bind(map[string]any{"n": math.NaN()})
	expectBindFailure(t, err, errs.DataNumberNotFinite)
	_, err = template.Bind(map[string]any{"n": int64(1) << 53})
	expectBindFailure(t, err, errs.DataNumberRange)
	_, err = template.Bind(map[string]any{"s": "\xff"})
	expectBindFailure(t, err, errs.DataInvalidUTF8)
	var deep any = 1
	for range 65 {
		deep = []any{deep}
	}
	_, err = template.Bind(map[string]any{"deep": deep})
	expectBindFailure(t, err, errs.DataDepth)
}

func TestConcurrentRendersReadOneBoundMap(t *testing.T) {
	cases := readBoundCases(t)
	bound := mustBind(t, fixtureValue(t, cases.Assign))
	// The goroutines share one program and one bound map (RT-62a, VAL-22).
	program := boundProgram(t, nil)
	var wait sync.WaitGroup
	failures := make(chan string, 8)
	for range 8 {
		wait.Go(func() {
			output, err := program.Render("page.tpl", bound, template.RenderOptions{})
			if err != nil || output != cases.Outputs["page"] {
				failures <- strings.TrimSpace(output)
			}
		})
	}
	wait.Wait()
	close(failures)
	for failure := range failures {
		t.Fatalf("concurrent render: %q", failure)
	}
}
