# 포매터, 언어 서버, 에디터

[English](/operations/editor-tools).

세 TypeScript 패키지가 템플릿 작성을 지원한다.

- `packages/template-language`(`@polyspec/template-language`): 언어 서비스 `openDocument()`([에디터 지원](/ko/spec/editor)), 포매터 `format()`, 명령줄 도구 `template-fmt`.
- `packages/template-lsp`(`@polyspec/template-lsp`): 언어 서비스의 어댑터인 Language Server Protocol 서버 `template-lsp`.
- `packages/template-codemirror`(`@polyspec/template-codemirror`): 언어 서비스의 결과를 CodeMirror 편집기에 등록하는 CodeMirror 6 확장 `template()`([CodeMirror 6 어댑터](#codemirror-6-어댑터)).
- `packages/template-vscode`(`polyspec-template`): 언어 정의와 TextMate 문법을 갖고, 확장 안에 포함한 언어 서버에 연결해 기능을 제공하는 VS Code 확장. 템플릿 규칙을 갖지 않는다.

언어 서비스만 템플릿 문법을 `@polyspec/template`에서 가져온다. 언어 서비스와 포매터는 파서가 돌려주는 태그 범위와 표현식 토큰을 사용한다. 서버, CodeMirror 어댑터, 확장은 언어 서비스를 호출하며, 확장의 문법은 [렉시컬 규칙](/ko/spec/lexical), [태그 문법](/ko/spec/grammar), [표현식](/ko/spec/expressions)을 따른다.

## 포맷 스타일

포매터는 태그 안의 공백과 줄의 들여쓰기를 바꾼다. 태그 안에서는 아래 표를 따른다. 태그 밖에서는 HTML 요소와 템플릿 블록의 중첩에 따라 줄 앞의 공백과 탭만 바꾼다([들여쓰기](#들여쓰기)). 태그 밖의 다른 텍스트는 바꾸지 않는다.

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

- 공백과 줄 종결자를 포함한 태그 밖의 텍스트. 줄의 들여쓰기는 예외다.
- 주석 `{* ... *}`과 구분자 지시문 `{% delimiter ..}`
- 본문에 줄 종결자가 있는 태그
- 래퍼 태그의 래퍼, 그리고 래퍼와 겹친 구분자 사이의 공백
- 문자열 리터럴, 숫자 리터럴, include 경로의 문자

사용자 구분자를 지원한다. `--delimiters` 옵션과 `format()`의 `delimiters` 옵션이 엔진 구분자를 지정하고, `{% delimiter ..}` 지시문은 그 뒤의 태그에 적용할 구분자를 바꾼다.

### 들여쓰기

포매터는 각 줄의 들여쓰기를 들여쓰기 단위를 그 줄의 깊이만큼 반복한 값으로 정한다. 들여쓰기 단위는 `indent` 옵션이며 공백 여러 개 또는 탭 하나다. 기본값은 공백 두 개다. `indent: null`은 모든 줄의 들여쓰기를 유지하므로 태그 안의 공백만 바뀐다.

```
<div class="board-list">
  <h2>{= t["list.heading"]}</h2>
  {? length(p.props.posts) == 0}
    <p>{= t["list.empty"]}</p>
  {:}
    <ul>
      {@ post = p.props.posts}
        <li><a href="{= post.href}">{= post.title}</a></li>
      {/}
    </ul>
  {/}
</div>
```

- 줄의 깊이는 그 줄이 시작하는 위치에서 열려 있는 HTML 요소와 템플릿 블록의 수다. 템플릿 블록은 if, loop, if-block 태그부터 그 닫는 태그까지다.
- 공백이 아닌 첫 텍스트가 HTML 끝 태그, 템플릿 닫는 태그 `{/}`, 분기 태그 `{:}`나 `{:? }`인 줄은 한 단계 덜 들여쓴다.
- 옵션 `templateBlocks: 'flat'`이면 템플릿 블록은 단계를 더하지 않는다. 블록의 태그와 그 안의 줄은 HTML 요소만으로 정한 깊이를 갖는다. 기본값 `'indent'`는 템플릿 블록을 요소처럼 센다.
- 여러 줄에 걸친 HTML 시작 태그 안의 줄은 그 태그보다 한 단계 더 들여쓴다. 따옴표로 감싼 속성 값 안에서 시작하는 줄은 들여쓰기를 유지한다.
- void 요소(`area`, `base`, `br`, `col`, `embed`, `hr`, `img`, `input`, `link`, `meta`, `param`, `source`, `track`, `wbr`)와 `/>`로 끝나는 시작 태그는 요소를 열지 않는다.
- 포매터는 `<pre>`, `<textarea>`, `<script>`, `<style>`, HTML 주석, 태그 안에서 시작하는 줄의 들여쓰기를 유지한다. 끝 태그가 있는 줄도 포함한다. `<script>`, `<style>`, `<textarea>` 안의 HTML 태그는 읽지 않는다.
- 빈 줄은 비운다.
- 들여쓰기 뒤의 줄 텍스트는 바뀌지 않는다. 포매터는 요소를 다른 줄로 옮기지 않는다.

포매터는 HTML 구조의 짝이 맞아야 한다. 끝 태그가 열린 요소와 맞지 않거나, 템플릿 끝까지 닫히지 않은 요소가 있거나, 템플릿 블록의 분기 사이 또는 시작 태그와 닫는 태그 사이에서 열린 HTML 요소가 다르면, `format()`은 그 태그의 위치와 함께 `reason: 'html'` 오류를 돌려주고 아무것도 바꾸지 않는다. 출력이 HTML이 아닌 템플릿은 `indent: null`로 포맷한다.

줄 앞의 공백과 탭은 렌더 출력의 일부다. 다만 블록 태그만 있는 줄은 렌더러가 그 공백과 함께 제거한다. 따라서 들여쓰기는 렌더된 줄 앞의 공백을 바꾼다. 브라우저는 그 공백을 표시하지 않는다. 예외는 포매터가 유지하는 `<pre>`와 `<textarea>` 안, 그리고 CSS `white-space`가 공백을 유지하는 요소 안이다.

## 안전 불변식

`format()`은 `@polyspec/template`의 `analyze()`로 소스를 파싱한다. 파서의 태그 범위와 표현식 토큰으로 각 태그를 포맷하고 결과를 다시 파싱한다. 두 AST가 모든 `span` 필드를, 그리고 들여쓰기를 바꿀 때는 텍스트의 모든 줄 앞 공백과 탭을 제거한 상태에서 같을 때만 결과를 돌려준다. 다르면 오류 결과를 돌려주고 호출자는 소스를 유지한다.

| 결과 | 조건 |
| --- | --- |
| `{ ok: true, text, changed }` | 소스가 파싱되고 포맷한 AST가 소스 AST와 같다 |
| `{ ok: false, error: { reason: 'parse', code, line, col, message } }` | 소스가 파싱되지 않는다. `code`, `line`, `col`은 파서 오류다 |
| `{ ok: false, error: { reason: 'invariant', code: null, line, col, message } }` | 포맷한 텍스트가 파싱되지 않거나 다른 AST로 파싱된다. 위치는 처음 바뀐 곳이다 |
| `{ ok: false, error: { reason: 'html', code: null, line, col, message } }` | HTML 구조의 짝이 맞지 않는다([들여쓰기](#들여쓰기)). 위치는 구조가 어긋난 태그다 |

불변식 테스트는 `tests/cases`(`options.json`의 구분자 적용), `tests/fixtures`, `examples`, 포매터 픽스처 아래의 모든 `.tpl` 파일을 `indent: null`로 한 번, 기본 들여쓰기로 한 번 포맷한다. 파싱되는 파일마다 `indent: null`은 span을 제외한 AST와 태그 밖의 텍스트가 같아야 한다. 기본 들여쓰기는 `html` 오류이거나, 줄 앞 공백과 탭을 제거한 상태에서 AST와 태그 밖의 텍스트가 같아야 한다. 둘 다 두 번째 실행에서 바뀌지 않아야 한다.

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
usage: template-fmt [--write | --check] [--delimiters OC] [--indent N|tab|keep]
                    [--template-blocks indent|flat] [PATH ...]
```

- `--write`와 `--check` 없이 파일 하나를 주면 포맷한 텍스트를 표준 출력에 쓴다.
- 경로가 없거나 `-`이면 표준 입력을 읽고 표준 출력에 쓴다.
- 디렉터리를 주면 그 아래의 모든 `.tpl` 파일을 정렬 순서로 포맷하고, `node_modules`와 이름이 `.`으로 시작하는 디렉터리는 건너뛴다. 경로가 여러 개이거나 디렉터리이면 `--write`나 `--check`가 필요하다.
- `--write`: 포맷되지 않은 파일을 다시 쓰고 그 경로를 출력한다.
- `--check`: 아무것도 바꾸지 않고 포맷되지 않은 파일의 경로를 출력한다.
- `--indent`: 들여쓰기 단위. 공백 `N`개(1~8), `tab`, 또는 `indent: null`인 `keep`이다. 기본값은 `2`다.
- `--template-blocks`: `templateBlocks` 옵션인 `indent`(기본값) 또는 `flat`.
- 파싱되지 않거나, 포맷한 AST가 다르거나, HTML 구조의 짝이 맞지 않는 파일은 표준 오류에 `path:line:col: LABEL: message` 형식으로 출력하고 바꾸지 않는다. `LABEL`은 파서 오류 코드, `formatted AST differs` 또는 `HTML structure`다.

| 종료 상태 | 의미 |
| --- | --- |
| 0 | 성공. `--check`에서는 모든 파일이 포맷되어 있다 |
| 1 | `--check`가 포맷되지 않은 파일을 찾았다 |
| 2 | 파싱되지 않는 파일, 다른 AST, 짝이 맞지 않는 HTML 구조, 읽을 수 없는 경로 또는 잘못된 인자가 있다 |

`make install-cli`는 명령 `template-fmt`를 symbolic link 없이 prefix `CLI_PREFIX`(기본값 `~/.local`) 아래에 설치한다. `scripts/install-cli.mjs`는 build된 formatter package와 이 checkout의 template package의 사본을 bin link 없이 설치하는 npm project `<prefix>/lib/polyspec-template-fmt`와, 복사된 formatter package의 진입점을 절대 경로로 `node`에 넘겨 실행하는 실행 script `<prefix>/bin/template-fmt`를 쓴다. 설치는 `<prefix>/lib/.polyspec-template-fmt.next-<pid>`에서 준비되어 rename으로 project를 대체하고, script는 임시 파일과 rename으로 쓰이므로, 실패한 설치는 이전 설치를 그대로 둔다. `<prefix>/bin`을 `PATH`에 둔다. `make build-language` 뒤에 다시 실행해 바뀐 build를 설치하며, `make uninstall-cli`는 project와 script를 지운다.

## 언어 서버

```sh
make build-lsp
node packages/template-lsp/bin/template-lsp.mjs --stdio
```

`template-lsp`는 Language Server Protocol 클라이언트가 있는 에디터에 표준 입력과 출력으로 Language Server Protocol을 제공한다. 클라이언트는 `.tpl` 문서에 대해 이 명령을 실행한다. 서버는 EDT-14([에디터 지원](/ko/spec/editor))의 기능을 제공한다. 진단, 시맨틱 토큰, 접기 범위, 문서 강조, 문서와 범위 포맷, `\n`, `>`, `}` 뒤의 타이핑 들여쓰기, 요청 `polyspec-template/tagRanges`와 `polyspec-template/matchingTag`다. 설정 `polyspec-template.format.templateBlocks`를 `workspace/configuration`으로 읽고, 포맷 오류는 클라이언트 로그에 경고로 쓴다. 서버는 템플릿 규칙을 갖지 않는다. 문서 버전마다 `openDocument()`를 한 번 호출하고, 언어 서비스의 UTF-16 문자열 인덱스를 프로토콜 위치로 변환한다. Language Server Protocol 클라이언트가 넘기는 인자 `--stdio`는 받아들이며 효과가 없다.

## VS Code 확장

```sh
make vscode-package
make vscode-install
code --list-extensions --show-versions | grep polyspec
```

`make vscode-package`는 `src/extension.ts`와 `vscode-languageclient`를 한 파일 `dist/extension.cjs`로 만들고, 서버 진입점 `@polyspec/template-lsp/server`와 `@polyspec/template-language`, `@polyspec/template`을 한 파일 `dist/server.cjs`로 만든 뒤, `packages/template-vscode/dist/polyspec-template.vsix`를 만든다. 설치한 확장은 실행할 때 저장소가 필요 없다. `make vscode-install`은 `--force`를 붙여 `code --install-extension`을 실행한다.

확장은 언어 서버 `template-lsp`에 연결해 동작한다(EDT-15). 확장의 언어 클라이언트(`vscode-languageclient`)가 VS Code의 Node.js 런타임으로 `dist/server.cjs`를 실행하고, 표준 입력과 출력으로 서버와 통신한다. 클라이언트는 URI scheme과 관계없이 언어 `polyspec-template`의 열린 문서마다 텍스트를 서버에 보낸다.

확장과 서버는 열린 문서의 텍스트만 읽고 작업 공간의 코드를 실행하지 않으므로 확장은 `capabilities.untrustedWorkspaces.supported`를 선언한다. 이 선언이 없으면 VS Code는 Restricted Mode에서 문법을 포함한 확장 전체를 비활성화하고, 신뢰하지 않은 폴더의 `.tpl` 파일은 일반 텍스트로 열린다. 확장은 `capabilities.virtualWorkspaces`도 선언한다. 서버는 문서 텍스트를 프로토콜로만 받고 파일 시스템을 읽지 않으므로, 가상 작업 공간의 문서도 파일과 같이 분석하며 그 URI가 진단의 템플릿 이름이 된다. 확장은 `main` 진입점만 있고 `browser` 진입점이 없으므로, Node.js 확장 호스트가 없는 VS Code for the Web은 확장을 실행하지 않는다. VS Code는 Electron 빌드에 포함된 Node.js로 확장과 서버를 실행하므로 확장은 `engines.vscode` `^1.138.0`만 선언하고 `engines.node`는 선언하지 않는다. VS Code 1.138.0은 Node.js 24.18.1을 가진 Electron 42.10.0을 사용하므로 두 번들의 대상은 `node24`다.

확장은 `.tpl` 파일에 언어 `polyspec-template`을 등록하고 다음을 제공한다.

- 주석 토글을 위한 블록 주석 `{* *}`
- `{ }`, `[ ]`, `( )`, 따옴표, `<!-- -->`의 괄호 쌍과 자동 닫기
- 서버의 문서 포맷과 범위 포맷. 들여쓰기 단위는 편집기의 것이다. 공백 `tabSize`개이며, `insertSpaces`가 꺼져 있으면 탭이다. 설정 `polyspec-template.format.templateBlocks`(`indent` 또는 `flat`)가 `templateBlocks` 옵션이며, 서버는 이를 `workspace/configuration`으로 읽는다. 범위 포맷은 선택 범위 안에 완전히 들어가는 태그를 포맷하고 범위 안에서 시작하는 줄을 들여쓴다. `format()`이 오류를 돌려주면 서버는 편집을 돌려주지 않고 출력 채널 `Polyspec Template`에 위치를 경고로 기록한다.
- 타이핑 중 들여쓰기: Enter, `>`, `}` 뒤에 서버가 현재 줄의 들여쓰기를 `lineIndentation()`(EDT-13)으로 정한다. VS Code는 `editor.formatOnType`이 켜져 있을 때만 이를 요청하므로, 확장은 설정 기본값으로 `"[polyspec-template]": { "editor.formatOnType": true }`를 제공한다. 이 언어에 대한 사용자 설정이나 작업 공간 설정이 이를 덮어쓴다. Enter 뒤의 빈 줄은 그 깊이의 들여쓰기를 갖는다.

### 진단과 짝 태그

서버는 진단, 토큰, 태그 범위, 구성, 접기 범위, 짝 태그를 언어 서비스의 `openDocument()`에서 얻는다([에디터 지원](/ko/spec/editor), EDT-4~EDT-11). 언어 서비스의 테스트는 모든 적합성 사례에서 구성을 AST의 `If`, `For`, `IfBlock` span과 분기 span과 비교한다.

- 진단: 서버는 문서의 모든 버전에 대해 `E_PARSE_UNCLOSED_BLOCK`, `E_PARSE_UNEXPECTED_CLOSE`, `E_PARSE_ELSE_OUTSIDE_BLOCK` 같은 파싱 오류를 오류 코드와 함께 파서 위치에 게시한다. 문서가 파싱되거나 닫히면 진단을 지운다.
- 시맨틱 토큰: 서버는 텍스트의 템플릿 부분을 EDT-8의 토큰 종류로 분류한다. 태그 밖의 텍스트는 문법의 HTML 색을 유지한다. 확장은 VS Code가 정의하지 않은 종류를 `semanticTokenTypes`로 제공한다. 상위 종류가 `keyword`인 `delimiter`와 상위 종류가 `string`인 `path`다. `semanticTokenScopes`는 `delimiter`를 `keyword.control.tag.begin.polyspec-template`에, `keyword`를 `keyword.control.polyspec-template`에, `path`를 `string.unquoted.path.polyspec-template`에 대응시키므로, 시맨틱 토큰 규칙이 없는 테마도 문법과 같이 구분자와 기호를 `keyword.control`로 칠한다.
- 태그 배경: 주석을 뺀 모든 태그에 어두운 테마에서는 `#16351c`, 밝은 테마에서는 `#e3f6dd`인 진한 초록 배경을 칠한다. 이 배경은 편집기 배경과 밝기가 다르고(Dark 2026에서 ΔL* +13.4, Light 2026에서 5.1), Dark 2026의 모든 문법 색을 4.5:1 이상으로 유지한다. 가장 낮은 것은 키워드 기호의 4.8:1이다. `#044700`처럼 채도가 더 높은 초록은 더 눈에 띄지만 기호를 4.0:1로 낮추고, 어두운 테마의 검정처럼 편집기와 밝기가 같은 색은 구별되지 않는다. 확장은 템플릿 편집기가 보일 때와 마지막 변경 250 ms 뒤에 `polyspec-template/tagRanges`를 요청하고, 요청하는 동안 문서가 바뀌지 않았을 때만 결과를 칠한다. 문서가 파싱되지 않는 동안에는 파서가 오류 전까지 받아들인 태그에 배경을 칠한다(EDT-6). 확장은 API로 `tagRanges(document)`를 돌려주며(`vscode.extensions.getExtension('polyspec.polyspec-template').exports`), 이 함수는 확장이 칠하는 범위를 준다. VS Code에는 편집기의 장식을 읽는 API가 없으므로 통합 테스트는 이 범위를 여기서 읽는다.
- 강조: 커서가 여는 태그, 분기 태그, 닫는 태그에 있으면 같은 구성의 모든 태그를 강조한다.
- 접기: 닫는 태그가 뒤의 줄에 있는 구성은 여는 태그의 줄부터 닫는 태그 앞 줄까지 접힌다.
- 명령 Go to Matching Template Tag(`polyspec-template.goToMatchingTag`)는 `polyspec-template/matchingTag`를 요청해 커서를 커서 아래 구성의 다음 태그로 옮기고, 마지막 태그에서는 여는 태그로 옮긴다. 태그 밖에서는 커서를 감싸는 가장 안쪽 구성의 다음 태그로 옮긴다. 단축키는 macOS에서 `Cmd+Alt+\`, Windows와 Linux에서 `Ctrl+Alt+\`이며 템플릿 편집기에서만 동작한다. 통합 테스트는 macOS에서 VS Code 1.138.0의 기본 단축키가 `Cmd+Alt+\`를 다른 명령에 연결하지 않는지 검사한다.

문서가 파싱되지 않는 동안 강조, 접기, 명령은 닫힌 구성만 사용한다(EDT-6). 확장은 템플릿 분기를 가로지르는 HTML 요소의 균형을 검사하지 않는다. HTML 구조는 VS Code의 HTML 기능에 맡긴다.

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

- 문법은 기본 구분자 `{`와 `}`를 사용한다. 문법은 `{% delimiter ..}` 지시문 뒤의 태그와 엔진 옵션 `delimiters`로 렌더하는 템플릿을 태그로 강조하지 않는다. TextMate 문법은 문서에서 읽은 값으로 패턴을 바꿀 수 없고, 엔진 옵션은 소스에 없다. 서버의 시맨틱 토큰은 지시문을 따르므로, 시맨틱 강조를 쓰는 테마에서는 지시문 뒤의 태그가 시맨틱 토큰 색을 받는다. 확장에는 엔진 옵션에 대한 설정이 없다.
- 문법은 LEX-8에 따라 태그 본문이 오류여도 태그 시작을 태그로 강조한다. 오류를 보고하거나 블록 구조를 검사하지 않는다.
- `{` 앞에서 시작해 `{`를 지나는 HTML 패턴이 우선한다. 주입은 앞선 매치가 덮지 않은 위치에만 적용되기 때문이다. 따옴표 없는 속성 값 안의 태그(`value=a{= x}`)와 속성 이름 안의 태그(`data-{= n}="1"`)가 영향을 받는다. 따옴표가 있는 속성 값 안의 태그와 속성 사이의 태그는 강조한다.
- raw 출력 scope, `@`의 루프 형식, 래퍼 태그의 시작은 태그 시작과 판단에 쓰는 문자가 한 줄에 있을 때 인식한다.

## CodeMirror 6 어댑터

`packages/template-codemirror`(`@polyspec/template-codemirror`)는 `@codemirror/lang-html` 위에 만든 CodeMirror 6 확장이다(EDT-16). 모든 결과를 언어 서비스의 `openDocument()`에서 얻고, 위치 외에는 아무것도 변환하지 않으며, 템플릿 규칙을 갖지 않는다([에디터 지원](/ko/spec/editor)). CodeMirror와 언어 서비스는 모두 문서 텍스트의 UTF-16 문자열 인덱스를 쓰므로, 언어 서비스의 위치가 곧 CodeMirror의 위치다. `@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/lint`, `@codemirror/lang-html`, `@codemirror/commands`는 peer dependency이므로 어댑터는 편집기가 쓰는 각 패키지의 인스턴스 하나를 쓴다.

```ts
import { defaultKeymap } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { goToMatchingTag, template } from '@polyspec/template-codemirror';

new EditorView({
  parent: document.querySelector('#editor') as HTMLElement,
  state: EditorState.create({
    doc: '<ul>\n  {@ item = items}\n    <li>{= item.name}</li>\n  {/}\n</ul>\n',
    extensions: [
      keymap.of([{ key: 'Mod-Alt-\\', run: goToMatchingTag }, ...defaultKeymap]),
      template({ templateBlocks: 'indent', name: 'list.tpl' }),
    ],
  }),
});
```

`template(options)`가 확장을 돌려준다. 옵션은 다음과 같다.

| 옵션 | 의미 |
| --- | --- |
| `templateBlocks` | `indent`(기본값) 또는 `flat`. 들여쓰기 서비스와 `formatTemplate`의 `templateBlocks` 옵션이다 |
| `delimiters` | 두 문자로 된 엔진 구분자 옵션. 기본값은 `{}`이다 |
| `name` | 진단에 쓰는 템플릿 이름. 기본값은 `template.tpl`이다 |

확장은 다음을 가진다.

- `@codemirror/lang-html`의 HTML 언어
- 상태의 텍스트에 대한 `TemplateDocument`를 갖는 상태 필드 `templateDocument`. 문서가 바뀔 때 텍스트를 한 번 분석하고, 아래의 모든 기능이 그 분석을 읽는다.
- EDT-8의 모든 토큰에 붙는 클래스 `cm-template-<type>`의 마크. 토큰 마크는 문법 강조보다 우선순위가 높으므로 그 요소가 HTML 강조의 요소 안에 놓이고, HTML 속성 값 안의 템플릿 토큰도 템플릿 색을 유지한다.
- 모든 태그 범위에 붙는 클래스 `cm-template-tag`의 마크(EDT-9). 우선순위가 가장 낮으므로 그 요소가 태그의 토큰 마크를 감싼다.
- 주 커서 아래 구성의 모든 태그에 붙는 클래스 `cm-template-highlight`의 마크(`highlights`, EDT-11)
- `@codemirror/lint`의 `linter`를 통한 진단. 심각도는 `error`, 출처는 `polyspec-template`, 메시지는 `CODE: message`이다. 예를 들면 `E_PARSE_UNCLOSED_BLOCK: block is not closed before the end of the file`이다(EDT-7). `templateDiagnostics(state)`는 상태에 대해 같은 진단을 돌려준다.
- `foldingRanges`로 만든 `foldService` 접기(EDT-10). 한 줄을 접으면 여는 태그 다음 줄부터 닫는 태그 앞 줄까지 숨긴다. CodeMirror는 한 줄에 범위 하나를 접는다. 한 줄에서 여러 구성이 시작하면 가장 늦게 끝나는 구성을 접는다.
- 편집기의 `indentUnit`과 `templateBlocks`로 구한 그 줄의 `lineIndentation` 열 너비를 돌려주는 `indentService`(EDT-13). Enter가 줄을 나누면 서비스는 줄을 나눈 텍스트를 분석하므로, 새 줄과 그 줄로 옮겨진 텍스트는 타이핑하는 줄의 들여쓰기를 얻는다. 언어 서비스가 요구하는 대로 들여쓰기 단위는 공백의 연속이거나 탭 하나여야 한다.
- `formatTemplate`을 실행하는 Shift+Alt+F

기본 테마(`EditorView.baseTheme`)가 마크에 색을 칠한다. `&dark`는 어두운 테마의 편집기에, `&light`는 그 밖의 편집기에 적용된다. 태그 배경은 어두운 테마에서 `#16351c`, 밝은 테마에서 `#e3f6dd`이고, 강조는 `#7ee787`(어두운 테마)과 `#1a7f37`(밝은 테마)의 1픽셀 외곽선이며, 주석은 기울임꼴이다. 같은 클래스를 쓰는 테마가 이 규칙을 덮어쓴다.

| 클래스 | 어두운 테마 | 밝은 테마 |
| --- | --- | --- |
| `cm-template-delimiter` | `#ff7b72` | `#cf222e` |
| `cm-template-keyword` | `#ff7b72` | `#cf222e` |
| `cm-template-variable` | `#ffa657` | `#953800` |
| `cm-template-property` | `#79c0ff` | `#0550ae` |
| `cm-template-function` | `#d2a8ff` | `#8250df` |
| `cm-template-string` | `#a5d6ff` | `#0a3069` |
| `cm-template-number` | `#79c0ff` | `#0550ae` |
| `cm-template-operator` | `#e6edf3` | `#1f2328` |
| `cm-template-comment` | `#8b949e` | `#6e7781` |
| `cm-template-path` | `#a5d6ff` | `#0a3069` |

명령은 다음과 같다.

| 명령 | 동작 |
| --- | --- |
| `formatTemplate` | 편집기의 `indentUnit`과 `templateBlocks` 옵션으로 `format()`(EDT-12)을 실행해 문서를 바꾼다. `format()`이 오류를 돌려주면 아무것도 바꾸지 않고 `false`를 돌려준다. Shift+Alt+F가 이 명령을 실행한다. |
| `goToMatchingTag` | 주 커서를 그 위치의 `matchingTag`(EDT-11)로 옮기고, 짝 태그가 없으면 `false`를 돌려준다. 확장은 이 명령에 키를 연결하지 않는다. 예제는 `Mod-Alt-\`를 연결한다. |

Shift+Alt+F는 키맵 항목 `Shift-Alt-f`가 아니라 물리 키 F(`KeyboardEvent.code` `KeyF`)에 연결한다. 키맵 항목은 입력된 문자와 비교하는데, macOS에서 Option+Shift+F는 `Ï`를 입력하므로 그 항목은 macOS에서 실행되지 않는다.

## 검증

```sh
make test-language
make test-lsp
make format-check
make test-codemirror
make test-vscode
make test-vscode-integration
make format-external-check TEMPLATE_SOURCE_ROOT=/path/to/templates
```

`make test-lsp`는 빌드한 명령 `template-lsp`를 자식 프로세스로 실행하고, `vscode-jsonrpc`로 표준 입력과 출력을 통해 프로토콜을 주고받으며, 모든 에디터 픽스처(EDT-17)에 대해 게시된 진단, 디코딩한 시맨틱 토큰, 태그 범위, 접기 범위, 픽스처 위치에서의 강조와 짝 태그, 두 `templateBlocks` 방식에서 모든 줄의 타이핑 들여쓰기, 포맷한 텍스트를 기대 결과와 비교한다. 또한 바이트 순서 표시, CRLF 줄 끝, 기본 다국어 평면 밖의 문자가 있는 텍스트를 언어 서비스와 비교하고, 선언한 기능, `multilineTokenSupport`가 없는 클라이언트에 대한 여러 줄 토큰의 분할, 설정 요청, 포맷 오류, 범위 포맷, 편집이 없는 타이핑 포맷을 검사한다.

`make test-vscode`는 `tm-grammars`의 HTML, CSS, JavaScript 문법과 함께 `vscode-tmgrammar-test`로 문법 테스트를 실행하고, 매니페스트를 테스트하고, `dist/extension.cjs`가 `vscode`와 Node.js 내장 모듈만, `dist/server.cjs`가 Node.js 내장 모듈만 불러오는지, `.vsix`가 둘 다 담는지, 매니페스트가 서버 legend의 토큰 종류 가운데 VS Code가 정의하지 않은 것을 모두 제공하는지, 번들한 서버가 표준 입력과 출력으로 진단을 게시하고 `polyspec-template/tagRanges`, `polyspec-template/matchingTag`, 타이핑 포맷에 응답하는지 검사한다. 언어 클라이언트는 VS Code 안에서만 실행되므로 통합 테스트가 이를 검사한다. `make test-vscode-integration`은 `.vsix`를 빌드하고, `make install`이 `scripts/install-vscode.mjs`로 `var/tools/vscode`(`tests/integration/run.mjs`의 option `--vscode`)에 설치한 `engines.vscode`의 최소 버전 VS Code 1.138.0을 쓰며, VS Code 명령줄로 `.vsix`를 새 확장 디렉터리에 설치한다. 사용자 설치와 같이 workspace trust를 켜고 테스트 폴더를 신뢰하지 않은 상태로 VS Code를 실행해 `.tpl` 문서가 언어 `polyspec-template`으로 열리는지, 설치한 확장이 활성화되어 번들한 서버를 시작하는지, `_workbench.captureSyntaxTokens`가 HTML 속성 값 안의 태그에 템플릿 scope를 보고하는지, 확장이 칠하는 태그 범위가 파싱되지 않는 문서에서도 주석을 뺀 모든 태그를 덮는지, `vscode.provideDocumentSemanticTokens`가 서버의 토큰 종류를 돌려주는지, 이 언어에서 `editor.formatOnType`이 켜져 있고 `}`와 Enter를 입력하면 현재 줄을 들여쓰는지, 닫히지 않은 `{?`가 그 위치에 진단을 만드는지, 문서 강조, 접기 범위, Go to Matching Template Tag가 한 구성을 따르는지, 단축키가 비어 있는지, `vscode.executeFormatDocumentProvider`가 예제에 기대한 편집을 돌려주고 포맷된 문서와 파싱되지 않는 문서에는 편집을 돌려주지 않는지 검사한다. 두 번째 실행은 설치한 매니페스트에서 `capabilities`를 지우고 VS Code가 그 작업 공간에서 확장을 비활성화하는지 요구한다. 이것으로 첫 실행이 capability 누락을 찾아낸다는 것을 보인다. profile 설치와 VS Code 실행은 각각 시간 제한이 없는 단계다(`tests/integration/step.mjs`). 단계는 시작, 실행 중 10 s마다 한 줄, 경과 시간이 붙은 결과를 출력하고, 설치와 실행은 VS Code의 출력을 도착하는 대로 출력한다. 설치는 exit code로, 실행은 exit code나 suite 결과로 판단한다. check마다 20 s의 timeout이 있고, suite는 check마다 `[suite] start - <check>`를 출력한 뒤 `[suite] ok - <check> (<ms> ms)`나 `[suite] not ok - <check> (<ms> ms)`를 출력한다. 실행은 suite 결과로 끝난다. VS Code 1.138은 suite가 `[suite] N of M checks passed`를 출력한 뒤 종료하는 데 몇 분이 걸리기도 하므로, 그 줄 뒤 20 s 안에 종료하지 않으면 process group과 함께 kill한다. 20 s는 suite 결과가 출력된 뒤에 시작하며, VS Code를 끝낼 뿐 결과를 정하지 않는다.

integration 실행은 VS Code를 내려받지 않는다. 설치된 사본이 없으면 `run make install`과 함께 실패한다. `scripts/install-vscode.mjs`는 사본을 `var/tools/vscode/.next-<pid>`에 내려받고 `vscode-<platform>-<version>`으로 rename하므로, 읽는 쪽은 사본이 없거나 완전한 사본을 찾으며, 있는 사본은 다시 내려받지 않는다. 설치된 사본은 바뀌지 않으므로 lock이 필요 없다(T20.1-4).

`make test-codemirror`는 어댑터를 빌드하고 두 종류의 테스트를 실행한다. Vitest 테스트는 `packages/template-language/tests/editor`의 모든 에디터 픽스처마다 DOM 없이 `EditorState`를 만들고, `templateDiagnostics`의 진단, 상태의 decoration 집합에 있는 토큰 마크와 태그 마크, fold service의 접기 범위, 모든 조회 위치의 강조 마크와 `goToMatchingTag` 목적지, `templateBlocks` `indent`와 `flat` 및 공백 두 개의 들여쓰기 단위로 구한 모든 줄의 들여쓰기 서비스 결과, `formatTemplate`의 결과를 픽스처의 기대 결과와 비교한다(EDT-17). 다른 테스트는 한 줄을 입력하고 `insertNewlineAndIndent`로 Enter를 누르며, 옵션, `formatTemplate`의 들여쓰기 단위, 텍스트마다 분석 하나를 재사용하는지 검사한다. Playwright 테스트는 `tests/browser/page.ts`를 esbuild로 `packages/template-codemirror/dist/browser/page.js`에 번들하고 빈 Chromium 페이지에 불러온 뒤, `<ul>`, Enter, `{@ x = xs}`, Enter를 입력한 뒤의 들여쓰기, 토큰 클래스, HTML 속성 값 안의 템플릿 색, 밝은 테마와 어두운 테마의 태그 배경, 닫히지 않은 블록의 lint 진단, 포맷되는 텍스트와 파싱되지 않는 텍스트에서의 Shift+Alt+F를 검사한다.

CI job `editor`는 `make editor-boundary-check test-language format-check test-lsp test-codemirror test-vscode`를 실행하고, VS Code가 화면을 요구하므로 `make test-vscode-integration`을 `xvfb-run`의 가상 X 서버에서 실행한다.

`make check`가 `test-language`, `test-lsp`, `test-codemirror`, `format-check`, `test-vscode`, `test-vscode-integration`을 실행한다. `make format-external-check`는 명시한 외부 템플릿 트리에도 불변식 테스트를 실행한다.
