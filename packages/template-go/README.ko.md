# github.com/polyspec/template

[English](README.md).

템플릿 언어의 Go 구현: 렉서, 파서, 렌더러, 내장 함수, 명령줄 인터페이스. 모듈은 표준 라이브러리 밖의 의존성이 없다.

## 설치

```sh
go get github.com/polyspec/template
```

## 렌더

```go
package main

import (
	"fmt"
	"os"

	template "github.com/polyspec/template"
	"github.com/polyspec/template/functions"
)

func main() {
	engine, err := template.NewEngine(template.Options{Loader: template.NewFSLoader(os.DirFS("templates"))})
	if err != nil {
		panic(err)
	}
	_ = engine.Register("greet", func(args []template.Value, _ functions.Context) (any, error) {
		return "Hello, " + args[0].(string), nil
	})
	assign := map[string]any{"title": "Home"}
html, err := engine.Render("layout", assign, template.RenderOptions{
	Define: map[string]template.DefineInput{"layout": {Template: "layout.tpl"}, "content": {Template: "pages/home.tpl"}},
		Env:    &template.Env{Timezone: "+09:00", Now: 1789084800},
	})
	if err != nil {
		panic(err)
	}
	fmt.Print(html)
}
```

assign 데이터는 데이터 모델의 규칙으로 바인딩된다: `nil`, `bool`, 정수와 부동소수점 타입, `string`, 슬라이스, 구조체(선언 순서의 내보낸 필드, `json` 태그로 이름 지정), `map[string]T`(바이트 순서로 정렬된 키), `*template.OrderedMap`(삽입 순서). `template.ParseJSON`은 JSON 텍스트를 문서 순서를 보존한 값으로 디코딩한다.

## 템플릿 임베드

```go
//go:embed templates
var templates embed.FS

sub, _ := fs.Sub(templates, "templates")
engine, _ := template.NewEngine(template.Options{Loader: template.NewFSLoader(sub)})
```

## API

| 심볼 | 설명 |
| --- | --- |
| `Parse(source, name, ParseOptions)` | 템플릿 하나를 AST로 파싱한다. `ParseOptions.LegacyWrappers`는 단일 중괄호 주석 래퍼를 활성화한다. |
| `NewEngine(Options)` | `Loader`, `Functions`, `Limits`, `Delimiters`, `LegacyWrappers`를 가진 엔진을 생성한다. |
| `(*Engine).Render(nameOrAST, assign, RenderOptions)` | 템플릿을 문자열로 렌더한다. `assign`은 변수를 담고 `Define`은 템플릿 또는 HTML 항목을 제공한다. |
| `(*Engine).Register(name, fn)` | 호스트 함수 `func(args []Value, ctx functions.Context) (any, error)`를 등록한다. |
| `NewMapLoader`, `NewFSLoader` | 메모리 로더와 `fs.FS` 로더. |
| `ParseJSON` | assign 데이터용 순서 보존 JSON 디코더. |
| `Error` | `Code`, `Template`, `Line`, `Col`, `Offset`, `End`, `Message`를 가진 오류. |
| `SafeString` | echo 태그가 이스케이프 없이 쓰는 문자열. |

## 명령줄

```sh
go build -o template ./cmd/template
./template parse FILE [--root DIR] [--delimiters OC] [--legacy-wrappers true]
./template render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] [--legacy-wrappers true]
```

`parse`는 AST JSON을 출력한다. `render`는 출력을 인쇄한다. 템플릿 오류는 stderr에 오류 JSON을 출력하고 상태 2로 종료한다.
소비 애플리케이션이 단일 중괄호 주석 래퍼를 사용할 때만 `LegacyWrappers` 또는 `--legacy-wrappers true`를 설정한다. 기본 파서는 명세의 이중 중괄호 래퍼를 받는다.

## 개발

```sh
gofmt -l .
go vet ./...
go test -race -count=1 ./...
```

테스트는 외부 테스트 패키지를 쓰는 `*_test.go` 파일에 있다. 저장소의 적합성 케이스와 표현식 픽스처를 인프로세스로 실행한다.
