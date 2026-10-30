<!-- doc-id: docs-operations-editor-tools -->
<!-- source-sha256: a8074b14bd576e5e230660a2b5cb712c9b46b942c946d4462baab5bbb975f5a9 -->
# 포매터, 언어 서버, 에디터

[English](/operations/editor-tools).

네 TypeScript 패키지가 템플릿 작성을 지원한다.

- `packages/language`(`@polyspec/template-language`): 언어 서비스 `openDocument()`([에디터 지원](/ko/spec/editor)), 포매터 `format()`([포맷](/ko/spec/formatting)), 명령줄 도구 `template-fmt`, 적합성 명령 `template-language`.
- `packages/lsp`(`@polyspec/template-lsp`): 언어 서비스의 어댑터인 Language Server Protocol 서버 `template-lsp`.
- `packages/codemirror`(`@polyspec/template-codemirror`): 언어 서비스의 결과를 CodeMirror 편집기에 등록하는 CodeMirror 6 확장 `template()`([CodeMirror 6 어댑터](#codemirror-6-어댑터)).
- `packages/vscode`(`polyspec-template`): 언어 정의와 HTML 호스트의 TextMate 문법을 갖고, 확장 안에 포함한 언어 서버에 연결해 기능을 제공하는 VS Code 확장. 템플릿 규칙을 갖지 않는다.

언어 서비스만 템플릿 문법을 `@polyspec/template`에서 가져온다. 언어 서비스와 포매터는 파서가 돌려주는 태그 범위, 태그 본문, 그리고 파서가 EDT-8로 분류한 토큰을 사용하며, 자체 어휘 표를 선언하지 않는다(`packages/language/tests/lexical-tables.test.ts`). 서버, CodeMirror 어댑터, 확장은 언어 서비스를 호출한다. 확장은 템플릿 태그를 문법이 아니라 서버의 시맨틱 토큰으로 칠한다.

## 포매터

포맷 스타일, 들여쓰기, 포매터가 유지하는 부분, 안전 불변식은 명세의 규칙이다([포맷](/ko/spec/formatting), FMT-3~FMT-15). 모든 구현이 이 규칙으로 포맷하고, 적합성 케이스가 그 결과를 비교한다(CNF-18). 이 절은 `@polyspec/template-language`의 TypeScript 포매터 `format()`을 설명한다.

`format(source, options)`는 옵션 `indent`(FMT-9, 기본값 공백 두 개, `null`은 들여쓰기를 유지한다), `templateBlocks`(`'indent'` 또는 `'flat'`), `delimiters`(엔진 구분자, FMT-8), `name`(오류의 템플릿 이름), `range`(범위 안에 완전히 들어가는 태그와 범위 안에서 시작하는 줄만 포맷한다)를 받는다. `@polyspec/template`의 `analyze()`로 소스를 파싱하고, 파서의 태그 본문과 토큰으로 각 태그를 포맷하며, 다음 결과 중 하나를 돌려준다(FMT-14).

| 결과 | 조건 |
| --- | --- |
| `{ ok: true, text, changed }` | 소스가 파싱되고 포맷한 AST가 소스 AST와 같다 |
| `{ ok: false, error: { reason: 'parse', code, line, col, message } }` | 소스가 파싱되지 않는다 |
| `{ ok: false, error: { reason: 'invariant', code: null, line, col, message } }` | 포맷한 텍스트가 파싱되지 않거나 다른 AST로 파싱된다 |
| `{ ok: false, error: { reason: 'html', code: null, line, col, message } }` | HTML 구조의 짝이 맞지 않는다(FMT-12) |

출력이 HTML이 아닌 템플릿은 `indent: null`로 포맷한다.

불변식 테스트(`packages/language/tests/invariant.test.ts`)는 `tests/cases`(`options.json`의 구분자 적용), `tests/fixtures`, `examples`, 포매터 픽스처 아래의 모든 `.tpl` 파일을 `indent: null`로 한 번, 기본 들여쓰기로 한 번 포맷한다. 파싱되는 파일마다 `indent: null`은 span을 제외한 AST와 태그 밖의 텍스트가 같아야 한다. 기본 들여쓰기는 `html` 오류이거나, 줄 앞 공백과 탭을 제거한 상태에서 AST와 태그 밖의 텍스트가 같아야 한다. 둘 다 두 번째 실행에서 바뀌지 않아야 한다(FMT-13, FMT-15). `packages/language/tests/conformance.test.ts`는 모든 적합성 케이스의 결과를 그 `expected.format.json`과 비교한다.

명령 `template-language format [--indent none|tab|N] [--delimiters OC] FILE`(`packages/language/bin/template-language.mjs`)는 적합성 계약에서 TypeScript의 format 명령이다(CNF-4, CNF-5). `template-fmt`처럼 node:util `parseArgs`로 옵션을 파싱한다. 포맷한 텍스트를 출력하거나, 오류를 표준 오류에 JSON으로 쓰고 종료 상태 2로 끝난다.

## 명령줄

```sh
make template-install-cli
template-fmt --help
template-fmt page.tpl
template-fmt --check templates
template-fmt --write templates
template-fmt < page.tpl
```

```
usage: template-fmt [--write | --check] [--delimiters OC] [--indent N|tab|none]
                    [--template-blocks indent|flat] [PATH ...]
```

- `--write`와 `--check` 없이 파일 하나를 주면 포맷한 텍스트를 표준 출력에 쓴다.
- 경로가 없거나 `-`이면 표준 입력을 읽고 표준 출력에 쓴다.
- 디렉터리를 주면 그 아래의 모든 `.tpl` 파일을 정렬 순서로 포맷하고, `node_modules`와 이름이 `.`으로 시작하는 디렉터리는 건너뛴다. 경로가 여러 개이거나 디렉터리이면 `--write`나 `--check`가 필요하다.
- `--write`: 포맷되지 않은 파일을 다시 쓰고 그 경로를 출력한다.
- `--check`: 아무것도 바꾸지 않고 포맷되지 않은 파일의 경로를 출력한다.
- `--indent`: 들여쓰기 단위. 공백 `N`개(1~8), `tab`, 또는 `indent: null`(모든 줄이 들여쓰기를 유지)인 `none`이다. 기본값은 `2`다.
- `--template-blocks`: `templateBlocks` 옵션인 `indent`(기본값) 또는 `flat`.
- 파싱되지 않거나, 포맷한 AST가 다르거나, HTML 구조의 짝이 맞지 않는 파일(FMT-14)은 표준 오류에 `path:line:col: LABEL: message` 형식으로 출력하고 바꾸지 않는다. `LABEL`은 파서 오류 코드, `formatted AST differs` 또는 `HTML structure`다.

| 종료 상태 | 의미 |
| --- | --- |
| 0 | 성공. `--check`에서는 모든 파일이 포맷되어 있다 |
| 1 | `--check`가 포맷되지 않은 파일을 찾았다 |
| 2 | 파싱되지 않는 파일, 다른 AST, 짝이 맞지 않는 HTML 구조, 읽을 수 없는 경로 또는 잘못된 인자가 있다 |

`make template-install-cli`는 명령 `template-fmt`를 symbolic link 없이 prefix `CLI_PREFIX`(기본값 `~/.local`) 아래에 설치한다. `scripts/install-cli.mts`는 build된 formatter package와 이 checkout의 template package의 사본을 bin link 없이 설치하는 npm project `<prefix>/lib/polyspec-template-fmt`와, 복사된 formatter package의 진입점을 절대 경로로 `node`에 넘겨 실행하는 실행 script `<prefix>/bin/template-fmt`를 쓴다. 설치는 `<prefix>/lib/.polyspec-template-fmt.next-<pid>`에서 준비되어 rename으로 project를 대체하고, script는 임시 파일과 rename으로 쓰이므로, 실패한 설치는 이전 설치를 그대로 둔다. `<prefix>/bin`을 `PATH`에 둔다. `make template-build-language` 뒤에 다시 실행해 바뀐 build를 설치하며, `make uninstall-cli`는 project와 script를 지운다.

## 언어 서버

```sh
make template-build-lsp
node packages/lsp/bin/template-lsp.mjs --stdio
```

`template-lsp`는 Language Server Protocol 클라이언트가 있는 에디터에 표준 입력과 출력으로 Language Server Protocol을 제공한다. 클라이언트는 `.tpl` 문서에 대해 이 명령을 실행한다. 서버는 언어 서버의 기능([에디터 지원](/ko/spec/editor))의 기능을 제공한다. 진단, 시맨틱 토큰, 접기 범위, 문서 강조, 문서와 범위 포맷, `\n`, `>`, `}` 뒤의 타이핑 들여쓰기, 요청 `polyspec-template/tagRanges`와 `polyspec-template/matchingTag`다. 설정 `polyspec-template.format.templateBlocks`를 `workspace/configuration`으로 읽고, 포맷 오류는 클라이언트 로그에 경고로 쓴다. 서버는 템플릿 규칙을 갖지 않는다. 문서 버전마다 `openDocument()`를 한 번 호출하고, 언어 서비스의 UTF-16 문자열 인덱스를 프로토콜 위치로 변환한다. Language Server Protocol 클라이언트가 넘기는 인자 `--stdio`는 받아들이며 효과가 없다.

## VS Code 확장

```sh
make vscode-package
make vscode-install
code --list-extensions --show-versions | grep polyspec
```

`make vscode-package`는 `src/extension.ts`와 `vscode-languageclient`를 한 파일 `dist/extension.cjs`로 만들고, 서버 진입점 `@polyspec/template-lsp/server`와 `@polyspec/template-language`, `@polyspec/template`을 한 파일 `dist/server.cjs`로 만든 뒤, `packages/vscode/dist/polyspec-template.vsix`를 만든다. 설치한 확장은 실행할 때 저장소가 필요 없다. `make vscode-install`은 `--force`를 붙여 `code --install-extension`을 실행한다.

확장은 언어 서버 `template-lsp`에 연결해 동작한다. 확장의 언어 클라이언트(`vscode-languageclient`)가 VS Code의 Node.js 런타임으로 `dist/server.cjs`를 실행하고, 표준 입력과 출력으로 서버와 통신한다. 클라이언트는 URI scheme과 관계없이 언어 `polyspec-template`의 열린 문서마다 텍스트를 서버에 보낸다.

확장과 서버는 열린 문서의 텍스트만 읽고 작업 공간의 코드를 실행하지 않으므로 확장은 `capabilities.untrustedWorkspaces.supported`를 선언한다. 이 선언이 없으면 VS Code는 Restricted Mode에서 문법을 포함한 확장 전체를 비활성화하고, 신뢰하지 않은 폴더의 `.tpl` 파일은 일반 텍스트로 열린다. 확장은 `capabilities.virtualWorkspaces`도 선언한다. 서버는 문서 텍스트를 프로토콜로만 받고 파일 시스템을 읽지 않으므로, 가상 작업 공간의 문서도 파일과 같이 분석하며 그 URI가 진단의 템플릿 이름이 된다. 확장은 `main` 진입점만 있고 `browser` 진입점이 없으므로, Node.js 확장 호스트가 없는 VS Code for the Web은 확장을 실행하지 않는다. VS Code는 Electron 빌드에 포함된 Node.js로 확장과 서버를 실행한다. VS Code 1.138.0은 Node.js 24.18.1을 가진 Electron 42.10.0을 사용하므로 두 번들의 대상은 `node24`이고, 확장은 `engines.vscode` `^1.138.0`과 그 Electron의 Node.js인 `engines.node` `>=24.18.1`을 선언한다. kit의 Node.js pin 26.12.0은 다른 package의 하한이다. scope가 `packages/vscode`이고 channel이 24.18.1인 `config/toolchain.json`의 exception이 toolchain 검사가 확장의 하한을 받아들이게 한다.

확장은 `.tpl` 파일에 언어 `polyspec-template`을 등록하고 다음을 제공한다.

- 주석 토글을 위한 블록 주석 `{* *}`
- `{ }`, `[ ]`, `( )`, 따옴표, `<!-- -->`의 괄호 쌍과 자동 닫기
- 서버의 문서 포맷과 범위 포맷. 들여쓰기 단위는 편집기의 것이다. 공백 `tabSize`개이며, `insertSpaces`가 꺼져 있으면 탭이다. 설정 `polyspec-template.format.templateBlocks`(`indent` 또는 `flat`)가 `templateBlocks` 옵션이며, 서버는 이를 `workspace/configuration`으로 읽는다. 범위 포맷은 선택 범위 안에 완전히 들어가는 태그를 포맷하고 범위 안에서 시작하는 줄을 들여쓴다. `format()`이 오류를 돌려주면 서버는 편집을 돌려주지 않고 출력 채널 `Polyspec Template`에 위치를 경고로 기록한다.
- 타이핑 중 들여쓰기: Enter, `>`, `}` 뒤에 서버가 현재 줄의 들여쓰기를 `lineIndentation()`으로 정한다. VS Code는 `editor.formatOnType`이 켜져 있을 때만 이를 요청하므로, 확장은 설정 기본값으로 `"[polyspec-template]": { "editor.formatOnType": true }`를 제공한다. 이 언어에 대한 사용자 설정이나 작업 공간 설정이 이를 덮어쓴다. Enter 뒤의 빈 줄은 그 깊이의 들여쓰기를 갖는다.

### 진단과 짝 태그

서버는 진단, 토큰, 태그 범위, 구성, 접기 범위, 짝 태그를 언어 서비스의 `openDocument()`에서 얻는다([에디터 지원](/ko/spec/editor)). 언어 서비스의 테스트는 모든 적합성 사례에서 구성을 AST의 `If`, `For`, `IfBlock` span과 분기 span과 비교한다.

- 진단: 서버는 문서의 모든 버전에 대해 `E_PARSE_UNCLOSED_BLOCK`, `E_PARSE_UNEXPECTED_CLOSE`, `E_PARSE_ELSE_OUTSIDE_BLOCK` 같은 파싱 오류를 오류 코드와 함께 파서 위치에 게시한다. 문서가 파싱되거나 닫히면 진단을 지운다.
- 시맨틱 토큰: 서버는 텍스트의 템플릿 부분을 EDT-8의 토큰 종류로 분류한다. 태그 밖의 텍스트는 문법의 HTML 색을 유지한다. 확장은 VS Code가 정의하지 않은 종류를 `semanticTokenTypes`로 제공한다. 상위 종류가 `keyword`인 `delimiter`와 상위 종류가 `string`인 `path`다. `semanticTokenScopes`는 `delimiter`를 `keyword.control.tag.begin.polyspec-template`에, `keyword`를 `keyword.control.polyspec-template`에, `path`를 `string.unquoted.path.polyspec-template`에 대응시키므로, 시맨틱 토큰 규칙이 없는 테마도 구분자와 기호를 `keyword.control`로 칠한다. 기본값 `configuredByTheme`는 시맨틱 강조를 켜지 않는 테마에서 태그를 칠하지 않으므로, 확장은 `"[polyspec-template]": { "editor.semanticHighlighting.enabled": true }`를 설정 기본값으로 제공한다. 이 언어에 대한 사용자나 작업 공간 설정이 이를 덮어쓴다.
- 태그 배경: 주석을 뺀 모든 태그에 어두운 테마에서는 `#16351c`, 밝은 테마에서는 `#e3f6dd`인 진한 초록 배경을 칠한다. 이 배경은 편집기 배경과 밝기가 다르고(Dark 2026에서 ΔL* +13.4, Light 2026에서 5.1), Dark 2026의 모든 문법 색을 4.5:1 이상으로 유지한다. 가장 낮은 것은 키워드 기호의 4.8:1이다. `#044700`처럼 채도가 더 높은 초록은 더 눈에 띄지만 기호를 4.0:1로 낮추고, 어두운 테마의 검정처럼 편집기와 밝기가 같은 색은 구별되지 않는다. 확장은 템플릿 편집기가 보일 때와 마지막 변경 250 ms 뒤에 `polyspec-template/tagRanges`를 요청하고, 요청하는 동안 문서가 바뀌지 않았을 때만 결과를 칠한다. 문서가 파싱되지 않는 동안에는 파서가 오류 전까지 받아들인 태그에 배경을 칠한다. 확장은 API로 `tagRanges(document)`를 돌려주며(`vscode.extensions.getExtension('polyspec.polyspec-template').exports`), 이 함수는 확장이 칠하는 범위를 준다. VS Code에는 편집기의 장식을 읽는 API가 없으므로 통합 테스트는 이 범위를 여기서 읽는다.
- 강조: 커서가 여는 태그, 분기 태그, 닫는 태그에 있으면 같은 구성의 모든 태그를 강조한다.
- 접기: 닫는 태그가 뒤의 줄에 있는 구성은 여는 태그의 줄부터 닫는 태그 앞 줄까지 접힌다.
- 명령 Go to Matching Template Tag(`polyspec-template.goToMatchingTag`)는 `polyspec-template/matchingTag`를 요청해 커서를 커서 아래 구성의 다음 태그로 옮기고, 마지막 태그에서는 여는 태그로 옮긴다. 태그 밖에서는 커서를 감싸는 가장 안쪽 구성의 다음 태그로 옮긴다. 단축키는 macOS에서 `Cmd+Alt+\`, Windows와 Linux에서 `Ctrl+Alt+\`이며 템플릿 편집기에서만 동작한다. 통합 테스트는 macOS에서 VS Code 1.138.0의 기본 단축키가 `Cmd+Alt+\`를 다른 명령에 연결하지 않는지 검사한다.

문서가 파싱되지 않는 동안 강조, 접기, 명령은 닫힌 구성만 사용한다. 확장은 템플릿 분기를 가로지르는 HTML 요소의 균형을 검사하지 않는다. HTML 구조는 VS Code의 HTML 기능에 맡긴다.

### 문법

문법 `text.html.polyspec-template`은 `<style>`의 CSS와 `<script>`의 JavaScript를 포함하는 `text.html.basic`만 포함하고, 템플릿 규칙을 갖지 않는다. 서버는 `analyze`의 파서로 태그를 읽으므로, 서버의 시맨틱 토큰이 텍스트, 속성 값 안과 속성 사이, CSS, JavaScript, HTML 주석의 모든 태그를 칠한다. 정규 표현식 문법은 파서 문맥이 없다. 그 문법은 `{% delimiter ..}` 지시문 뒤의 태그, 오류인 태그 본문, 따옴표 없는 속성 값 안의 태그처럼 HTML 패턴이 덮는 태그에서 `analyze`와 달랐다. 서버가 응답하기 전에는 태그가 그 위치의 HTML 색으로 보인다.

## CodeMirror 6 어댑터

`packages/codemirror`(`@polyspec/template-codemirror`)는 `@codemirror/lang-html` 위에 만든 CodeMirror 6 확장이다. 모든 결과를 언어 서비스의 `openDocument()`에서 얻고, 위치 외에는 아무것도 변환하지 않으며, 템플릿 규칙을 갖지 않는다([에디터 지원](/ko/spec/editor)). CodeMirror와 언어 서비스는 모두 문서 텍스트의 UTF-16 문자열 인덱스를 쓰므로, 언어 서비스의 위치가 곧 CodeMirror의 위치다. `@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/lint`, `@codemirror/lang-html`, `@codemirror/commands`는 peer dependency이므로 어댑터는 편집기가 쓰는 각 패키지의 인스턴스 하나를 쓴다.

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
- 모든 태그 범위에 붙는 클래스 `cm-template-tag`의 마크. 우선순위가 가장 낮으므로 그 요소가 태그의 토큰 마크를 감싼다.
- 주 커서 아래 구성의 모든 태그에 붙는 클래스 `cm-template-highlight`의 마크(`highlights`)
- `@codemirror/lint`의 `linter`를 통한 진단. 심각도는 `error`, 출처는 `polyspec-template`, 메시지는 `CODE: message`이다. 예를 들면 `E_PARSE_UNCLOSED_BLOCK: block is not closed before the end of the file`이다. `templateDiagnostics(state)`는 상태에 대해 같은 진단을 돌려준다.
- `foldingRanges`로 만든 `foldService` 접기. 한 줄을 접으면 여는 태그 다음 줄부터 닫는 태그 앞 줄까지 숨긴다. CodeMirror는 한 줄에 범위 하나를 접는다. 한 줄에서 여러 구성이 시작하면 가장 늦게 끝나는 구성을 접는다.
- 편집기의 `indentUnit`과 `templateBlocks`로 구한 그 줄의 `lineIndentation` 열 너비를 돌려주는 `indentService`. Enter가 줄을 나누면 서비스는 줄을 나눈 텍스트를 분석하므로, 새 줄과 그 줄로 옮겨진 텍스트는 타이핑하는 줄의 들여쓰기를 얻는다. 언어 서비스가 요구하는 대로 들여쓰기 단위는 공백의 연속이거나 탭 하나여야 한다.
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
| `formatTemplate` | 편집기의 `indentUnit`과 `templateBlocks` 옵션으로 `format()`을 실행해 문서를 바꾼다. `format()`이 오류를 돌려주면 아무것도 바꾸지 않고 `false`를 돌려준다. Shift+Alt+F가 이 명령을 실행한다. |
| `goToMatchingTag` | 주 커서를 그 위치의 `matchingTag`로 옮기고, 짝 태그가 없으면 `false`를 돌려준다. 확장은 이 명령에 키를 연결하지 않는다. 예제는 `Mod-Alt-\`를 연결한다. |

Shift+Alt+F는 키맵 항목 `Shift-Alt-f`가 아니라 물리 키 F(`KeyboardEvent.code` `KeyF`)에 연결한다. 키맵 항목은 입력된 문자와 비교하는데, macOS에서 Option+Shift+F는 `Ï`를 입력하므로 그 항목은 macOS에서 실행되지 않는다.

## 검증

```sh
make template-test-language
make template-test-lsp
make format-check
make template-test-codemirror
make template-test-vscode
make template-test-vscode-integration
make format-external-check TEMPLATE_SOURCE_ROOT=/path/to/templates
```

`make template-test-lsp`는 빌드한 명령 `template-lsp`를 자식 프로세스로 실행하고, `vscode-jsonrpc`로 표준 입력과 출력을 통해 프로토콜을 주고받으며, 모든 에디터 픽스처에 대해 게시된 진단, 디코딩한 시맨틱 토큰, 태그 범위, 접기 범위, 픽스처 위치에서의 강조와 짝 태그, 두 `templateBlocks` 방식에서 모든 줄의 타이핑 들여쓰기, 포맷한 텍스트를 기대 결과와 비교한다. 또한 바이트 순서 표시, CRLF 줄 끝, 기본 다국어 평면 밖의 문자가 있는 텍스트를 언어 서비스와 비교하고, 선언한 기능, `multilineTokenSupport`가 없는 클라이언트에 대한 여러 줄 토큰의 분할, 설정 요청, 포맷 오류, 범위 포맷, 편집이 없는 타이핑 포맷을 검사한다.

`make template-test-vscode`는 매니페스트를 테스트하고, 문법이 `text.html.basic`만 포함하는지, `dist/extension.cjs`가 `vscode`와 Node.js 내장 모듈만, `dist/server.cjs`가 Node.js 내장 모듈만 불러오는지, `.vsix`가 둘 다 담는지, 매니페스트가 서버 legend의 토큰 종류 가운데 VS Code가 정의하지 않은 것을 모두 제공하는지, 번들한 서버가 표준 입력과 출력으로 진단을 게시하고 `polyspec-template/tagRanges`, `polyspec-template/matchingTag`, 타이핑 포맷에 응답하는지 검사한다. 언어 클라이언트는 VS Code 안에서만 실행되므로 통합 테스트가 이를 검사한다. `make template-test-vscode-integration`은 `.vsix`를 빌드하고, `make install` 뒤에 `make template-install-vscode`가 kit의 VS Code installer(`@polyspec/kit/install-vscode`)로 `var/tools/vscode`(`tests/integration/run.mjs`의 option `--vscode`)에 설치한 `engines.vscode`의 최소 버전 VS Code 1.138.0을 쓰며, VS Code 명령줄로 `.vsix`를 새 확장 디렉터리에 설치한다. 사용자 설치와 같이 workspace trust를 켜고 테스트 폴더를 신뢰하지 않은 상태로 VS Code를 실행해 `.tpl` 문서가 언어 `polyspec-template`으로 열리는지, 설치한 확장이 활성화되어 번들한 서버를 시작하는지, 이 언어에서 `editor.semanticHighlighting.enabled`가 켜져 있는지, 확장이 칠하는 태그 범위가 파싱되지 않는 문서에서도 주석을 뺀 모든 태그를 덮는지, `vscode.provideDocumentSemanticTokens`가 텍스트의 태그와 HTML 속성 값 안의 태그에 서버의 토큰 종류를 돌려주는지, 이 언어에서 `editor.formatOnType`이 켜져 있고 `}`와 Enter를 입력하면 현재 줄을 들여쓰는지, 닫히지 않은 `{?`가 그 위치에 진단을 만드는지, 문서 강조, 접기 범위, Go to Matching Template Tag가 한 구성을 따르는지, 단축키가 비어 있는지, `vscode.executeFormatDocumentProvider`가 예제에 기대한 편집을 돌려주고 포맷된 문서와 파싱되지 않는 문서에는 편집을 돌려주지 않는지 검사한다. 두 번째 실행은 설치한 매니페스트에서 `capabilities`를 지우고 VS Code가 그 작업 공간에서 확장을 비활성화하는지 요구한다. 이것으로 첫 실행이 capability 누락을 찾아낸다는 것을 보인다. profile 설치와 VS Code 실행은 각각 시간 제한이 없는 단계다(`tests/integration/step.mjs`). 단계는 시작, 실행 중 10 s마다 한 줄, 경과 시간이 붙은 결과를 출력하고, 설치와 실행은 VS Code의 출력을 도착하는 대로 출력한다. 설치는 exit code로, 실행은 exit code나 suite 결과로 판단한다. check마다 20 s의 timeout이 있고, suite는 check마다 `[suite] start - <check>`를 출력한 뒤 `[suite] ok - <check> (<ms> ms)`나 `[suite] not ok - <check> (<ms> ms)`를 출력한다. 입력한 줄의 format처럼 확장을 기다리는 check에는 자기 시간 제한이 없다(`tests/integration/suite/wait.cjs`). check의 timeout만 기다림을 끝내며, 그 error는 check가 기다린 것을 기대한 text, 실제 text와 함께 밝힌다(T20.1-7). 실행은 suite 결과로 끝난다. VS Code 1.138은 suite가 `[suite] N of M checks passed`를 출력한 뒤 종료하는 데 몇 분이 걸리기도 하므로, 그 줄 뒤 20 s 안에 종료하지 않으면 process group과 함께 kill한다. 20 s는 suite 결과가 출력된 뒤에 시작하며, VS Code를 끝낼 뿐 결과를 정하지 않는다.

integration 실행은 VS Code를 내려받지 않는다. 설치된 사본이 없으면 `run make install-vscode`와 함께 실패한다. VS Code는 integration test를 실행하는 곳에만 필요하므로 `make install`은 이것을 내려받지 않고, CI에서는 integration test를 실행하는 job만 `make template-install-vscode`를 실행한다(T20.1-6). installer는 사본을 `var/tools/vscode/.next-<pid>`에 내려받고 `vscode-<platform>-<version>`으로 rename하므로, 읽는 쪽은 사본이 없거나 완전한 사본을 찾으며, 있는 사본은 다시 내려받지 않는다. 설치된 사본은 바뀌지 않으므로 lock이 필요 없다(T20.1-4).

`make template-test-codemirror`는 어댑터를 빌드하고 두 종류의 테스트를 실행한다. Vitest 테스트는 `packages/language/tests/editor`의 모든 에디터 픽스처마다 DOM 없이 `EditorState`를 만들고, `templateDiagnostics`의 진단, 상태의 decoration 집합에 있는 토큰 마크와 태그 마크, fold service의 접기 범위, 모든 조회 위치의 강조 마크와 `goToMatchingTag` 목적지, `templateBlocks` `indent`와 `flat` 및 공백 두 개의 들여쓰기 단위로 구한 모든 줄의 들여쓰기 서비스 결과, `formatTemplate`의 결과를 픽스처의 기대 결과와 비교한다. 다른 테스트는 한 줄을 입력하고 `insertNewlineAndIndent`로 Enter를 누르며, 옵션, `formatTemplate`의 들여쓰기 단위, 텍스트마다 분석 하나를 재사용하는지 검사한다. Playwright 테스트는 `tests/browser/page.ts`를 esbuild로 `packages/codemirror/dist/browser/page.js`에 번들하고 빈 Chromium 페이지에 불러온 뒤, `<ul>`, Enter, `{@ x = xs}`, Enter를 입력한 뒤의 들여쓰기, 토큰 클래스, HTML 속성 값 안의 템플릿 색, 밝은 테마와 어두운 테마의 태그 배경, 닫히지 않은 블록의 lint 진단, 포맷되는 텍스트와 파싱되지 않는 텍스트에서의 Shift+Alt+F를 검사한다.

CI job `editor`는 `make editor-boundary-check template-test-language format-check template-test-lsp template-test-codemirror template-test-vscode`를 실행하고, VS Code가 화면을 요구하므로 `make template-test-vscode-integration`을 `xvfb-run`의 가상 X 서버에서 실행한다.

`make format-external-check`는 명시한 외부 템플릿 트리에도 불변식 테스트를 실행한다.

## 언어 service 규칙

- 에디터 지원은 세 계층으로 이루어진다.

| 계층 | 패키지 | 실행 환경 | 내용 |
| --- | --- | --- | --- |
| 파서 | `@polyspec/template` | 브라우저, Node.js | 소스의 태그 범위, 태그 본문, 분류한 토큰 |
| 언어 서비스 | `@polyspec/template-language` | 브라우저, Node.js | 문서 텍스트의 함수로 정의한 모든 에디터 규칙, 포매터와 명령 `template-fmt` |
| 어댑터 | `@polyspec/template-lsp`, `@polyspec/template-codemirror`, `polyspec-template`(VS Code) | Node.js, 브라우저, VS Code | 위치 변환과 기능 등록 |

- 어댑터는 템플릿 규칙을 갖지 않는다. 어댑터는 `@polyspec/template-language`에 의존하고 `@polyspec/template`에는 의존하지 않는다. 어댑터 패키지가 `@polyspec/template`을 선언하거나 import하면 검사가 실패한다(`make editor-boundary-check`가 `config/editor-boundaries.json`으로 `scripts/check-editor-boundaries.mts`를 실행한다).

- 언어 서비스는 에디터, Node.js 모듈, DOM에 의존하지 않는다. 예외는 패키지의 별도 진입점인 `src/cli` 아래의 명령 `template-fmt`다. 같은 검사는 `src/cli` 밖의 언어 서비스 소스가 `node:` 모듈, `vscode`, `vscode-` 패키지, CodeMirror 패키지를 import하거나 DOM 객체를 쓰면 실패한다.

- `openDocument(text, options)`는 텍스트를 한 번 분석하고, 문서의 모든 결과는 그 분석에서 나온다. `options.name`은 진단의 템플릿 이름이고, `options.delimiters`는 엔진 구분자 옵션(LEX-22)이며, `options.location`은 host와 함께 준 문서의 파일이다.

- 언어 서비스의 모든 위치는 바이트 순서 표시를 포함한 텍스트의 UTF-16 문자열 인덱스다. 줄은 `\n`, `\r\n` 또는 텍스트 끝으로 끝나는 범위이며 0부터 번호를 붙인다. 에디터와 Language Server Protocol은 같은 UTF-16 위치를 쓰므로 어댑터는 바이트를 세지 않고 위치를 변환한다.

- 파싱되지 않는 텍스트에도 결과가 있다. 파서는 첫 오류 전까지 받아들인 태그와 그 토큰을 돌려준다(`@polyspec/template`의 `analyzePrefix()`). 닫히지 않은 블록은 텍스트 끝에서 보고되므로, 그런 텍스트의 태그는 모두 받아들여진다. 언어 서비스는 받아들인 태그로 토큰, 태그 범위, 들여쓰기를 계산한다. 구성, 접기 범위, 짝 태그는 닫힌 블록만 사용한다.

- 파싱되지 않는 텍스트의 `diagnostics`는 파서 오류의 `start`, `end`(최소 한 글자), `code`, `message`와 `severity: 'error'`, `source: 'polyspec-template'`을 가진 오류 하나를 담는다. 파싱되는 텍스트의 `diagnostics`는 경로 진단을 텍스트 순서로, 같은 형식으로 그 태그의 범위에 담는다.

- 구성은 loop, if, if-block 태그와 그 else-if, else 태그, 닫는 태그다. `foldingRanges`는 닫는 태그가 뒤의 줄에서 시작하는 모든 구성에 대해, 여는 태그의 줄부터 닫는 태그 앞 줄까지의 범위를 담는다.

- `highlights(index)`는 `index`를 포함하는 태그(태그 바로 뒤의 인덱스 포함)를 가진 구성의 모든 태그 범위를 돌려주고, 그런 구성이 없으면 빈 목록을 돌려준다. `matchingTag(index)`는 그 구성의 다음 태그의 시작을 돌려주며, 마지막 태그 다음은 여는 태그다. 모든 태그 밖에서는 `index`를 감싸는 가장 안쪽 구성의 다음 태그를 돌려주고, 그런 구성이 없으면 null을 돌려준다.

- `format(options)`는 `indent`, `templateBlocks`, `range` 옵션을 받는 포매터의 `format()`이다.

- `lineIndentation(line, options)`는 타이핑하는 줄이 갖는 들여쓰기를 돌려준다. 포매터의 들여쓰기 규칙(FMT-9, FMT-10)에 `options.indent`와 `options.templateBlocks`를 적용해, 들여쓰기 단위를 그 줄의 깊이만큼 반복한 값이다. 깊이는 그 줄 앞의 텍스트로 정한다. 포매터와 달리 짝이 맞는 구조를 요구하지 않는다. 끝 태그는 같은 이름의 열린 요소까지 닫고, 그런 요소가 열려 있지 않으면 무시한다. Enter가 만드는 빈 줄도 그 깊이의 들여쓰기를 갖는다. 빈 줄을 비우는 것은 포매터뿐이다.

- `@polyspec/template-lsp`는 표준 입력과 출력을 쓰는 Language Server Protocol 서버다(명령 `template-lsp`). `positionEncoding` `utf-16`과 전체 텍스트 동기화를 쓰며 다음을 제공한다.

| 기능 | 결과 |
| --- | --- |
| 진단 게시 | `diagnostics` |
| `textDocument/semanticTokens/full` | EDT-8의 종류를 legend로 쓰는 `tokens` |
| `textDocument/foldingRange` | `foldingRanges` |
| `textDocument/documentHighlight` | `highlights` |
| `textDocument/formatting`, `textDocument/rangeFormatting` | 클라이언트의 `tabSize`와 `insertSpaces`를 쓰는 `format` |
| `\n`, `>`, `}`에 대한 `textDocument/onTypeFormatting` | 현재 줄의 들여쓰기를 `lineIndentation`으로 정하는 편집 |
| 요청 `polyspec-template/tagRanges` | `tags` |
| 요청 `polyspec-template/matchingTag` | `matchingTag` |

설정 `polyspec-template.format.templateBlocks`(`indent` 또는 `flat`)는 문서마다 `workspace/configuration`으로 읽는다.

위치와 범위는 프로토콜의 `Position`과 `Range` 값이다. 사용자 정의 요청의 매개변수와 결과는 다음과 같다.

| 요청 | 매개변수 | 결과 |
| --- | --- | --- |
| `polyspec-template/tagRanges` | `{ textDocument: TextDocumentIdentifier }` | 텍스트 순서의 `Range[]`, 문서가 열려 있지 않으면 `null` |
| `polyspec-template/matchingTag` | `{ textDocument: TextDocumentIdentifier, position: Position }` | 짝 태그가 시작하는 `Position`, 짝 태그가 없거나 문서가 열려 있지 않으면 `null` |

- 서버는 문서의 각 버전을 한 번 분석한다. 모든 버전의 진단을 버전 번호와 함께 게시하고, 문서가 닫히면 빈 목록을 게시한다. 문서의 템플릿 이름은 `file:` URI이면 파일 경로이고, 아니면 URI다. `file:` URI의 문서는 그 파일 경로를 `options.location`으로, `node:fs` 위의 host와 함께 연다. 다른 URI의 문서는 location이 없다. marker가 있는 문서를 분석할 때마다 서버는 marker의 진단을 marker의 `file:` URI에 게시하며, 유효한 marker에는 빈 목록을 게시한다.
- 시맨틱 토큰의 legend는 EDT-8의 토큰 종류를 그 순서대로 쓰며 modifier는 없다. 클라이언트가 `multilineTokenSupport`를 선언하지 않으면 여러 줄에 걸친 토큰은 줄마다 하나의 토큰으로 보낸다.
- 접기 범위는 첫 줄이 시작하는 프로토콜 줄에서 시작하고, 닫는 태그가 있는 줄 앞의 프로토콜 줄에서 끝난다.
- 포맷은 전체 텍스트를 바꾸는 편집 하나를 돌려주고, 텍스트가 이미 포맷되어 있으면 편집을 돌려주지 않는다. 들여쓰기 단위는 공백 `tabSize`개이고, `insertSpaces`가 false이면 탭 하나다. `format`이 오류를 돌려주면 서버는 편집을 돌려주지 않고 `path:line:col: LABEL: message; no edits returned`를 `window/logMessage` 경고로 보낸다. `LABEL`은 파서 오류 코드, `HTML structure` 또는 `formatted AST differs`다.
- `textDocument/onTypeFormatting`의 현재 줄은 요청 위치의 줄이다. 편집은 그 줄 앞의 공백과 탭을 바꾸며, 이미 `lineIndentation`과 같으면 서버는 편집을 돌려주지 않는다.
- 포맷과 타이핑 포맷은 `{ scopeUri: <문서 URI>, section: 'polyspec-template' }`로 `workspace/configuration`을 요청하고 결과의 `format.templateBlocks`를 쓴다. `flat`이 아닌 값과, `workspace/configuration` 기능이 없는 클라이언트는 `indent`가 된다.

- VS Code 확장 `polyspec-template`는 `@polyspec/template-lsp`를 확장 안에 포함하고, 그 서버에 연결해 기능을 제공한다. TextMate 문법은 CSS와 JavaScript를 포함한 HTML 호스트만 강조하고, 템플릿 태그는 확장이 이 언어에서 켜는 서버의 시맨틱 토큰으로만 칠한다. 태그 배경은 `polyspec-template/tagRanges`로 칠하고, 커서 이동은 `polyspec-template/matchingTag`로 한다.

- `@polyspec/template-codemirror`는 `@codemirror/lang-html` 위에 만든 CodeMirror 6 확장 `template(options)`를 내보낸다. 토큰에 `cm-template-<type>` 클래스를 붙이고, 태그 배경을 칠하고, `@codemirror/lint`로 진단을 보고하며, 접기, 짝 태그 강조, `lineIndentation`을 쓰는 들여쓰기 서비스, 그리고 에디터의 들여쓰기 단위를 쓰는 명령 `formatTemplate`(`Shift-Alt-f`에 연결)을 제공한다. `options.templateBlocks`, `options.delimiters`, `options.location`은 언어 서비스에 전달한다.

- 파일 `template-root.json`은 템플릿 root, 곧 그 디렉터리를 선언한다. 문서의 root는 문서의 가장 가까운 상위 디렉터리에 있는 marker가 선언하며, 문서의 디렉터리부터 파일시스템 root까지 찾는다. 일반 파일만 marker다. marker는 호출자가 root를 주지 않는 도구, 곧 언어 서비스, LSP 서버, `options.location`을 통한 CodeMirror 어댑터를 위한 것이다. 컴파일러는 `root` 인자를, 파일시스템 로더는 그 root를 유지하고, map 로더와 artifact 로더는 바뀌지 않으며, 적합성 명령은 `--root`(CNF-4)를 유지한다. 에디터는 marker를 기준으로 경로를 해석하고 host의 loader root를 검사하지 않는다. host의 loader root는 host 자신의 선언이며, 둘의 차이는 host의 선택이다.

- marker의 내용은 `{"schema": 1}`이다. 곧 유일한 키가 숫자 1인 `schema`인 객체 하나의 JSON 문서다. JSON 문서 하나가 아닌 텍스트, 객체가 아닌 값, `schema`가 없는 것, 다른 `schema` 값, 알 수 없는 키는 각각 marker 텍스트 전체에 걸친 오류 `E_ROOT_INVALID`이며 marker에 보고된다(`TemplateDocument.root.diagnostics`, marker의 URI에 게시). 유효하지 않은 marker는 root를 선언하지 않는다. `packages/language/tests/root-marker/vectors.json`의 vector가 marker 텍스트를 받아들이고 거부한다.

- 파싱되는 텍스트에서 모든 include 경로와 경로 토큰을 가진 block 태그의 모든 block 경로는 해석되지 않으면 그 태그에 걸친 진단 하나를 받는다:

| 조건 | 코드 | 메시지 |
| --- | --- | --- |
| marker가 없거나, 유효하지 않거나, `options.location`이 없음 | `E_ROOT_UNDECLARED` | `no template root declared (template-root.json)` |
| RT-8의 정규화 뒤 경로가 root를 벗어남 | `E_LOAD_OUTSIDE_ROOT` | `"<path>" leaves the template root` |
| root 아래 component가 symbolic link임(RT-10) | `E_LOAD_FAILED` | `template <name> cannot be loaded: <component> is a symbolic link` |
| 해석된 이름이 root 아래의 일반 파일이 아님 | `E_LOAD_NOT_FOUND` | `template <name> does not exist` |

경로는 root에 대한 문서의 템플릿 이름을 기준으로 RT-8의 정규화로 해석한다. 앞의 `/`는 root를 기준으로 하고 `.`와 `..`는 정규화한다. 식별자만 있는 block 태그와 `define`이 주는 대상은 렌더링 때 해석되며(RT-24, RT-25) 진단을 받지 않는다. 그것은 렌더링 때 `E_LOAD_NOT_FOUND`나 `E_RUNTIME_BLOCK_UNDEFINED`로 실패한다. 분석 뒤에 바뀐 파일은 문서의 다음 분석에서 보인다.

- 언어 서비스는 `options.location`(`{ path, host }`, `path`는 `/`로 구분한 절대 경로)으로 받은 host를 통해서만 파일에 닿는다. `host.entryType(path)`는 경로의 항목에 대해 symbolic link를 따라가지 않고 `file`, `directory`, `symlink`, `other`를 돌려주거나, 경로가 아무것도 가리키지 않으면 null을 돌려주고, `host.readText(path)`는 일반 파일의 텍스트를 돌려준다. 언어 서비스는 Node.js 없이 유지된다. LSP 서버는 `node:fs` 위의 host를 넘기고, CodeMirror host는 자기 host를 넘긴다.

- `packages/language/tests/editor` 아래의 에디터 픽스처는 각 템플릿에 대해 기대하는 진단, 토큰, 태그 범위, 접기 범위, 지정한 위치의 강조와 짝 태그, 모든 줄의 들여쓰기, 포맷한 텍스트를 준다. 픽스처는 그 디렉터리의 marker `template-root.json` 아래에 있으며, 모든 어댑터는 그 파일 경로로 연다. 언어 서비스, LSP 서버(표준 입력과 출력의 프로토콜로), CodeMirror 어댑터(`EditorState`로)는 위치를 변환한 뒤 같은 결과를 내야 한다.
