package template_test

import (
	"sync"
	"testing"

	template "github.com/polyspec/template/packages/template-go"
)

// Concurrent renders may share one program after its functions are registered (RT-62a, T16.1):
// the template cache of the program is the only state that renders share and write.
func TestConcurrentRendersShareOneProgram(t *testing.T) {
	loader := template.NewMapLoader(map[string]string{
		"page.tpl": "<p>{= title}</p>{+ /part.tpl}",
		"part.tpl": "<i>{= count}</i>",
	})
	program, err := template.NewAstProgram(template.Options{Loader: loader})
	if err != nil {
		t.Fatal(err)
	}
	var group sync.WaitGroup
	failures := make(chan string, 64)
	for worker := 0; worker < 8; worker++ {
		group.Add(1)
		go func() {
			defer group.Done()
			for round := 0; round < 50; round++ {
				out, err := program.Render("page.tpl", map[string]any{"title": "T", "count": 2.0}, template.RenderOptions{})
				if err != nil || out != "<p>T</p><i>2</i>" {
					failures <- out
					return
				}
			}
		}()
	}
	group.Wait()
	close(failures)
	for out := range failures {
		t.Fatalf("a concurrent render of one program = %q", out)
	}
}
