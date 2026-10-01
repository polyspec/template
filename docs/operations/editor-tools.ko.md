# 포매터와 VS Code 확장

[English](/operations/editor-tools).

두 TypeScript 패키지가 템플릿 작성을 지원한다.

- `packages/template-format`(`@polyspec/template-format`): 포매터 라이브러리 `format()`, 태그 구조 함수 `templateStructure()`, 명령줄 도구 `template-fmt`.
- `packages/template-vscode`(`polyspec-template`): 언어 정의, TextMate 문법, 포맷 제공자를 가진 VS Code 확장. 제공자는 `format()`을 호출하며 자체 포맷 규칙을 갖지 않는다.

두 패키지는 템플릿 문법을 `@polyspec/template`에서 가져온다. 포매터는 파서가 돌려주는 태그 범위와 표현식 토큰을 사용하고, 문법은 [렉시컬 규칙](/ko/spec/lexical), [태그 문법](/ko/spec/grammar), [표현식](/ko/spec/expressions)을 따른다.

## 포맷 스타일

포매터는 태그 안의 공백만 바꾼다. 태그 밖의 텍스트는 바꾸지 않으므로 렌더 출력이 바뀌지 않는다.

| 태그 | 포맷 결과 |
| --- | --- |
| echo | `{= expr}` |
| if, else-if, else, close | `{? expr}`, `{:? expr}`, `{:}`, `{/}` |
| loop | `{@ name = expr}` |
| 대입 | `{:name = expr}`, `{:name += expr}`, `{:name++}` |
| include | `{+ path}` |
| block | `{# id path name name:value}` |
| if-block | `{?# id}` |

- 여는 구분자와 시길 사이에 공백을 두지 않고, 닫는 구분자 앞에도 공백을 두지 않는다.
- 본문이 있는 태그는 시길 뒤에 공백 하나를 둔다.
- 이항 연산자, 삼항 연산자의 `?`와 `:`, `?:`, `??`, `in`, `=>`, 파이프 `|`의 앞뒤에 공백 하나를 둔다.
- `,` 뒤에 공백 하나를 두고 `,` 앞에는 공백을 두지 않는다.
- `(`, `[`, `...`, 단항 `!`와 `-` 뒤에 공백을 두지 않고, `)`와 `]` 앞에 공백을 두지 않는다.
- 함수나 메서드 이름과 `(` 사이, 피연산자와 인덱스 `[` 사이, 클래스 호출의 `::` 앞뒤에 공백을 두지 않는다.
- 접근자(`.name`, `.0`)는 왼쪽 피연산자에 붙인다.
- block 태그 본문은 단어를 유지하고 단어 사이의 연속 공백을 공백 하나로 바꾼다.

포매터는 다음 부분을 작성된 그대로 둔다.

- 공백과 줄 종결자를 포함한 태그 밖의 텍스트
- 주석 `{* ... *}`과 구분자 지시문 `{% delimiter ..}`
- 본문에 줄 종결자가 있는 태그
- 래퍼 태그의 래퍼, 그리고 래퍼와 겹친 구분자 사이의 공백
- 문자열 리터럴, 숫자 리터럴, include 경로의 문자

사용자 구분자를 지원한다. `--delimiters` 옵션과 `format()`의 `delimiters` 옵션이 엔진 구분자를 지정하고, `{% delimiter ..}` 지시문은 그 뒤의 태그에 적용할 구분자를 바꾼다.

## 안전 불변식

`format()`은 `@polyspec/template`의 `analyze()`로 소스를 파싱한다. 파서의 태그 범위와 표현식 토큰으로 각 태그를 포맷하고 결과를 다시 파싱한다. 두 AST가 모든 `span` 필드를 제거한 상태에서 같을 때만 결과를 돌려준다. 다르면 오류 결과를 돌려주고 호출자는 소스를 유지한다.

| 결과 | 조건 |
| --- | --- |
| `{ ok: true, text, changed }` | 소스가 파싱되고 포맷한 AST가 소스 AST와 같다 |
| `{ ok: false, error: { reason: 'parse', code, line, col, message } }` | 소스가 파싱되지 않는다. `code`, `line`, `col`은 파서 오류다 |
| `{ ok: false, error: { reason: 'invariant', code: null, line, col, message } }` | 포맷한 텍스트가 파싱되지 않거나 다른 AST로 파싱된다. 위치는 처음 바뀐 태그다 |

불변식 테스트는 `tests/cases`(`options.json`의 구분자 적용), `tests/fixtures`, `examples`, 포매터 픽스처 아래의 모든 `.tpl` 파일을 포맷한다. 파싱되는 파일마다 span을 제외한 AST가 같고, 태그 밖의 텍스트가 같고, 두 번째 실행에서 바뀌지 않아야 한다.

