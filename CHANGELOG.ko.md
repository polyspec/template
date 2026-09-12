# 변경 기록

[English](CHANGELOG.md).

## 미발행

### 2026-09-11

- 개발 규칙, 최상위 문서, Makefile, 문서 검사기, 실행 체크리스트를 가진 저장소를 생성했다.
- 검증: `make docs-check` 통과. 아직 패키지가 없어 `make check`는 실행하지 않았다.
- 명세를 추가했다: 렉시컬 규칙, 태그 문법, 표현식, 데이터 모델, 함수, 런타임, JSON Schema를 포함한 AST, 오류, 적합성, 완전한 예제. 문서를 함께 검토했다: 루프 메타 노드 뒤에 접근자를 허용하고, 루프나 if-block 안의 `{:?}`는 `E_PARSE_ELSEIF_NOT_IN_IF`를 보고하며, 래퍼 태그(`"{{= x}}"`, `/* {{= x}} */`, `<!-- {{# id}} -->`)와 구분자 설정(엔진 옵션과 `{% delimiter ;;}` 지시문)을 추가했고, 태그 종료를 문법이 닫는 구분자를 받아들이는지로 정의했다.
- 적합성 러너, 일치 러너, 언어 드라이버, 스키마 검사기를 추가했다.
- 검증: `make docs-check`가 문서 쌍 19개로 통과. `node scripts/check-schema.mjs`가 픽스처 0건으로 통과.
- TypeScript 구현 `@polyspec/template`을 추가했다: 소스, 표현식 렉서와 파서, standalone 줄·래퍼 태그·구분자 지시문을 가진 템플릿 파서, 순서 보존 JSON 파서를 가진 값 모델, 내장 함수, 블록 레지스트리와 제한을 가진 렌더러, 메모리·파일시스템 로더, 렌더 전용 진입점, CLI, 단위 테스트, 브라우저 테스트. 나머지 `expected.ast.json` 파일을 TypeScript 파서로 생성하고 스키마로 검증했다.
- 태그 시작 규칙을 좁혔다: `/`는 닫는 구분자 앞에서만, `@`는 `name =` 앞에서만 태그를 시작한다. `{/* */}`, `{/re/}`, `{ @media }`는 텍스트다. 연산자 오류의 위치를 실패한 표현식의 시작으로 정의하고, list나 map 피연산자를 가진 `+`를 `E_RUNTIME_STRINGIFY`로 하고, 정수 범위 검사를 정수 리터럴과 정수 타입 호스트 값으로 한정했다.
- 같은 모듈 분할, 단위 테스트, 적합성·표현식 픽스처 테스트, CLI를 가진 Go 구현 `github.com/polyspec/template`과 Rust 크레이트 `polyspec-template`을 추가했다. Rust AST 출력에서 정수 값의 숫자 리터럴을 JSON 정수로 직렬화한다. GNU Make 3.81이 직접 실행하는 명령에 내보낸 PATH를 적용하지 않으므로 Makefile에서 `cargo`를 `CARGO` 변수로 바꿨다.
- 같은 모듈 분할, 단위 테스트, 적합성·표현식 픽스처 테스트, CLI를 가진 PHP 구현 `polyspec/template`을 추가했다. `vendor/bin/phpunit`이 테스트 506개 통과. `node tests/runner/conformance.mjs --langs ts,php`가 418건 중 418건 통과. `node tests/runner/parity.mjs --langs ts,php`가 분기 없음을 보고.
- 구현 4개 검증: `node tests/runner/conformance.mjs`가 케이스 209건에 대해 836건 중 836건 통과. `node tests/runner/parity.mjs`가 ts, go, rust, php 사이에 분기 없음을 보고.
- 검증: `npm test -w @polyspec/template -- --run`이 테스트 471개 통과. `node tests/runner/conformance.mjs --langs ts`가 케이스 209건 중 209건 통과. `make test-browser` 통과. `npm run lint`와 `npm run typecheck -w @polyspec/template` 통과. `make docs-check`가 문서 쌍 21개로 통과.
- Rust 구현을 최적화했다: 복제한 값이 list와 map 저장소를 공유하게 하고, HTML 이스케이프에서 변경되지 않는 텍스트를 빌려 쓰고, 바인딩한 map을 미리 할당하고, 함수 환경을 빌려 쓰고, AST 연산자를 타입으로 사용한다. 공유 값을 사용하도록 PHP 확장 변환을 갱신했다.
- 검증: `make doc-coverage` 통과. `make check`가 lint, 네 패키지 단위 테스트, 5개 구현의 210개 케이스에 대한 적합성 1050건 중 1050건을 통과했다. `make test-ext`가 PHP 확장을 빌드하고 적합성 210건 중 210건과 확장 테스트 235개를 통과했다. `make bench BENCH_ITERS=3000 BENCH_WARMUP=300`가 출력 동일성 검사를 통과하고 벤치마크 결과를 기록했다.
- 렌더 API에서 대입한 변수와 템플릿 define을 분리했다. 호스트 레지스트리, 픽스처 파일, CLI 옵션의 이름을 `blocks`에서 `define`으로 바꾸고, 문자열 템플릿 경로를 받고, `layout` 같은 target ID가 템플릿 define을 통해 해석되게 했다. 모든 구현, 브라우저·벤치마크 드라이버, 픽스처, 문서를 갱신했다.
- 검증: `npm test -w @polyspec/template -- --run`이 테스트 650개 통과했다. `vendor/bin/phpunit`이 테스트 510개 통과했다. `node tests/runner/conformance.mjs --langs ts,go,rust,php`가 211개 케이스 844건 중 844건 통과했다. `make test-browser` 통과. `make test-ext`가 적합성 211건 중 211건과 확장 테스트 236개를 통과했다. `make docs-check`가 문서 쌍 29개로 통과했다.
- 컨트롤러 형태의 레이아웃 페이지, define 데이터와 scope 우선순위, 미리 렌더한 HTML 슬롯, 비어 있는 define 분기의 네 가지 애플리케이션 상황을 가진 실행 가능한 예제 사이트를 추가했다. 사이트는 ts, go, rust, php, php-ext의 렌더 HTML, 언어 간 해시, 반복 렌더 검사, 시나리오별 처리량을 기록한다.
- 검증: `make showcase`가 구현과 시나리오 20개 조합을 모두 비교하고 벤치마크 측정값 20개를 기록했다. `make showcase-check`가 브라우저 증명을 통과했다.
### 2026-09-12

