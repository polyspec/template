# 벤치마크

[English](README.md).

벤치마크는 각 구현이 같은 템플릿을 같은 데이터로 초당 몇 번 렌더하는지 측정한다.

## 실행

`make bench`는 선택된 모든 핵심 드라이버를 빌드하고, 모든 핵심 구현에서 모든 픽스처를 측정하고, 표를 출력하고, `tools/bench/results.md`를 쓴다. `make bench-ts`, `make bench-php`, `make bench-go`, `make bench-rust`, `make bench-php-ext`는 구현 하나를 측정한다.

| 옵션 | 효과 |
| --- | --- |
| `--langs a,b` | 나열한 구현을 측정한다. 기본값: 패키지가 존재하는 모든 핵심 구현이며 `php-ext`는 명시해야 한다. |
| `--fixture NAME` | 픽스처 하나를 측정한다. 기본값: 모든 픽스처. |
| `--fixtures-dir DIR` | 다른 디렉터리의 픽스처를 읽는다. |
| `--iters N` | 픽스처와 구현마다 측정하는 렌더 횟수. 기본값 50000. |
| `--warmup N` | 측정 전에 측정 없이 실행하는 렌더 횟수. 기본값 5000. |
| `--output-md FILE` | Markdown 표를 FILE에 쓴다. |
| `--output-json FILE` | 원시 측정값을 FILE에 쓴다. |
| `--json` | 원시 측정값을 출력하고 표를 쓰지 않는다. |

픽스처의 `bench.json`은 모든 드라이버에 전달할 템플릿을 `input.tpl` 대신 `target`으로 지정하고, 독립 프로세스 측정 샘플 수를 `measurements`로 지정할 수 있다. 기본값은 `input.tpl`과 1회다.

## 측정 대상

각 드라이버는 픽스처의 템플릿 파일을 맵 로더로 읽고, `data.json`, `define.json`, `env.json`을 읽고, 템플릿을 파싱하고 엔진 캐시를 채우기 위해 한 번 렌더하고, `--warmup` 횟수만큼 측정 없이 렌더한 다음, `--iters` 횟수의 렌더를 측정한다. 측정 루프 뒤에 같은 엔진 인스턴스로 한 번 더 렌더하고 두 번째 출력 해시를 기록하므로 러너가 반복 렌더 가능성도 검사한다. 따라서 측정은 렌더링을 다루며 파싱과 파일 시스템 접근은 다루지 않는다.

각 드라이버는 경과 초, 렌더 출력의 SHA-256, 두 번째 렌더의 SHA-256을 담은 JSON 한 줄을 출력한다. 러너는 한 픽스처의 해시를 구현끼리 비교하고 두 번째 해시가 바뀌면 거부하며, 두 구현이 다른 출력을 만들면 실패한다. 다른 작업의 시간을 비교하는 것은 의미가 없기 때문이다.

## 픽스처

픽스처는 `tools/bench/fixtures/` 아래의 디렉터리이며 `input.tpl`, 추가 `.tpl` 파일, 이름과 설명을 담은 `bench.json`, 선택적인 `data.json`, `define.json`, `env.json`을 가진다. 진입 템플릿의 기본 이름은 `input.tpl`이고, `bench.json.target`으로 다른 진입 템플릿을 고를 수 있으며 `bench.json.measurements`로 독립 샘플 수를 지정할 수 있다. 로더 루트는 픽스처 디렉터리다.

| 픽스처 | 내용 |
| --- | --- |
| `text` | 대부분 정적 텍스트이고 echo 태그가 몇 개 있는 페이지. |
| `loop` | 루프 메타데이터, 조건, 이스케이프 출력을 가진 100행 루프. |
| `expression` | 40개 항목에 대한 산술, 비교, 논리 연산자, 병합, 삼항, 파이프. |
| `composition` | include, 템플릿 define, 중첩 define, scope 인자를 가진 레이아웃. |
| `functions` | 30개 항목에 대한 number, date, json, url, join, sort와 문자열 함수. |

## 결과

`tools/bench/results.md`는 마지막 일반 실행의 표를 담는다. 실행 가능한 예제 사이트는 원시 측정값을 `examples/site/data/benchmark.json`에 저장한다. 절대 시간은 기계, 툴체인 버전, 실행 중의 부하에 따라 달라진다. 한 실행 안의 비율만 비교할 수 있다.

## 자원 측정
