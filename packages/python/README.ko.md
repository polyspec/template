<!-- doc-id: packages-template-python-readme -->
<!-- source-sha256: 4505049eb93e28cea6700bc6d2b19b8c2aa133872406963287a64de3acdd7946 -->
# polyspec-template

[English](README.md)

template 언어의 Python 구현: lexer, parser, renderer, 내장 함수, 명령줄 인터페이스. Python 3.14가 필요하고 외부 package는 필요하지 않습니다.

## 설치

이 package는 GitHub release의 asset인 wheel에서 설치합니다. `vX.Y.Z`를 release tag로 바꾸고 `https://github.com/polyspec/template/releases/download/vX.Y.Z/`에서 `polyspec_template-X.Y.Z-py3-none-any.whl`을 내려받습니다:

```sh
pip install ./polyspec_template-X.Y.Z-py3-none-any.whl
```

wheel은 Python 3.14를 요구하며 다른 package가 필요하지 않습니다. 이 저장소의 체크아웃에서는 `pip install ./packages/python`으로 설치합니다.

## 렌더링

```python
from polyspec.template import AstProgram, Engine, EngineOptions, RenderOptions
from polyspec.template import FsLoader

program = AstProgram(EngineOptions(loader=FsLoader("templates")))
program.register("greet", lambda args, context: "Hello, " + args[0])
engine = Engine(program)
assign = {"title": "Home"}
html = engine.render(
    "layout",
    assign,
    RenderOptions(
        define={
            "layout": {"template": "layout.tpl"},
            "content": {"template": "pages/home.tpl"},
        },
        env={"timezone": "+09:00", "now": 1700000000},
    ),
)
```

assign 데이터는 Python 값입니다. `dict`는 map, `list`와 `tuple`은 list, `int`와 `float`은 double의 안전 정수 범위 안에서 binding되고 `None`은 빈 map입니다. JSON 입력은 `parse_json`과 `parse_json_bytes`로 받아 object key 순서를 유지합니다.

## 파싱

```python
from polyspec.template import analyze, parse

ast = parse(source, "layout.tpl")
tags_and_tokens = analyze(source, "layout.tpl")
```

파싱된 template은 `render()`에 전달하거나 `MapLoader`에 둘 수 있습니다.

## 명령줄

```sh
python -m polyspec.template.cli parse [--root DIR] [--delimiters OC] FILE
python -m polyspec.template.cli render [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] FILE
python -m polyspec.template.cli tokens [--root DIR] [--delimiters OC] FILE
python -m polyspec.template.cli format [--indent none|tab|N] [--delimiters OC] FILE
```

옵션은 FILE 앞에 옵니다. `parse`는 AST를 JSON으로, `tokens`는 EDT-8 token을 UTF-8 byte offset의 `[start, end, type]` JSON 배열로 출력합니다. template 오류는 그 필드를 JSON으로 표준 오류에 쓰고 상태 2로 끝납니다. `format`은 정리한 text를 출력합니다(`--indent`: 1부터 8까지의 공백 수 `N`, 기본 2, `tab`, 또는 모든 줄을 유지하는 `none`). format 오류는 `{"reason", "code", "line", "col", "message"}`를 표준 오류에 쓰고 상태 2로 끝납니다. 사용법 오류는 상태 1로 끝납니다.

## API

| 구성원 | 설명 |
| --- | --- |
| `parse(source, name, options)` | 하나의 template을 AST로 파싱합니다. `options.delimiters`가 구분자를 고릅니다. |
| `decode_template(text)` | AST JSON 텍스트를 jsonschema로 패키지가 package data로 가진 `contracts/schema/ast.schema.json`에 대해 검증해 `parse`가 반환하는 dict로 읽습니다. 스키마가 거부한 JSON은 `path`가 잘못된 노드의 JSON Pointer인 `AstDecodeError`를, JSON이 아닌 텍스트는 `ValueError`를 일으킵니다(AST-10). |
| `analyze(source, name, options)` | 한 번 파싱해 AST, 본문 범위를 포함한 tag 범위, 각 tag의 모든 부분에 대한 EDT-8 분류를 돌려줍니다. 범위는 source의 code point index이며 `Source.byte_at`이 UTF-8 byte offset을 줍니다. |
| `analyze_prefix(source, name, options)` | 받아들인 태그·토큰과 첫 파서 오류를 `PrefixAnalysis.error`로 반환하며 성공하면 `None`이다. 잘못된 UTF-8과 구분자 옵션은 오류를 발생시킨다. 성공한 부분 분석 결과는 `ast`(Go는 `AST`)에 완전한 AST도 제공하며 파서 오류가 있으면 해당 필드는 null 또는 네이티브 부재 값이다. |
| `format_template(source, options)` | tag 안의 공백과 줄 들여쓰기를 정리하고 `FormatResult(ok, text, changed, error)`를 돌려줍니다. `FormatOptions`: `name`, `delimiters`, `range`(code point index), `indent`(공백 연속 또는 tab 하나, 기본 공백 두 칸; `None`은 모든 줄을 유지), `template_blocks`(`"indent"` 또는 `"flat"`). source가 파싱되지 않거나(`parse`), HTML 구조를 들여쓸 수 없거나(`html`), 정리한 AST가 다르면(`invariant`) `FormatError(reason, code, line, col, message)`로 거절합니다. |
| `AstProgram(options)` | AST program을 만듭니다. 옵션: `loader`, `functions`, `class_functions`, `limits`, `delimiters`, `artifact_refresh`. |
| `Engine(program)` | 하나의 AST 또는 생성된 program에 위임하는 engine을 만듭니다. |
| `RenderOptions(define, env)` | 한 번의 render 호출: template 정의와 환경. |
| `MapLoader()` / `FsLoader(root)` | mapping 또는 디렉터리에서 읽는 loader. |
| `bind(value)` / `merge(first, second)` | host 데이터를 한 번 검사하고 bound map을 합칩니다. |
| `parse_json(text)` / `parse_json_bytes(data)` | binding 규칙을 적용하고 순서를 유지하는 JSON 입력. |
| `TemplateError` | 파싱과 렌더링의 오류. `to_object()`가 필드를 돌려줍니다. |
| `PageCache()` | 렌더링된 페이지를 보관합니다. |

[언어 문서](https://github.com/polyspec/template/blob/main/docs/spec/lexical.md)가 공유 동작을 정의하고 [conformance 문서](https://github.com/polyspec/template/blob/main/docs/operations/conformance.md)가 명령줄을 정의합니다. source는 이 저장소가 제공하며 registry 게시는 검증하지 않습니다.

`Source.from_bytes`, `Source.from_text`와 바이트 생성자는 맨 앞 BOM 하나를 제거한 검증된 UTF-8을 복사해 보관한다. 소스는 `name`, `text`, `bytes`, `lines`, `length`를 제공하며 `byte_at`과 `span`은 코드 포인트 인덱스를 UTF-8 바이트 오프셋으로 변환한다. `error`는 바이트 오프셋으로 위치가 있는 템플릿 오류를 만든다. 잘못된 UTF-8과 짝이 없는 텍스트 서로게이트는 거부한다.

Package root·공개 submodule 이름은 명시적 `__all__` 목록을 따른다. Value carrier·binding 진입점·위치 오류·program/loader interface는 SDK 계약을 유지한다. 숫자 변환/분류·parser adapter helper는 구현 코드이며 runtime 연산은 `RuntimeBindings`로 공개한다.