## 명령줄

```sh
make install-cli
template-fmt --help
template-fmt page.tpl
template-fmt --check templates
template-fmt --write templates
template-fmt < page.tpl
```

```
usage: template-fmt [--write | --check] [--delimiters OC] [PATH ...]
```

- `--write`와 `--check` 없이 파일 하나를 주면 포맷한 텍스트를 표준 출력에 쓴다.
- 경로가 없거나 `-`이면 표준 입력을 읽고 표준 출력에 쓴다.
- 디렉터리를 주면 그 아래의 모든 `.tpl` 파일을 정렬 순서로 포맷하고, `node_modules`와 이름이 `.`으로 시작하는 디렉터리는 건너뛴다. 경로가 여러 개이거나 디렉터리이면 `--write`나 `--check`가 필요하다.
- `--write`: 포맷되지 않은 파일을 다시 쓰고 그 경로를 출력한다.
- `--check`: 아무것도 바꾸지 않고 포맷되지 않은 파일의 경로를 출력한다.
- 파싱되지 않거나 포맷한 AST가 다른 파일은 표준 오류에 `path:line:col: CODE: message` 형식으로 출력하고 바꾸지 않는다.

| 종료 상태 | 의미 |
| --- | --- |
| 0 | 성공. `--check`에서는 모든 파일이 포맷되어 있다 |
| 1 | `--check`가 포맷되지 않은 파일을 찾았다 |
| 2 | 파싱되지 않는 파일, 다른 AST, 읽을 수 없는 경로 또는 잘못된 인자가 있다 |

`make install-cli`는 `npm link -w @polyspec/template-format`을 실행해 `template-fmt`를 전역 npm bin 디렉터리에 링크한다. 링크가 작업 트리를 가리키므로 `make build-format`이 설치된 명령을 갱신한다.

## VS Code 확장

```sh
make vscode-package
make vscode-install
code --list-extensions --show-versions | grep polyspec
```

`make vscode-package`는 `src/extension.ts`를 `@polyspec/template-format`, `@polyspec/template`과 함께 `dist/extension.cjs`로 번들하고 `packages/template-vscode/dist/polyspec-template.vsix`를 만든다. 설치한 확장은 실행할 때 저장소가 필요 없다. `make vscode-install`은 `--force`를 붙여 `code --install-extension`을 실행한다.

확장은 문서 텍스트만 읽고 작업 공간의 코드를 실행하지 않으므로 `capabilities.untrustedWorkspaces.supported`와 `capabilities.virtualWorkspaces`를 선언한다. 이 선언이 없으면 VS Code는 Restricted Mode에서 문법을 포함한 확장 전체를 비활성화하고, 신뢰하지 않은 폴더의 `.tpl` 파일은 일반 텍스트로 열린다. VS Code는 Electron 빌드에 포함된 Node.js로 확장을 실행하므로 확장은 `engines.vscode` `^1.138.0`만 선언하고 `engines.node`는 선언하지 않는다. VS Code 1.138.0은 Node.js 24.18.1을 가진 Electron 42.10.0을 사용하므로 번들 대상은 `node24`다.

확장은 `.tpl` 파일에 언어 `polyspec-template`을 등록하고 다음을 제공한다.

- 주석 토글을 위한 블록 주석 `{* *}`
- `{ }`, `[ ]`, `( )`, 따옴표, `<!-- -->`의 괄호 쌍과 자동 닫기
- `format()`을 사용하는 문서 포맷과 범위 포맷. 범위 포맷은 선택 범위 안에 완전히 들어가는 태그를 포맷한다. `format()`이 오류를 돌려주면 제공자는 편집을 돌려주지 않고 출력 채널 `Polyspec Template`에 위치를 기록한다.

### 진단과 짝 태그

`templateStructure()`는 `@polyspec/template`의 `analyze()`로 문서를 파싱하고, 오류 코드, 파서의 줄과 열, 문자열 범위를 가진 파싱 오류 또는 모든 태그 범위와 블록 구성을 돌려준다. 구성은 loop, if, if-block 태그와 그 블록의 else-if, else 태그, 닫는 태그이며, 파서가 받아들인 태그 범위에서 얻는다. 테스트는 모든 적합성 사례에서 구성을 AST의 `If`, `For`, `IfBlock` span과 분기 span과 비교한다. 확장은 이 함수만 사용한다.

