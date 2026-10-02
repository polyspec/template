# 에디터 지원

[English](/spec/editor).

이 문서는 에디터가 템플릿을 지원하는 방식을 정한다. 하나의 언어 서비스가 모든 에디터 규칙을 갖고, 각 에디터는 얇은 어댑터로 그 서비스에 연결한다. 포맷 스타일과 들여쓰기 규칙은 [포매터, 언어 서버, 에디터](/ko/operations/editor-tools)에 있으며, 이 문서는 그것을 참조한다.

## 계층

**EDT-1** 에디터 지원은 세 계층으로 이루어진다.

| 계층 | 패키지 | 실행 환경 | 내용 |
| --- | --- | --- | --- |
| 파서 | `@polyspec/template` | 브라우저, Node.js | 소스의 태그 범위와 표현식 토큰 |
| 언어 서비스 | `@polyspec/template-language` | 브라우저, Node.js | 문서 텍스트의 함수로 정의한 모든 에디터 규칙, 포매터와 명령 `template-fmt` |
| 어댑터 | `@polyspec/template-lsp`, `@polyspec/template-codemirror`, `polyspec-template`(VS Code) | Node.js, 브라우저, VS Code | 위치 변환과 기능 등록 |

**EDT-2** 어댑터는 템플릿 규칙을 갖지 않는다. 어댑터는 `@polyspec/template-language`에 의존하고 `@polyspec/template`에는 의존하지 않는다. 어댑터 패키지가 `@polyspec/template`을 선언하거나 import하면 검사가 실패한다(`make editor-boundary-check`, `scripts/check-editor-boundaries.mjs`).

**EDT-3** 언어 서비스는 에디터, Node.js 모듈, DOM에 의존하지 않는다. 예외는 패키지의 별도 진입점인 `src/cli` 아래의 명령 `template-fmt`다. 같은 검사는 `src/cli` 밖의 언어 서비스 소스가 `node:` 모듈, `vscode`, `vscode-` 패키지, CodeMirror 패키지를 import하거나 DOM 객체를 쓰면 실패한다.

## 문서와 위치

**EDT-4** `openDocument(text, options)`는 텍스트를 한 번 분석하고, 문서의 모든 결과는 그 분석에서 나온다. `options.name`은 진단의 템플릿 이름이고 `options.delimiters`는 엔진 구분자 옵션(LEX-22)이다.

**EDT-5** 언어 서비스의 모든 위치는 바이트 순서 표시를 포함한 텍스트의 UTF-16 문자열 인덱스다. 줄은 `\n`, `\r\n` 또는 텍스트 끝으로 끝나는 범위이며 0부터 번호를 붙인다. 에디터와 Language Server Protocol은 같은 UTF-16 위치를 쓰므로 어댑터는 바이트를 세지 않고 위치를 변환한다.

**EDT-6** 파싱되지 않는 텍스트에도 결과가 있다. 파서는 첫 오류 전까지 받아들인 태그와 표현식 토큰을 돌려준다(`@polyspec/template`의 `analyzePrefix()`). 닫히지 않은 블록은 텍스트 끝에서 보고되므로, 그런 텍스트의 태그는 모두 받아들여진다. 언어 서비스는 받아들인 태그로 토큰, 태그 범위, 들여쓰기를 계산한다. 구성, 접기 범위, 짝 태그는 닫힌 블록만 사용한다.

## 결과

**EDT-7** 파싱되는 텍스트의 `diagnostics`는 비어 있다. 그렇지 않으면 파서 오류의 `start`, `end`(최소 한 글자), `code`, `message`와 `severity: 'error'`, `source: 'polyspec-template'`을 가진 오류 하나를 담는다.

**EDT-8** `tokens`는 텍스트의 템플릿 부분을 분류하며, 위치 순서로 정렬되고 겹치지 않는다. 태그 밖의 텍스트에는 토큰이 없다. 어댑터는 그 텍스트를 HTML로 강조한다.

