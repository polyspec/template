# Template

[English](README.md).

Template은 하나의 명세로 정의되는 템플릿 언어다. TypeScript, Go, Rust, PHP 구현과 같은 엔진을 사용하는 네이티브 PHP 확장이 포함되어 있다. 각 구현은 AST로 템플릿을 렌더하고, 타입 고정 컴파일러는 템플릿을 같은 출력을 내는 네 언어의 generated 프로그램으로 바꾼다. 현재 상태는 [기능 상태](docs/features.ko.md)에 있다.

템플릿은 텍스트와 태그로 이루어진다. 태그는 `{` 뒤에 기호 `= @ ? :? : / + # ?# * %` 중 하나가 오거나, `{` 뒤에 대입이 올 때 시작한다. 그 외의 `{`는 텍스트다.

```
<h1>{= title}</h1>
{@ item = items}
<p class="{? item.index_ == 0}first{/}">{= item.name} {= item.price | number}</p>
{:}
<p>No items.</p>
{/}
{# footer.tpl year}
```

## 시작

```sh
npm ci
make check
make showcase
```

`make help`가 모든 타겟을 나열한다. `make check`는 문서·규칙·계약 검사, lint, 모든 패키지의 단위 테스트, 포매터와 에디터 테스트, AST와 generated 모드의 교차 언어 적합성 스위트, 브라우저·패키지 설치·예제 사이트 검사를 실행한다.

## 에디터 지원

하나의 언어 서비스가 모든 에디터 규칙을 갖고, 각 에디터는 어댑터로 그 서비스에 연결한다([에디터 지원](docs/spec/editor.ko.md)).

| 패키지 | 용도 |
| --- | --- |
| `@polyspec/template-language` | 언어 서비스 `openDocument()`, 포매터 `format()`, 명령 `template-fmt` |
| `@polyspec/template-lsp` | LSP 클라이언트가 있는 모든 에디터를 위한 Language Server Protocol 서버 `template-lsp` |
| `@polyspec/template-codemirror` | CodeMirror 6 확장 `template()` |
| `polyspec-template` | 언어 서버 `template-lsp`를 확장 안에 포함하고, 그 서버에 연결해 기능을 제공하는 VS Code 확장 |

`make vscode-install`은 VS Code 확장을 설치하고, `make install-cli`는 `template-fmt`를 `CLI_PREFIX` 아래의 script(`~/.local/bin`)로 설치한다.

## 문서

- [사용법](docs/guide.ko.md)은 템플릿 작성 방법과 렌더 방법을 설명한다.
- [명세](docs/spec/)는 렉시컬 규칙, 문법, 표현식 언어, 데이터 모델, 함수, 런타임, 타입 고정 컴파일러, AST, 오류, 에디터 지원을 정의한다.
- [기능 상태](docs/features.ko.md)는 기능별 구현, 검증, 배포를 기록한다.
- [실행 가능한 예제 사이트](examples/site/index.html)는 페이지 시나리오를 렌더하고 일치성, 반복 렌더, 처리량 결과물을 보여준다.
- [운영](docs/operations/)은 개발, 적합성, 릴리스 테스트, 의존성, 문서, 발행 절차를 설명한다.
- [포매터, 언어 서버, 에디터](docs/operations/editor-tools.ko.md)는 포매터, 언어 서버, CodeMirror 6 어댑터, VS Code 확장의 빌드, 설치, 검증 방법을 설명한다.
- [실행 계획](docs/plans/execution-plan.ko.md)은 웨이브, 그 의존 관계와 원인, 완료 기준, 완료 정의와 그 증거를 적는다.
- [실행 체크리스트](docs/plans/execution-checklist.ko.md)는 작업, 검증 방법, 상태를 나열한다.
- [변경 기록](CHANGELOG.ko.md)은 실제 변경과 검증을 기록한다.
