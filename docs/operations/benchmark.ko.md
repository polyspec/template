# 벤치마크 절차

전체 페이지 벤치마크는 `project performance measurements`에 있다. 다음과 같이 실행한다.

```sh
cd project performance measurements
make bench-all
```

비교 엔진은 모두 생성 모드로 실행한다. 검사 대상 구현은 각 언어에서 `ast`와 `gen`을 각각 실행한다. 두 실행은 같은 페이지 픽스처, 입력 데이터, 워밍업 횟수, 측정 반복 횟수와 바이트 단위 출력 해시를 사용한다. 결과는 `project-performance/results/all.md`와 `all.json`에 기록한다.
