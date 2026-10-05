# 적합성

[English](/operations/conformance).

적합성 스위트는 모든 구현이 `tests/cases/`의 케이스에 대해 같은 AST, 같은 출력, 같은 오류 필드를 만드는지 검증한다. 계약은 [적합성 명세](/ko/spec/conformance)에 있다.

## 스위트 실행

```sh
make conformance
node tests/runner/conformance.mjs --langs ts,go
node tests/runner/conformance.mjs --case loop/meta-fields
node tests/runner/parity.mjs
```

`make conformance`는 디렉터리가 있는 모든 패키지를 빌드하고 모든 케이스를 실행한다. 러너는 한 구현에서 케이스가 끝날 때마다 `<case> [<lang>] pass|fail (<ms> ms)`을 출력하고, 그 뒤 케이스와 구현마다 한 행인 요약 표를 출력하며, 비교가 실패하면 상태 1로 종료한다. `parity.mjs`는 구현끼리 비교하며 기대 파일을 읽지 않는다.

`make conformance-generated-ts`, `make conformance-generated-go`, `make conformance-generated-rust`, `make conformance-generated-php`는 모든 케이스의 generated program을 실행한다. `--case <group>/<name>`이나 `--case <group>`으로 케이스를 고른다. 각 케이스는 시작과 결과를 경과 시간과 함께 출력하고 30 s의 자기 deadline을 가진다. Go와 Rust 러너는 케이스 test를 `scripts/run-tests.mjs`로 실행한다. Go 케이스는 package `case_<case id>`이고 Rust 케이스는 test `case_<case id>`이며, 문자와 숫자가 아닌 글자가 이어진 부분은 `_` 하나로 쓴다. PHP 러너는 `php -l`과 케이스 process를 deadline에서 멈춘다. TypeScript 러너는 `tsc`를 시간 제한 없는 단계로 한 번 실행하여 시작, 실행 중 5 s마다 한 줄, 경과 시간이 붙은 결과를 출력하고, `tsc`가 0이 아닌 code로 종료하면 실패하며, 각 케이스를 worker에서 render한다.

## 케이스 추가

1. `tests/cases/<group>/<name>/`을 만들고 `input.tpl`, `case.json`(`rules`와 `stage`), 필요하면 `data.json`, `define.json`, `env.json`, `options.json` 또는 추가 템플릿을 넣는다.
2. 명세에 따라 `expected.html` 또는 `expected.error.json`을 손으로 작성한다.
3. TypeScript 구현으로 `expected.ast.json`을 생성하고 검토한다:

```sh
node tests/runner/conformance.mjs --langs ts --case <group>/<name> --update ast
node scripts/check-schema.mjs
node scripts/check-rules.mjs
```

4. 모든 구현에 대해 스위트를 실행한다.

`scripts/check-schema.mjs`는 `input.tpl`이 파싱되는 케이스에 `expected.ast.json`이 없거나, `input.tpl`의 렉시컬 또는 파싱 오류를 기대하는 케이스에 그 파일이 있으면 실패한다(CNF-15). `make schema-check`와 `make docs-check`가 이를 실행하므로 `make check`도 실행한다.

`--update html`과 `--update error`는 TypeScript 구현의 결과로 기대 파일을 쓴다. 생성된 파일은 커밋 전에 명세와 대조해 검토한다.

## 표현식 픽스처 추가

`tests/fixtures/expr/cases.json`에 `name`, `expr`, `tokens`, `ast`, `cases`를 가진 항목이나 `name`, `expr`, `error`를 가진 항목을 추가한다. span은 `expr`의 시작부터 바이트를 센다. 모든 구현이 단위 테스트에서 이 파일을 로드한다.
