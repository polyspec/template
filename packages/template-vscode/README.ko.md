# VS Code용 Polyspec Template

[English](README.md).

`.tpl` 템플릿 파일을 위한 언어 지원:

- HTML 텍스트, 속성 값, CSS, JavaScript, HTML 주석 안의 템플릿 태그를 강조하고, 태그 주변의 HTML, CSS, JavaScript 강조를 유지한다.
- 태그 종류마다, 그리고 표현식 토큰마다 scope를 준다.
- `{* *}`로 주석을 토글하고 구분자에 괄호 쌍을 적용한다.
- VS Code의 Node.js 프로세스에서 템플릿 언어 서비스를 실행하는, 함께 묶은 언어 서버 `template-lsp`(`@polyspec/template-lsp`)의 클라이언트다. 파서 위치의 파싱 진단, 템플릿 태그의 시맨틱 토큰, 모든 태그의 배경, 한 블록 구성의 태그 강조, 여러 줄 구성의 접기, 명령 Go to Matching Template Tag(macOS `Cmd+Alt+\`, Windows와 Linux `Ctrl+Alt+\`)를 제공한다.
- 문서 포맷과 범위 포맷을 한다. 태그 안의 공백과 줄의 들여쓰기를 편집기의 들여쓰기 단위로 바꾸고, 포맷한 AST가 소스 AST와 다르거나 HTML 구조의 짝이 맞지 않으면 편집을 돌려주지 않는다. 설정 `polyspec-template.format.templateBlocks`(`indent` 또는 `flat`)가 템플릿 블록이 들여쓰기 단계를 더할지 정한다.
- 타이핑 중 들여쓰기: Enter, `>`, `}` 뒤에 서버가 현재 줄의 들여쓰기를 정한다. 확장은 이 언어에 대해 `editor.formatOnType`의 기본값을 `true`로 정하며, `[polyspec-template]`에 대한 사용자 설정이 이를 덮어쓴다.

## 작업 공간 신뢰

확장은 신뢰하지 않은 작업 공간과 가상 작업 공간을 완전히 지원한다고 선언한다. 확장과 함께 묶은 서버는 클라이언트가 서버에 보내는 열린 문서의 텍스트만 읽고 작업 공간의 코드, 작업, 도구를 실행하지 않으므로 Restricted Mode에서 제한할 기능이 없다. 서버는 파일 시스템을 읽지 않으므로 가상 작업 공간의 문서도 파일과 같이 동작한다. 이 선언이 없으면 VS Code는 신뢰하지 않은 폴더에서 문법을 포함한 확장을 비활성화한다.

## 한계

확장은 템플릿 태그만 검사한다. `{? a}` 안에서 열고 `{/}` 뒤에서 닫는 `<div>`처럼 템플릿 분기를 가로지르는 HTML 요소의 균형은 검사하지 않는다. HTML 구조는 VS Code의 HTML 기능에 맡긴다.

## 빌드와 설치

```sh
make vscode-package
make vscode-install
```

문법은 기본 구분자 `{`와 `}`를 사용한다. 서버의 시맨틱 토큰은 `{% delimiter ..}` 지시문도 따른다. scope, 포맷 규칙, 한계는 [포매터, 언어 서버, 에디터](https://github.com/polyspec/template/blob/main/docs/operations/editor-tools.ko.md)에 설명되어 있다.