- 네 런타임에서 컴파일 방식(`ast` 또는 `gen`), 컴파일 artifact 갱신(`dev`, `true` 또는 `false`), 최종 HTML 페이지 캐시 TTL(`null` 또는 `0`은 영구)을 분리했다. artifact 갱신과 페이지 캐시 만료 테스트를 추가했다.
- 별도 벤치마크 workspace를 다시 구성해 구현의 AST 행은 매 렌더마다 파싱하고 생성 코드 행은 생성된 호스트 언어 소스를 직접 호출하게 했다. 참조 행도 측정하는 모든 렌더마다 파싱 또는 컴파일하며, 측정 전에 모든 행이 동일한 323바이트 HTML과 SHA-256을 생성해야 한다.
- 검증: PHP 513개, TypeScript 652개, Go 패키지 테스트, Rust 패키지 테스트가 통과했다. 행마다 50회 실행한 벤치마크에서 출력 불일치가 없었고 결과는 벤치마크 workspace에 기록했다.

- Rust·Go·TypeScript·PHP 런타임에 준비된 렌더 계약을 추가했다. `prepare`가 assign과 define 데이터를 바인딩하고 파싱된 target을 한 번 해석하며 반복 `render` 호출은 그 상태를 재사용한다. 벤치마크 드라이버, 런타임 명세, 기능 상태와 정적 showcase 성능 설명을 갱신했다.
- 검증: Rust와 Go 패키지 검사가 통과했고 TypeScript 빌드와 PHP 문법 검사가 통과했다. 전체 언어 간 검증과 벤치마크 재실행은 이 변경을 완료로 표시하기 전에 남아 있다.


- 실제 Composer path 의존성 검사를 위해 `tools/consumer/php-path-check.mjs`와 `tools/consumer/php-runner.php`를 추가했다. 임시 소비자가 symlink 없이 `polyspec/template`을 설치하고 Composer로 로드한 뒤 `FilesystemLoader`로 플랫폼 스냅샷을 렌더한다.

- 모든 예제를 공통 템플릿, 목업 assign 데이터, define 레지스트리, `layout` 렌더 target으로 단순화했다. PHP 컨트롤러 오라클, 인증·DI·YAML 픽스처, 임시 Composer 소비자 스크립트, 외부 checkout 조회를 제거했다. 전체 포털 템플릿 바이트와 원본 해시는 유지하며 사이트에서 템플릿과 목업 입력을 볼 수 있다. 템플릿 예제가 소비 애플리케이션 통합 완료를 뜻하지 않으므로 T7.3을 미완료로 되돌렸다. 벤치마크 P95 표기를 표본 평균의 백분위로 바로잡았다.
- 단순화 후 검증: `make showcase`가 구현·시나리오 25개 조합을 통과하고 벤치마크 표본 125개를 기록했다. 모든 출력 바이트와 해시가 이전 결과물과 일치했다. `make showcase-check`가 원시 출력 비교와 공통 목업 입력·템플릿의 브라우저 테스트를 통과했고 `make docs-check`가 문서 쌍 30개로 통과했다.
- RT-43–RT-48에 언어 간 렌더 계약을 정의하고 Mermaid 도표, JSON 요청 형태, 어댑터 규칙을 추가했다. 모든 showcase `define.json` 항목을 object 형태로 통일하고 빌드 시 계약 검사를 추가했으며 Go, Rust, TypeScript, JavaScript 예제가 같은 시나리오 입력을 읽도록 갱신했다.
- `tools/showcase/adapters/interface.json`을 어댑터 타입, 필드, 소유 관계, 연산, 오류와 상태 전이의 원본으로 만들었다. TypeScript, JavaScript, Go, Rust, PHP에 대한 생성 선언부와 Mermaid 도표, 컴파일·reflection·런타임 계약 검사를 추가하고 모든 showcase 시나리오에서 실패 후 복구를 증명했다.
- 검증: `make check`, `make showcase`, `make showcase-check`, `make docs-check`가 통과했다. 계약 게이트는 211개 케이스의 적합성 1055건 중 1055건과 showcase 구현·시나리오 25개 조합 전체를 검증했다.
- 온라인 문서를 저장소 경로를 반영하는 정적 VitePress artifact로 구성하고 GitHub Pages 배포 workflow와 `make docs-static-check`을 추가했으며 발행 절차와 실행 체크리스트를 동기화했다.
- 공개된 VitePress 테마의 보간 문자열 노출을 수정하고 문서 색인 항목을 실제 링크로 바꾸었으며 모든 `.ko` 경로에 한글 sidebar를 지정해 언어 전환 후에도 한글 메뉴가 유지되게 했다.
- showcase 템플릿 등록을 식별자와 경로의 직접 대응으로 단순화하고 define 데이터나 완성된 HTML이 필요한 경우에만 객체를 유지했으며 예제 페이지에서 포털 assign JSON과 두 소스 템플릿을 기본으로 펼쳐 보이게 했다.