| 종류 | 텍스트 |
| --- | --- |
| `delimiter` | 태그의 여는 구분자와 닫는 구분자. 래퍼 태그의 래퍼를 포함한다 |
| `keyword` | 시길(`=`, `?`, `:?`, `:`, `@`, `/`, `+`, `#`, `?#`, `%`), `true`, `false`, `null`, `in`, 지시문의 단어 `delimiter` |
| `variable` | 뒤에 `(`가 오지 않고 앞에 `.`이 없는 이름 |
| `property` | `.` 뒤의 이름이나 인덱스. 뒤에 `(`가 오면 제외한다 |
| `function` | 뒤에 `(`가 오는 이름과 파이프 뒤의 함수 |
| `string` | 문자열 리터럴, 따옴표로 감싼 경로, 구분자 지시문의 값 |
| `number` | 숫자 리터럴 |
| `operator` | 태그 안의 연산자와 구두점 |
| `comment` | 템플릿 주석 `{* *}` |
| `path` | 따옴표 없는 include 경로와 block 태그 본문의 따옴표 없는 단어 |

**EDT-9** `tags`는 주석을 뺀, 받아들인 모든 태그의 범위다. 에디터는 이 범위에 태그 배경을 칠한다. 어두운 테마에서는 `#16351c`, 밝은 테마에서는 `#e3f6dd`이다.

**EDT-10** 구성은 loop, if, if-block 태그와 그 else-if, else 태그, 닫는 태그다. `foldingRanges`는 닫는 태그가 뒤의 줄에서 시작하는 모든 구성에 대해, 여는 태그의 줄부터 닫는 태그 앞 줄까지의 범위를 담는다.

**EDT-11** `highlights(index)`는 `index`를 포함하는 태그(태그 바로 뒤의 인덱스 포함)를 가진 구성의 모든 태그 범위를 돌려주고, 그런 구성이 없으면 빈 목록을 돌려준다. `matchingTag(index)`는 그 구성의 다음 태그의 시작을 돌려주며, 마지막 태그 다음은 여는 태그다. 모든 태그 밖에서는 `index`를 감싸는 가장 안쪽 구성의 다음 태그를 돌려주고, 그런 구성이 없으면 null을 돌려준다.

**EDT-12** `format(options)`는 `indent`, `templateBlocks`, `range` 옵션을 받는 포매터의 `format()`이다.

**EDT-13** `lineIndentation(line, options)`는 타이핑하는 줄이 갖는 들여쓰기를 돌려준다. 포매터의 들여쓰기 규칙에 `options.indent`와 `options.templateBlocks`를 적용해, 들여쓰기 단위를 그 줄의 깊이만큼 반복한 값이다. 깊이는 그 줄 앞의 텍스트로 정한다. 포매터와 달리 짝이 맞는 구조를 요구하지 않는다. 끝 태그는 같은 이름의 열린 요소까지 닫고, 그런 요소가 열려 있지 않으면 무시한다. Enter가 만드는 빈 줄도 그 깊이의 들여쓰기를 갖는다. 빈 줄을 비우는 것은 포매터뿐이다.

## 어댑터

**EDT-14** `@polyspec/template-lsp`는 표준 입력과 출력을 쓰는 Language Server Protocol 서버다(명령 `template-lsp`). `positionEncoding` `utf-16`과 전체 텍스트 동기화를 쓰며 다음을 제공한다.

| 기능 | 결과 |
| --- | --- |
| 진단 게시 | `diagnostics`(EDT-7) |
| `textDocument/semanticTokens/full` | EDT-8의 종류를 legend로 쓰는 `tokens` |
| `textDocument/foldingRange` | `foldingRanges`(EDT-10) |
| `textDocument/documentHighlight` | `highlights`(EDT-11) |
| `textDocument/formatting`, `textDocument/rangeFormatting` | 클라이언트의 `tabSize`와 `insertSpaces`를 쓰는 `format`(EDT-12) |
| `\n`, `>`, `}`에 대한 `textDocument/onTypeFormatting` | 현재 줄의 들여쓰기를 `lineIndentation`으로 정하는 편집(EDT-13) |
| 요청 `polyspec-template/tagRanges` | `tags`(EDT-9) |
| 요청 `polyspec-template/matchingTag` | `matchingTag`(EDT-11) |

설정 `polyspec-template.format.templateBlocks`(`indent` 또는 `flat`)는 문서마다 `workspace/configuration`으로 읽는다.

위치와 범위는 프로토콜의 `Position`과 `Range` 값이다. 사용자 정의 요청의 매개변수와 결과는 다음과 같다.

