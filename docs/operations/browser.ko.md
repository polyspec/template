# 브라우저 렌더링

[English](/operations/browser).

TypeScript 패키지는 서버에서 실행되는 것과 같은 엔진으로 브라우저에서 렌더한다. 브라우저 테스트는 브라우저 빌드가 픽스처 케이스에 대해 기대 출력을 만드는지 검증한다.

## 브라우저 테스트 실행

```sh
npx playwright install chromium
make test-browser
```

`make test-browser`는 패키지를 빌드하고, `tests/browser/server.mjs`로 `127.0.0.1:4173`에 정적 서버를 띄우고, Chromium에서 `tests/browser/index.html`을 열어 모든 케이스의 렌더 출력을 `expected.html` 또는 `expected.error.json`과 비교한다. 입력이 원시 바이트에 의존하는 케이스(잘못된 UTF-8, 바이트 순서 표식)는 명령줄 스위트가 다루며 브라우저에서는 건너뛴다.

## 브라우저에 템플릿과 데이터 전달

- 템플릿: 템플릿 소스나 AST JSON을 번들해 `MapLoader`에 넣는다. `@polyspec/template/render` 진입점은 렉서와 파서 없이 AST JSON을 렌더한다.
- 데이터: `{= json(state) | raw}`로 assign 데이터를 `<script type="application/json">` 안에 임베드하고 패키지의 `parseJson`으로 읽는다. `data-state="{= json(state)}"` 같은 속성에는 `raw`가 필요 없다. echo 태그가 JSON 텍스트를 이스케이프하기 때문이다. `JSON.parse`는 정수 형태 키의 순서를 바꾸고 안전 범위 밖의 정수를 받아들인다.
- 템플릿 define과 환경: 서버가 사용한 것과 같은 `define`과 `env` 값을 전달한다.

## 컴포넌트 프레임워크와의 공존

- 템플릿은 문서와 정적 영역을 렌더하고 프레임워크가 마운트할 컨테이너 요소를 남긴다.
- 프레임워크는 서버와 브라우저에서 자기 영역을 렌더한다. 템플릿은 서버에서 렌더된 결과를 `html`을 가진 define 항목으로 삽입한다.

태그 시작 규칙은 프레임워크 문법을 텍스트로 유지한다: `{{ msg }}`, `{cond && x}`, `{/* comment */}`, `{ a: 1 }`은 태그가 아니다. 대입에는 `:` 시길이 필요하므로 `{:a = 1}`만 태그가 되고 `{a = 1}`은 텍스트로 남는다.
