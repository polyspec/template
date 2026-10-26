<!-- doc-id: packages-template-go-readme -->
<!-- source-sha256: bf45f461f19898210d20c27c6335ab71db2975f4e11a088c8c8aa8b14de21a99 -->
# github.com/polyspec/template/packages/go

[English](README.md).

템플릿 언어의 Go 구현: 렉서, 파서, 렌더러, 내장 함수, 명령줄 인터페이스. 표준 라이브러리 밖의 의존성은 `github.com/santhosh-tekuri/jsonschema/v6`와 `golang.org/x/text`이며, `ast.DecodeTemplate`은 이것으로 AST JSON을 AST 스키마에 대해 검증한다.

## 설치

```sh
go get github.com/polyspec/template/packages/go
```

## 렌더

```go
package main

import (
  "fmt"
  "os"

  template "github.com/polyspec/template/packages/go"
)

func main() {
  program, err := template.NewAstProgram(template.Options{Loader: template.NewFSLoader(os.DirFS("templates"))})
  if err != nil {
    panic(err)
  }
  _ = program.Register("greet", func(args []template.Value, _ template.FunctionContext) (any, error) {
    return "Hello, " + args[0].(string), nil
  })
  engine := template.NewEngine(program)
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
program, _ := template.NewAstProgram(template.Options{Loader: template.NewFSLoader(sub)})
engine := template.NewEngine(program)
```

## API

| 심볼 | 설명 |
| --- | --- |
| `Parse(source, name, ParseOptions)` | 템플릿 하나를 AST로 파싱한다. `ParseOptions.Delimiters`는 구분자 쌍을 선택한다. |
| `ast.DecodeTemplate(json)` | AST JSON 텍스트를 패키지가 embed한 `contracts/schema/ast.schema.json`으로 검증해 `Parse`가 반환하는 AST로 읽는다. 스키마가 거부한 JSON은 `Path`가 잘못된 노드의 JSON Pointer인 `*ast.DecodeError`로 실패한다(AST-10). |
| `Analyze(source, name, ParseOptions)` | 템플릿을 한 번 파싱해 AST, 받아들인 `Tags`(종류, 범위, 본문 범위)와 그 EDT-8 `Tokens`를 돌려준다. 오프셋은 앞의 바이트 순서 표시를 뺀 UTF-8 바이트 오프셋이다. |
| `AnalyzePrefix(source, name, ParseOptions)` | 받아들인 `Tags`·`Tokens`와 첫 파서 오류를 `PrefixAnalysis.Error`로 반환한다. 잘못된 소스 바이트나 옵션은 연산 오류를 반환한다. |
| `Format(source, FormatOptions)` | 태그 안의 공백과 줄 들여쓰기를 정리한다. `FormatOptions`에는 `Name`, `Delimiters`, `Range`, `Indent`(공백 묶음 또는 탭 하나, 기본은 공백 두 개), `KeepIndentation`, `TemplateBlocks`(`indent` 또는 `flat`)가 있다. 정리한 텍스트가 같은 AST로 파싱될 때만 결과를 돌려주고, 아니면 `Reason`이 `parse`, `invariant`, `html`인 `*FormatError`를 돌려준다. |
| `NewAstProgram(Options)` | `Loader`, `Functions`, `Limits`, `Delimiters`를 가진 AST program을 생성한다. |
| `NewEngine(Program)` | AST 또는 generated program 하나에 위임하는 engine을 생성한다. |
| `(*Engine).Render(nameOrAST, assign, RenderOptions)` | 템플릿을 문자열로 렌더한다. `assign`은 변수를 담고 `Define`은 템플릿 또는 HTML 항목을 제공한다. |
| `Bind(value)`, `Merge(first, second)` | `Bind`는 데이터를 한 번 검사하고 `BoundMap`을 반환한다. zero value는 빈 bound map이다. `Merge`는 두 bound map을 합치며, `second`의 항목이 같은 key를 가진 `first`의 항목을 바꾼다. `Render`와 `Prepare`는 `BoundMap`을 `assign`과 정의 `Data`로 받고 다시 binding하지 않는다. 다른 위치와 pointer로는 `E_DATA_UNSUPPORTED_TYPE`으로 실패한다(VAL-22). 동시에 실행되는 render가 하나의 bound map을 읽을 수 있다. 오류에는 template과 위치가 없다(ERR-14). |
| `(*render.Engine).Register(name, fn)` | AST program에 호스트 함수를 등록한다. 인자는 VAL-21 형태다. safe 문자열은 `string`, list는 새 `value.List`, map은 새 `*value.OrderedMap`, native object는 원본 값이다. |
| `NewMapLoader`, `NewFSLoader` | 메모리 로더와 `fs.FS` 로더. `Loader.Load(name)`은 `(LoadResult, ok, error)`를 반환한다. nil이 아닌 오류는 렌더를 `E_LOAD_FAILED`로 실패시키며, `fs.FS` 로더는 읽을 수 없는 일반 파일에 대해 오류를 반환한다. |
| `ParseJSON` | assign 데이터용 순서 보존 JSON 디코더. 하나의 JSON 문서가 아닌 텍스트는 `E_DATA_INVALID_JSON`이다. |
| `Error` | `Code`, `Template`, `Line`, `Col`, `Offset`, `End`, `Message`를 가진 오류. |
| `SafeString` | echo 태그가 이스케이프 없이 쓰는 문자열. |

## 명령줄

```sh
go build -o template ./cmd/template
./template parse [--root DIR] [--delimiters OC] FILE
./template tokens [--root DIR] [--delimiters OC] FILE
./template format [--indent none|tab|N] [--delimiters OC] FILE
./template render [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] FILE
```

`parse`는 AST JSON을 출력한다. `tokens`는 토큰을 `[start, end, type]` 세 값 배열로 출력한다. `format`은 정리한 텍스트를 출력하고, 정리 오류는 stderr에 `{"reason","code","line","col","message"}`를 출력하고 상태 2로 종료한다. `render`는 출력을 인쇄한다. 템플릿 오류는 stderr에 오류 JSON을 출력하고 상태 2로 종료한다.
## 개발

```sh
gofmt -l .
go vet ./...
go test -race -count=1 ./...
```

테스트는 외부 테스트 패키지를 쓰는 `*_test.go` 파일에 있다. 저장소의 적합성 케이스와 표현식 픽스처를 인프로세스로 실행한다.

공개 `source` 패키지는 `FromBytes`와 `FromText`를 제공한다. `Source`는 맨 앞 BOM 하나를 제거한 검증된 UTF-8 텍스트를 소유하며 `Name`, `Text`, `Lines`, `Bytes()`, `Length()`를 제공한다. `ByteAt`과 `Span`은 네이티브 바이트 인덱스를 변환하고, `Error`는 바이트 오프셋으로 위치가 있는 템플릿 오류를 만든다.
