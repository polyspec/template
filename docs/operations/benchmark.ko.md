# 성능 측정

예제 사이트는 다음 명령으로 이 구현의 반복 가능한 측정값을 기록한다.

```sh
make showcase
```

AST와 generated 모드는 같은 시나리오 source graph, assign 데이터, definitions와 기대 HTML을 사용한다. 출력 바이트, SHA-256과 반복 렌더 동일성이 통과한 뒤에만 측정을 시작한다. 최종 페이지 캐시는 사용하지 않는다.

사이트의 시나리오별 warm render 측정값은 원인 분석용 데이터다. 이 값은 한 실행 안에서 런타임 비용을 비교하며 cold process 또는 전체 요청 시간을 뜻하지 않는다. Generated artifact는 렌더 측정 전에 만들고, AST 측정은 커밋된 parsed artifact를 사용한다.
