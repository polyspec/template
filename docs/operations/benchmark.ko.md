# 벤치마크 절차

전체 페이지 벤치마크는 `project performance measurements`에 있다. 다음과 같이 실행한다.

```sh
cd project performance measurements
make bench-all
```

벤치마크는 컴파일 방식과 컴파일 산출물 갱신 정책을 분리해 기록한다. 검사 대상 구현은 같은 픽스처와 입력으로 `ast`와 `gen`을 실행한다. 무캐시 파싱 트랙은 `refresh=dev`로 실행하며 호출마다 원본을 파싱한다. 생성 트랙은 측정 전에 생성된 호스트 언어 소스를 빌드한다. 최종 페이지 캐시는 꺼서 비즈니스 로직과 HTML 캐시가 템플릿 작업을 숨기지 않게 한다.

비교 adapter도 같은 출력 바이트, 입력 데이터, 반복 수와 검증을 사용한다. 동적 adapter는 측정하는 렌더마다 파싱 또는 컴파일하고, 정적 생성 adapter는 빌드 시 컴파일을 별도로 기록한다. 출력 바이트, SHA-256, HTML 구조와 adapter 갱신 정책이 모두 통과한 뒤에만 결과를 기록한다.

주요 측정값은 새 페이지 프로세스 시간과 최대 상주 메모리다. 반복 렌더 시간, parse·compile 횟수, artifact 빌드 시간, 출력 크기와 hash는 추가 정보로 기록한다. 전체 결과는 `project-performance/results/all.md`와 `all.json`에 기록한다.
