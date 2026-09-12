# Template

[English](README.md).

Template은 하나의 명세로 정의되는 템플릿 언어다. TypeScript, Go, Rust, PHP 구현과 같은 엔진을 사용하는 네이티브 PHP 확장이 포함되어 있다. 현재 상태는 [기능 상태](docs/features.ko.md)에 있다.

템플릿은 텍스트와 태그로 이루어진다. 태그는 `{` 뒤에 기호 `= @ ? :? : / + # ?# *` 중 하나가 오거나, `{` 뒤에 대입이 올 때 시작한다. 그 외의 `{`는 텍스트다.

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

`make help`가 모든 타겟을 나열한다. `make check`는 문서 검사, lint, 모든 패키지의 단위 테스트, 교차 언어 적합성 스위트를 실행한다.

## 문서

- [사용법](docs/guide.ko.md)은 템플릿 작성 방법과 렌더 방법을 설명한다.
- [명세](docs/spec/)는 렉시컬 규칙, 문법, 표현식 언어, 데이터 모델, 함수, 런타임, AST, 오류를 정의한다.
- [기능 상태](docs/features.ko.md)는 기능별 구현, 검증, 배포를 기록한다.
- [실행 가능한 예제 사이트](examples/site/index.html)는 애플리케이션 상황을 렌더하고 일치성, 반복 렌더, 처리량 결과물을 보여준다.
- [운영](docs/operations/)은 개발, 적합성, 문서 절차를 설명한다.
- [실행 체크리스트](docs/plans/execution-checklist.ko.md)는 남은 작업을 나열한다.
- [변경 기록](CHANGELOG.ko.md)은 실제 변경과 검증을 기록한다.