| 요청 | 매개변수 | 결과 |
| --- | --- | --- |
| `polyspec-template/tagRanges` | `{ textDocument: TextDocumentIdentifier }` | 텍스트 순서의 `Range[]`, 문서가 열려 있지 않으면 `null` |
| `polyspec-template/matchingTag` | `{ textDocument: TextDocumentIdentifier, position: Position }` | 짝 태그가 시작하는 `Position`, 짝 태그가 없거나 문서가 열려 있지 않으면 `null` |

- 서버는 문서의 각 버전을 한 번 분석한다(EDT-4). 모든 버전의 진단을 버전 번호와 함께 게시하고, 문서가 닫히면 빈 목록을 게시한다. 문서의 템플릿 이름은 `file:` URI이면 파일 경로이고, 아니면 URI다.
- 시맨틱 토큰의 legend는 EDT-8의 토큰 종류를 그 순서대로 쓰며 modifier는 없다. 클라이언트가 `multilineTokenSupport`를 선언하지 않으면 여러 줄에 걸친 토큰은 줄마다 하나의 토큰으로 보낸다.
- 접기 범위는 첫 줄이 시작하는 프로토콜 줄에서 시작하고, 닫는 태그가 있는 줄 앞의 프로토콜 줄에서 끝난다.
- 포맷은 전체 텍스트를 바꾸는 편집 하나를 돌려주고, 텍스트가 이미 포맷되어 있으면 편집을 돌려주지 않는다. 들여쓰기 단위는 공백 `tabSize`개이고, `insertSpaces`가 false이면 탭 하나다. `format`이 오류를 돌려주면 서버는 편집을 돌려주지 않고 `path:line:col: LABEL: message; no edits returned`를 `window/logMessage` 경고로 보낸다. `LABEL`은 파서 오류 코드, `HTML structure` 또는 `formatted AST differs`다.
- `textDocument/onTypeFormatting`의 현재 줄은 요청 위치의 줄이다. 편집은 그 줄 앞의 공백과 탭을 바꾸며, 이미 `lineIndentation`과 같으면 서버는 편집을 돌려주지 않는다.
- 포맷과 타이핑 포맷은 `{ scopeUri: <문서 URI>, section: 'polyspec-template' }`로 `workspace/configuration`을 요청하고 결과의 `format.templateBlocks`를 쓴다. `flat`이 아닌 값과, `workspace/configuration` 기능이 없는 클라이언트는 `indent`가 된다.

**EDT-15** VS Code 확장 `polyspec-template`는 `@polyspec/template-lsp`를 확장 안에 포함하고, 그 서버에 연결해 기능을 제공한다. 서버가 응답하기 전에 HTML과 템플릿 태그를 강조하는 TextMate 문법을 유지하며, 서버의 시맨틱 토큰이 그 뒤 템플릿 토큰의 색을 바꾼다. 태그 배경은 `polyspec-template/tagRanges`로 칠하고, 커서 이동은 `polyspec-template/matchingTag`로 한다.

**EDT-16** `@polyspec/template-codemirror`는 `@codemirror/lang-html` 위에 만든 CodeMirror 6 확장 `template(options)`를 내보낸다. 토큰에 `cm-template-<type>` 클래스를 붙이고, 태그 배경을 칠하고, `@codemirror/lint`로 진단을 보고하며, 접기, 짝 태그 강조, `lineIndentation`을 쓰는 들여쓰기 서비스, 그리고 에디터의 들여쓰기 단위를 쓰는 명령 `formatTemplate`(`Shift-Alt-f`에 연결)을 제공한다. `options.templateBlocks`와 `options.delimiters`는 언어 서비스에 전달한다.

## 적합성

**EDT-17** `packages/template-language/tests/editor` 아래의 에디터 픽스처는 각 템플릿에 대해 기대하는 진단, 토큰, 태그 범위, 접기 범위, 지정한 위치의 강조와 짝 태그, 모든 줄의 들여쓰기, 포맷한 텍스트를 준다. 언어 서비스, LSP 서버(표준 입력과 출력의 프로토콜로), CodeMirror 어댑터(`EditorState`로)는 위치를 변환한 뒤 같은 결과를 내야 한다.