- TypeScript·Go·Rust·PHP에 동일한 `PageCache.getOrSet` miss/hit 계약을 추가했다. hit에서는 render callback을 호출하지 않고 저장된 HTML을 반환하며, miss에서는 한 번 호출하고 결과를 저장한다. 재생성 가능한 산출물을 dangling command continuation 없이 제거하도록 `make clean`도 수정했다.
- TypeScript·Go·Rust·PHP 생성 소스의 동등성을 강화했다. HTML escape 문자 다섯 개를 동일하게 처리하고 논리 연산자는 항상 boolean을 반환하며 빈 list와 map은 공통 진릿값 규칙을 따르게 했다. 지원하지 않는 generated 함수는 런타임 stub으로 남기지 않고 공통 IR에서 실패한다. 빌드 순서는 `tpl`에서 AST, typed host source로 이어지도록 강제하고 compiler 계약 도표에 source, manifest, typed program, 함수 signature를 포함했다.
- Generated mode 상태를 in progress로 바로잡았다. AST runtime은 211개 적합성 case를 통과하지만 generated 실행은 showcase 시나리오 5개로 제한되고 typed compiler는 `default`만 받으며 별도 showcase generator가 주입 callback을 제공한다. 구현을 계속하기 전에 v1 compiler 경계, build-time artifact 갱신, 완전한 내부 검증 gate를 정의했다.
- TypeScript, Go, Rust, PHP에서 `AstProgram`과 generated `Program` 구현을 위임형 `Engine` 뒤의 동등한 구현으로 구성했다. runtime engine의 compile mode 선택과 generated renderer callback을 제거하고 generated showcase artifact가 `Program`을 직접 구현하게 했다. 별도 generator를 제품 compiler로 교체하기 전까지 generated 적합성 범위는 showcase 시나리오 5개로 유지한다.
- 파서가 승인한 태그 범위와 표현식 lexer token 범위를 반환하는 분석 출력을 추가했다. 정적 예제 사이트는 이 범위로 템플릿 문법을 하이라이트하고 compiled artifact와 generated source를 양방향 스크롤 영역에 표시한다.
- 네 공개 runtime이 같은 `Engine`/`Program`/`AstProgram` 소유 구조를 제공하도록 구체적인 Go `AstProgram` 타입을 추가했다.
- compiler manifest에 runtime 선언 계약을 추가했다. interface gate는 TypeScript, Go, Rust 선언을 각 언어 parser로, PHP 선언을 Reflection으로 추출한 뒤 연산, 인자 수, 소유 관계, AST program 구조를 manifest와 비교한다.
- 중복된 showcase AST 디렉터리 네 벌을 시나리오별 canonical `compiled/ast` graph 하나로 교체했다. 제품 AST compiler는 source, type, contract digest를 기록하고 모든 파일 뒤에 manifest를 발행하며 실패한 빌드 뒤에도 이전 artifact를 보존하고 `false` 갱신 정책에서 템플릿 소스를 읽지 않고 배포 artifact를 검증한다.
- TypeScript, Go, Rust, PHP의 truthiness, 문자열 변환, escaping, 숫자 변환, 유한 산술 결과 검사, 동등성, 정렬, lookup, 반복 entry, 함수 호출, limit, 위치 오류를 `RuntimeBindings`로 통합했다. AST evaluator와 statement renderer가 이 경계를 사용하고 compiler interface gate가 runtime 연산 누락을 거부한다. TypeScript와 PHP의 표현식 깊이 검사는 고정값 대신 설정된 제한값을 사용한다.
