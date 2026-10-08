<!-- doc-id: packages-template-python-readme -->
<!-- source-sha256: 1956de7ee1617521d9cbfd68ec2ea50c958294134d42747c792a2082e1acf592 -->
# polyspec-template

[English](README.md)

template 언어의 Python 구현: lexer, parser, renderer, 내장 함수, 명령줄 인터페이스. Python 3.11 이상이 필요하고 외부 package는 필요하지 않습니다.

## 설치

이 저장소의 tag에서 설치합니다. `vX.Y.Z`를 `packages/template-python`을 담은 첫 release tag로 바꿉니다:

```sh
pip install "polyspec-template @ git+https://github.com/polyspec/template@vX.Y.Z#subdirectory=packages/template-python"
```

이 package를 담은 release tag는 아직 없습니다. 이 저장소의 체크아웃에서는 `pip install ./packages/template-python`으로 설치합니다.

## 렌더링

```python
from polyspec.template import AstProgram, Engine, EngineOptions, RenderOptions
from polyspec.template import FsLoader

program = AstProgram(EngineOptions(loader=FsLoader('templates')))
program.register('greet', lambda args, context: 'Hello, ' + args[0])
engine = Engine(program)
assign = {'title': 'Home'}
html = engine.render('layout', assign, RenderOptions(
    define={'layout': {'template': 'layout.tpl'},
            'content': {'template': 'pages/home.tpl'}},
    env={'timezone': '+09:00', 'now': 1700000000},
))
```

assign 데이터는 Python 값입니다. `dict`는 map, `list`와 `tuple`은 list, `int`와 `float`은 double의 안전 정수 범위 안에서 binding되고 `None`은 빈 map입니다. JSON 입력은 `parse_json`과 `parse_json_bytes`로 받아 object key 순서를 유지합니다.

## 파싱

```python
from polyspec.template import analyze, parse

ast = parse(source, 'layout.tpl')
tags_and_tokens = analyze(source, 'layout.tpl')
```

파싱된 template은 `render()`에 전달하거나 `MapLoader`에 둘 수 있습니다.

## 명령줄

```sh
python -m polyspec.template.cli parse FILE [--root DIR] [--delimiters OC]
python -m polyspec.template.cli render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC]
```

`parse`는 AST를 JSON으로 출력합니다. template 오류는 그 필드를 JSON으로 표준 오류에 쓰고 상태 2로 끝납니다.

## API

| 구성원 | 설명 |
| --- | --- |
| `parse(source, name, options)` | 하나의 template을 AST로 파싱합니다. `options.delimiters`가 구분자를 고릅니다. |
| `analyze(source, name, options)` | 한 번 파싱해 AST와 tag 범위, 식 token을 돌려줍니다. |
| `analyze_prefix(source, name, options)` | 첫 오류 전에 받아들인 범위와 그 오류를 돌려줍니다. |
| `AstProgram(options)` | AST program을 만듭니다. 옵션: `loader`, `functions`, `class_functions`, `limits`, `delimiters`, `artifact_refresh`. |
| `Engine(program)` | 하나의 AST 또는 생성된 program에 위임하는 engine을 만듭니다. |
| `RenderOptions(define, env)` | 한 번의 render 호출: template 정의와 환경. |
| `MapLoader()` / `FsLoader(root)` | mapping 또는 디렉터리에서 읽는 loader. |
| `bind(value)` / `merge(first, second)` | host 데이터를 한 번 검사하고 bound map을 합칩니다. |
| `parse_json(text)` / `parse_json_bytes(data)` | binding 규칙을 적용하고 순서를 유지하는 JSON 입력. |
| `TemplateError` | 파싱과 렌더링의 오류. `to_object()`가 필드를 돌려줍니다. |
| `PageCache()` | 렌더링된 페이지를 보관합니다. |

[언어 문서](https://github.com/polyspec/template/blob/main/docs/spec/lexical.md)가 공유 동작을 정의하고 [conformance 문서](https://github.com/polyspec/template/blob/main/docs/spec/conformance.md)가 명령줄을 정의합니다. source는 이 저장소가 제공하며 registry 게시는 검증하지 않습니다.
