# Example site

[한국어](showcase.ko.md).

The [example site](../../examples/site/index.html) renders shared templates with mock data through TypeScript, Go, Rust and PHP. Each implementation loads the committed AST artifacts, passes variables as `assign`, registers the layout and its parts with `define`, and renders `layout`. Page complexity belongs in templates and mock data. Application controllers, authentication, DI and form generation are outside this example.

## Shared inputs

Each directory under `examples/site/scenarios/` contains these inputs. The language-neutral shapes and adapter rules are fixed in the [cross-language render contract](../spec/runtime.md#cross-language-render-contract).

| Input | Purpose |
| --- | --- |
| `*.tpl` | Shared layout, partials, conditions, loops and scope arguments |
| `data.json` | Mock values passed as `assign` |
| `define.json` | Direct identifier-to-template-path registrations passed as `define` |
| `env.json` (optional) | Fixed clock and timezone for reproducible output |
| `compiled/<language>/` | Build-time AST artifacts and source/artifact hashes used by the runtime |

For example, the portal scenario registers two templates:

```json
{
  "layout": "layout.tpl",
  "contents": "content.tpl"
}
```

## Contract gate

The adapter structures are designed in [interface.json](../../tools/showcase/adapters/interface.json). It is the source for the generated declarations and Mermaid files under `tools/showcase/adapters/generated/`, while the language adapters implement the mapped type and operation names. The generator and checker are permanent repository tools, so a declaration or diagram can never drift silently from the manifest.

Run the gate directly with:

```sh
make contract-generate
make contract-check
```

`contract-check` compiles the TypeScript, Go and Rust declarations, checks PHP with `ReflectionClass`, checks the JavaScript assertion helpers and runs all five adapters on all five scenarios. Each run checks the request shape, UTF-8 output hash, repeated render, invalid-target failure and recovery. The manifest also declares `core-runtime`, `source-compiler` and `artifact-runtime`; implementations with the same support level must provide the same logical operations. `make showcase` generates the artifacts before this gate; `make showcase-check` loads only committed artifacts.

The same files go to each implementation's existing CLI. Only the executable differs; every scenario renders the `layout` target with `--data data.json --define define.json`. The showcase adapter uses the language-specific artifact loader, while the normal CLI remains the source-mode development entry point. The runtime render call is:

```js
engine.render('layout', assign, { define });
```

Set `SHOWCASE_EXECUTION_MODE=generated` to run generated mode. The build step creates one host-language source module containing the canonical templates for all showcase scenarios. The contract checker runs every scenario in both modes and compares output bytes, repeated renders and recovery after an invalid target.

## The same request in four languages

The four API examples below read the same scenario directory. They do not construct different business objects in each language: `data.json` is the assign object and `define.json` is the same identifier-to-path registry for every adapter. A definition object is reserved for per-definition data or finished HTML. The `scope-precedence` scenario is used because it contains a layout, a nested template definition and definition data.

### TypeScript

```ts
import { readFileSync } from 'node:fs';
import { Engine } from '@polyspec/template';
import { FsLoader } from '@polyspec/template/node';

const root = 'examples/site/scenarios/scope-precedence';
const readJson = (name: string) => JSON.parse(readFileSync(`${root}/${name}`, 'utf8'));
const engine = new Engine({ loader: new FsLoader(root) });
const assign = readJson('data.json');
const define = readJson('define.json');
const html = engine.render('layout', assign, { define });
console.log(html);
```

### JavaScript

```js
import { readFileSync } from 'node:fs';
import { Engine } from '@polyspec/template';
import { FsLoader } from '@polyspec/template/node';

const root = 'examples/site/scenarios/scope-precedence';
const readJson = name => JSON.parse(readFileSync(`${root}/${name}`, 'utf8'));
const engine = new Engine({ loader: new FsLoader(root) });
const assign = readJson('data.json');
const define = readJson('define.json');
const html = engine.render('layout', assign, { define });
console.log(html);
```

### Go

```go
package main

import (
	"encoding/json"
	"fmt"
	"os"

	template "github.com/polyspec/template"
)

func read(path string) []byte {
	data, err := os.ReadFile(path)
	if err != nil {
		panic(err)
	}
	return data
}

func main() {
	root := "examples/site/scenarios/scope-precedence"
	engine, err := template.NewEngine(template.Options{Loader: template.NewFSLoader(os.DirFS(root))})
	if err != nil {
		panic(err)
	}

	var assign map[string]any
	if err := json.Unmarshal(read(root+"/data.json"), &assign); err != nil {
		panic(err)
	}
	var define map[string]template.DefineInput
	if err := json.Unmarshal(read(root+"/define.json"), &define); err != nil {
		panic(err)
	}
	html, err := engine.Render("layout", assign, template.RenderOptions{
		Define: define,
	})
	if err != nil {
		panic(err)
	}
	fmt.Print(html)
}
```

### Rust

```rust
use polyspec_template::{defines_from_json, Engine, EngineOptions, FsLoader, RenderOptions, RenderTarget};

fn render() -> Result<String, Box<dyn std::error::Error>> {
    let root = "examples/site/scenarios/scope-precedence";
    let assign: serde_json::Value = serde_json::from_slice(&std::fs::read(format!("{root}/data.json"))?)?;
    let define_json: serde_json::Value = serde_json::from_slice(&std::fs::read(format!("{root}/define.json"))?)?;
    let engine = Engine::new(EngineOptions {
        loader: Some(Box::new(FsLoader::new(root))),
        ..Default::default()
    });

    let options = RenderOptions {
        define: defines_from_json(&define_json)?,
        ..Default::default()
    };
    engine.render(RenderTarget::Name("layout"), &assign, &options)
}
```

## Build the artifact

```sh
make showcase SHOWCASE_ITERS=3000 SHOWCASE_WARMUP=300
```

This writes each scenario's committed per-language AST artifacts, `expected.html`, the site's shared inputs in `examples/site/data/scenarios.json`, the comparison results in `examples/site/data/results.json`, and measurements in `examples/site/data/benchmark.json`. Each artifact loader renders twice; the TypeScript API also renders twice through one engine instance. All four implementations must produce the same raw UTF-8 bytes without application filters.

The benchmark drivers keep one engine instance for warmup and measurement, then render once more and compare its hash. Five independent samples are recorded per implementation and scenario. The site reports median throughput and the P95 of the sample mean render times. These are warm renders after parsing and cache population, not individual request latency measurements. Absolute times depend on the machine and toolchain; compare measurements within one run.

## Verify the artifact

```sh
make showcase-check
```

This compares the committed HTML, JSON and AST artifacts with fresh artifact-only renders, then validates the generated page with an HTML structure parser. The page exposes the mock assign data, define registry, templates, artifacts and HTML output. It contains no runtime parser, renderer or browser verification step.

The type-fixed generator runs with `make typed-generator`. It reads the complete compiled source-graph manifest and an explicit type manifest. Before a language backend runs, the shared compiler IR validates every template, resolves include and block paths, and types root variables, locals, loop items, record members and function calls. It then emits PHP, Go, Rust and TypeScript source with manifest-derived assign and record declarations. Nullable fields become `?T`, `*T`, `Option<T>` and optional properties respectively. `make compiler-ir-check` covers every canonical node and expression variant and verifies rejection of undeclared symbols. `make typed-generator-check` verifies reproducibility, while `make typed-generator-compile-check` feeds every generated file to its language compiler or syntax checker. A manifest is required because arbitrary JSON does not contain enough information to infer static types safely.
