# 예제 사이트

[English](showcase.md).

[예제 사이트](../../examples/site/index.html)는 TypeScript, Go, Rust와 PHP로 커밋된 AST artifact를 사용해 공통 템플릿을 렌더한다. 각 구현은 artifact를 로드하고 변수를 `assign`으로 전달하고 레이아웃과 구성 요소를 `define`으로 등록한 뒤 `layout`을 렌더한다. 화면의 복잡성은 템플릿과 목업 데이터에 둔다. 애플리케이션 컨트롤러, 인증, DI, 폼 생성은 이 예제의 범위 밖이다.

## 공통 입력

`examples/site/scenarios/` 아래 각 디렉터리는 다음 입력을 가진다. 언어 중립적인 형태와 어댑터 규칙은 [언어 간 렌더 계약](../spec/runtime.ko.md#언어-간-렌더-계약)에 고정되어 있다.

| 입력 | 용도 |
| --- | --- |
| `*.tpl` | 공통 레이아웃, 파셜, 조건, 반복문, scope 인자 |
| `data.json` | `assign`으로 전달하는 목업 값 |
| `define.json` | `define`으로 전달하는 식별자와 템플릿 경로의 직접 대응 |
| `env.json` (선택) | 재현 가능한 출력을 위한 고정 시각과 시간대 |
| `compiled/<language>/` | 빌드 시 생성한 AST artifact와 원본·artifact 해시 |

예를 들어 포털 시나리오는 두 템플릿을 등록한다.

```json
{
  "layout": "layout.tpl",
  "contents": "content.tpl"
}
```

## 계약 게이트

어댑터 구조는 [interface.json](../../tools/showcase/adapters/interface.json)에서 설계한다. 이 파일이 `tools/showcase/adapters/generated/` 아래의 선언부와 Mermaid 파일의 원본이며, 언어별 어댑터는 매핑된 타입과 연산 이름을 구현한다. 생성기와 검사기는 저장소의 영구 도구이므로 선언이나 도표가 manifest에서 조용히 벗어날 수 없다.

게이트를 직접 실행하려면 다음 명령을 사용한다.

```sh
make contract-generate
make contract-check
```

`contract-check`는 TypeScript·Go·Rust 선언을 컴파일하고, PHP를 `ReflectionClass`로 검사하고, JavaScript assertion helper를 검사하고, 다섯 시나리오에서 다섯 어댑터를 실행한다. 각 실행에서 요청 형태, UTF-8 출력 해시, 반복 렌더, 잘못된 target 오류와 복구를 검사한다. manifest는 `core-runtime`, `source-compiler`, `artifact-runtime`도 선언하며 같은 지원 레벨의 구현은 같은 논리 연산을 제공해야 한다. `make showcase`는 이 게이트 전에 artifact를 생성하고 `make showcase-check`는 커밋된 artifact만 로드한다.

같은 파일을 각 구현의 기존 CLI에 전달한다. 실행 파일만 다르고, 모든 시나리오는 `--data data.json --define define.json`과 함께 `layout` target을 렌더한다. showcase adapter는 언어별 artifact loader를 사용하고 일반 CLI는 개발용 source 경로로 유지한다. `SHOWCASE_EXECUTION_MODE=generated`를 지정하면 생성 모드를 실행한다. 빌드 단계에서 모든 showcase 시나리오의 정규 템플릿을 담은 호스트 언어 소스 모듈을 만들며, 계약 검사는 두 모드에서 모든 시나리오를 실행해 출력 바이트·반복 렌더·잘못된 target 뒤의 복구를 비교한다. runtime 렌더 호출은 다음과 같다.

```js
engine.render('layout', assign, { define });
```

## 네 언어에서 같은 요청

다음 네 API 예제는 같은 시나리오 디렉터리를 읽는다. 언어마다 다른 비즈니스 객체를 만들지 않는다. 모든 어댑터에서 `data.json`은 assign object이고 `define.json`은 같은 식별자·경로 레지스트리다. 개별 define 데이터나 완성된 HTML이 필요할 때만 객체를 사용한다. 레이아웃, 중첩 템플릿 define, define 데이터를 포함한 `scope-precedence` 시나리오를 사용한다.

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

## 결과물 생성

```sh
make showcase SHOWCASE_ITERS=3000 SHOWCASE_WARMUP=300
```

이 명령은 각 시나리오의 언어별 AST artifact, `expected.html`, 사이트의 공통 입력인 `examples/site/data/scenarios.json`, 비교 결과인 `examples/site/data/results.json`, 측정값인 `examples/site/data/benchmark.json`을 쓴다. 각 artifact loader를 두 번 렌더하며 TypeScript API도 같은 엔진 인스턴스로 두 번 렌더한다. 네 구현은 애플리케이션 필터 없이 동일한 원시 UTF-8 바이트를 출력해야 한다.

벤치마크 드라이버는 워밍업과 측정에 같은 엔진 인스턴스를 사용한 뒤 한 번 더 렌더하고 해시를 비교한다. 구현·시나리오마다 독립 측정 5회를 기록한다. 사이트는 중앙 처리량과 표본별 평균 렌더 시간의 P95를 표시한다. 파싱과 캐시 구성이 끝난 뒤의 렌더 측정이며 개별 요청 지연 시간 측정은 아니다. 절대 시간은 기계와 툴체인에 따라 달라지므로 한 실행 안의 측정값을 비교한다.

## 결과물 검증

```sh
make showcase-check
```

이 명령은 커밋된 HTML·JSON·AST artifact를 새 artifact-only 렌더 결과와 비교하고 HTML 구조 parser로 페이지를 검사한다. 페이지에는 목업 assign 데이터, define 레지스트리, 템플릿, artifact와 HTML 출력이 표시된다. runtime parser, renderer와 브라우저 검증 단계는 실행하지 않는다.

타입 고정 생성기는 `make typed-generator`로 실행한다. 전체 compiled source graph manifest와 명시적 타입 manifest를 읽는다. 언어 backend를 실행하기 전에 공통 compiler IR이 모든 템플릿을 검증하고 include와 block 경로를 해석하며 root 변수, template input, local, loop item, record member, 함수 호출의 타입을 결정한다. include 대상은 필요한 값을 선언하고 compiler는 각 값을 호출자 scope에서 결합한다. 따라서 include에서만 전달되는 값을 root assign 필드인 것처럼 가장하지 않는다. 각 definition은 generated template target과 HTML 허용 여부도 선언한다. compiler는 대상 template이 선언하지 않은 block scope 필드를 거부한다. 그 뒤 graph의 템플릿마다 정적 함수 하나와 닫힌 template dispatch를 생성하고, manifest에서 도출한 assign·definition·template input·record 선언을 PHP·Go·Rust·TypeScript 소스에 넣는다. 생성된 block은 타입이 고정된 definition registry를 받아 자식 함수를 직접 호출하며, 호출자가 문자열 slot을 미리 렌더하지 않는다. Definition data record는 필드 전달 여부를 보존한다. 입력 우선순위는 root assign, 전달된 definition data 필드, 명시적인 block scope 순서다. nullable 필드는 각각 `?T`, `*T`, `Option<T>`, 선택 속성으로 변환하고 list와 삽입 순서 map은 원소 타입을 재귀적으로 유지한다. `make compiler-ir-check`는 canonical node와 expression의 모든 종류 및 선언되지 않은 symbol 거부를 검사한다. `make typed-generator-check`는 산출물 재현성을 확인한다. `make typed-generator-compile-check`는 네 언어로 생성한 React, `compiler-coverage`, `scope-precedence` graph를 모두 컴파일·실행하고 출력 바이트가 같은지 검사한다. 임의의 JSON만으로는 정적 타입을 안전하게 추론할 수 없으므로 manifest가 필요하다.

showcase의 generated 실행도 AST 실행과 같은 public Engine API로 진입한다. 각 adapter는 생성 산출물과 함께 `compile.mode = gen`을 설정한 뒤 `Engine.render`를 호출한다. 생성 callback은 `Engine.prepare`가 만든 정규화된 `GeneratedRequest`를 받는다. 계약 검사기는 adapter가 `render` 안에서 분기하여 생성 소스를 직접 호출하면 실패한다.

generated 모드에서는 호스트 언어 산출물 자체가 실행 가능한 template graph이므로 빈 loader를 전달한다. 사용하지 않는 AST graph를 loader 입력으로 함께 패키징하지 않는다. compiled AST artifact는 AST 모드에서만 읽는다.

`compiler-coverage` 시나리오는 텍스트만 다루는 제한된 generated backend가 검사를 통과하지 못하게 한다. 한 페이지에서 assignment, list·map spread, member·index 접근, 함수·단항·이항·삼항 식, 조건문, 반복문과 모든 loop metadata, local scope를 공유하는 include, if-block, definition data와 block scope를 실행한다. 계약 검사는 이 페이지를 모든 runtime의 AST와 generated 모드로 실행하고 반복 렌더와 실패 복구 뒤에도 같은 UTF-8 226바이트인지 확인한다.

소비 애플리케이션 통합은 [실행 체크리스트](../plans/execution-checklist.ko.md)의 Wave 7에서 별도로 추적한다.