- 진단: 확장은 템플릿 문서가 열릴 때와 마지막 변경 250 ms 뒤에 문서를 파싱하고, `E_PARSE_UNCLOSED_BLOCK`, `E_PARSE_UNEXPECTED_CLOSE`, `E_PARSE_ELSE_OUTSIDE_BLOCK` 같은 파싱 오류를 오류 코드와 함께 파서 위치에 게시한다. 문서가 파싱되면 진단을 지운다.
- 태그 배경: 주석을 뺀 모든 태그에 어두운 테마에서는 `#16351c`, 밝은 테마에서는 `#e3f6dd`인 진한 초록 배경을 칠한다. 이 배경은 편집기 배경과 밝기가 다르고(Dark 2026에서 ΔL* +13.4, Light 2026에서 5.1), Dark 2026의 모든 문법 색을 4.5:1 이상으로 유지한다. 가장 낮은 것은 키워드 기호의 4.8:1이다. `#044700`처럼 채도가 더 높은 초록은 더 눈에 띄지만 기호를 4.0:1로 낮추고, 어두운 테마의 검정처럼 편집기와 밝기가 같은 색은 구별되지 않는다. 확장은 템플릿 편집기가 보일 때와 마지막 변경 250 ms 뒤에 배경을 칠한다. 문서가 파싱되지 않는 동안에는 이전 배경이 남아 편집을 따라 움직인다.
- 강조: 커서가 여는 태그, 분기 태그, 닫는 태그에 있으면 같은 구성의 모든 태그를 강조한다.
- 접기: 닫는 태그가 뒤의 줄에 있는 구성은 여는 태그의 줄부터 닫는 태그 앞 줄까지 접힌다.
- 명령 Go to Matching Template Tag(`polyspec-template.goToMatchingTag`)는 커서를 커서 아래 구성의 다음 태그로 옮기고, 마지막 태그에서는 여는 태그로 옮긴다. 태그 밖에서는 커서를 감싸는 가장 안쪽 구성의 다음 태그로 옮긴다. 단축키는 macOS에서 `Cmd+Alt+\`, Windows와 Linux에서 `Ctrl+Alt+\`이며 템플릿 편집기에서만 동작한다. 통합 테스트는 macOS에서 VS Code 1.138.0의 기본 단축키가 `Cmd+Alt+\`를 다른 명령에 연결하지 않는지 검사한다.

문서가 파싱되지 않는 동안에는 강조, 접기, 명령이 사용할 구성이 없고, 태그 배경을 다시 계산하지 않는다. 확장은 템플릿 분기를 가로지르는 HTML 요소의 균형을 검사하지 않는다. HTML 구조는 VS Code의 HTML 기능에 맡긴다.

### 문법

문법 `text.html.polyspec-template`은 `text.html.basic`을 포함하고 선택자 `L:text.html.polyspec-template - (meta.template | comment.block.polyspec-template)`로 템플릿 태그를 주입한다. 주입은 문서의 모든 위치에 적용되므로 텍스트, 속성 값 안과 속성 사이, `<style>`의 CSS, `<script>`의 JavaScript, JavaScript 문자열, HTML 주석에서 태그를 강조하고, HTML, CSS, JavaScript는 자기 scope를 유지한다.

| 태그 종류 | 태그의 scope | 시길의 scope |
| --- | --- | --- |
| echo | `meta.template.echo.polyspec-template` | `keyword.control.echo.polyspec-template` |
| raw 출력(마지막 파이프 단계가 `raw`인 echo) | `meta.template.echo.raw.polyspec-template` | `keyword.control.echo.raw.polyspec-template` |
| if | `meta.template.if.polyspec-template` | `keyword.control.if.polyspec-template` |
| else-if | `meta.template.elseif.polyspec-template` | `keyword.control.elseif.polyspec-template` |
| else | `meta.template.else.polyspec-template` | `keyword.control.else.polyspec-template` |
| close | `meta.template.end.polyspec-template` | `keyword.control.end.polyspec-template` |
| loop | `meta.template.loop.polyspec-template` | `keyword.control.loop.polyspec-template` |
| 대입 | `meta.template.assignment.polyspec-template` | `keyword.control.assignment.polyspec-template` |
| include | `meta.template.include.polyspec-template` | `keyword.control.include.polyspec-template` |
| block | `meta.template.block.polyspec-template` | `keyword.control.block.polyspec-template` |
| if-block | `meta.template.ifblock.polyspec-template` | `keyword.control.ifblock.polyspec-template` |
| 주석 | `comment.block.polyspec-template` | `punctuation.definition.comment.begin.polyspec-template` |
| 지시문 | `meta.template.directive.polyspec-template` | `keyword.control.directive.polyspec-template` |
| 래퍼 태그 | 태그 종류를 감싸는 `meta.template.wrapped.polyspec-template` | `punctuation.definition.wrapper.begin.polyspec-template` |
| 이스케이프 `\{` | `constant.character.escape.polyspec-template` | |

구분자는 `keyword.control.tag.begin.polyspec-template`과 `keyword.control.tag.end.polyspec-template`이고, 블록 이름은 `entity.name.type.block.polyspec-template`이다. 흔히 쓰는 모든 테마가 `keyword.control`을 HTML 태그, 속성, 텍스트와 다른 색으로 칠하므로 구분자와 기호에 이 스코프를 쓴다. HTML이 `<`와 `>`에 쓰는 `punctuation.definition.tag`를 쓰면 태그가 HTML처럼 보였다. 표현식 안에서 문법은 문자열과 그 이스케이프, 숫자, `true`, `false`, `null`, `in`, 비교, 관계, 논리, 산술, coalesce, elvis, 삼항, spread, key-value 연산자, 파이프와 그 함수(`support.function.filter.polyspec-template`, `raw`는 `support.function.filter.raw.polyspec-template`), 함수 호출, 멤버 호출, 클래스 호출, 멤버 접근, `row.index_` 같은 루프 메타, 변수, include와 block 경로, block 식별자, block scope 항목에 scope를 준다. 어떤 표현식 토큰도 받아들이지 않는 문자는 `invalid.illegal.polyspec-template`이다.

### 문법의 한계

- 문법은 기본 구분자 `{`와 `}`를 사용한다. `{% delimiter ..}` 지시문 뒤의 태그와 엔진 옵션 `delimiters`로 렌더하는 템플릿은 태그로 강조하지 않는다. TextMate 문법은 문서에서 읽은 값으로 패턴을 바꿀 수 없고, 엔진 옵션은 소스에 없다.
- 문법은 LEX-8에 따라 태그 본문이 오류여도 태그 시작을 태그로 강조한다. 오류를 보고하거나 블록 구조를 검사하지 않는다.
- `{` 앞에서 시작해 `{`를 지나는 HTML 패턴이 우선한다. 주입은 앞선 매치가 덮지 않은 위치에만 적용되기 때문이다. 따옴표 없는 속성 값 안의 태그(`value=a{= x}`)와 속성 이름 안의 태그(`data-{= n}="1"`)가 영향을 받는다. 따옴표가 있는 속성 값 안의 태그와 속성 사이의 태그는 강조한다.
- raw 출력 scope, `@`의 루프 형식, 래퍼 태그의 시작은 태그 시작과 판단에 쓰는 문자가 한 줄에 있을 때 인식한다.

## 검증

```sh
make test-format
make format-check
make test-vscode
make test-vscode-integration
make format-external-check TEMPLATE_SOURCE_ROOT=/path/to/templates
```

`make test-vscode`는 `tm-grammars`의 HTML, CSS, JavaScript 문법과 함께 `vscode-tmgrammar-test`로 문법 테스트를 실행하고, 대체 `vscode` 모듈로 매니페스트와 번들한 제공자를 테스트한다. `make test-vscode-integration`은 `.vsix`를 빌드하고, `@vscode/test-electron`으로 `engines.vscode`의 최소 버전인 VS Code 1.138.0을 저장소 루트의 `.vscode-test`에 내려받고, VS Code 명령줄로 `.vsix`를 새 확장 디렉터리에 설치한다. 사용자 설치와 같이 workspace trust를 켜고 테스트 폴더를 신뢰하지 않은 상태로 VS Code를 실행해 `.tpl` 문서가 언어 `polyspec-template`으로 열리는지, 설치한 확장이 활성화되는지, `_workbench.captureSyntaxTokens`가 HTML 속성 값 안의 태그에 템플릿 scope를 보고하는지, 닫히지 않은 `{?`가 그 위치에 진단을 만드는지, 문서 강조, 접기 범위, Go to Matching Template Tag가 한 구성을 따르는지, 단축키가 비어 있는지, `vscode.executeFormatDocumentProvider`가 예제에 기대한 편집을 돌려주고 포맷된 문서와 파싱되지 않는 문서에는 편집을 돌려주지 않는지 검사한다. 두 번째 실행은 설치한 매니페스트에서 `capabilities`를 지우고 VS Code가 그 작업 공간에서 확장을 비활성화하는지 요구한다. 이것으로 첫 실행이 capability 누락을 찾아낸다는 것을 보인다.

`make check`가 `test-format`, `format-check`, `test-vscode`, `test-vscode-integration`을 실행한다. `make format-external-check`는 명시한 외부 템플릿 트리에도 불변식 테스트를 실행한다.
