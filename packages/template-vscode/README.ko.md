# VS Code용 Polyspec Template

[English](README.md).

`.tpl` 템플릿 파일을 위한 언어 지원:

- HTML 텍스트, 속성 값, CSS, JavaScript, HTML 주석 안의 템플릿 태그를 강조하고, 태그 주변의 HTML, CSS, JavaScript 강조를 유지한다.
- 태그 종류마다, 그리고 표현식 토큰마다 scope를 준다.
- `{* *}`로 주석을 토글하고 구분자에 괄호 쌍을 적용한다.
- 템플릿 파서로 계산한 파싱 진단, 한 블록 구성의 태그 강조, 여러 줄 구성의 접기, 명령 Go to Matching Template Tag(macOS `Cmd+Alt+\`, Windows와 Linux `Ctrl+Alt+\`)를 제공한다.
- `@polyspec/template-format`으로 문서 포맷과 범위 포맷을 한다. 포매터는 태그 안의 공백만 바꾸고, 포맷한 AST가 소스 AST와 다르면 편집을 돌려주지 않는다.

## 작업 공간 신뢰

확장은 신뢰하지 않은 작업 공간과 가상 작업 공간을 완전히 지원한다고 선언한다. 확장은 열린 문서의 텍스트만 읽고 작업 공간의 코드, 작업, 도구를 실행하지 않으므로 Restricted Mode에서 제한할 기능이 없다. 이 선언이 없으면 VS Code는 신뢰하지 않은 폴더에서 문법을 포함한 확장을 비활성화한다.

## 한계

확장은 템플릿 태그만 검사한다. `{? a}` 안에서 열고 `{/}` 뒤에서 닫는 `<div>`처럼 템플릿 분기를 가로지르는 HTML 요소의 균형은 검사하지 않는다. HTML 구조는 VS Code의 HTML 기능에 맡긴다.

## 빌드와 설치

```sh
make vscode-package
make vscode-install
```

문법은 기본 구분자 `{`와 `}`를 사용한다. scope, 포맷 규칙, 한계는 [포매터와 VS Code 확장](https://github.com/polyspec/template/blob/main/docs/operations/editor-tools.ko.md)에 설명되어 있다.
