# 성능 측정

제품 산출물 벤치마크는 다음 명령으로 실행한다.

```sh
make bench
```

벤치마크는 TypeScript, Go, Rust, PHP의 `ast`와 `generated` 모드에 동일한 `scope-precedence` 요청을 전달한다. 모든 행은 같은 assign과 define 값을 받고 같은 SHA-256을 갖는 UTF-8 177바이트를 출력하며 최종 페이지 캐시는 사용하지 않는다. 최초 출력, 반복 출력, prepared 출력 중 하나라도 다르면 결과를 기록하기 전에 실패한다.

각 행은 독립 cold process 21표본과 20회 준비 실행 뒤 1,000번 렌더하는 독립 persistent process 21표본으로 구성된다. 다음 항목의 중앙값과 P95를 기록한다.

- 컴파일 시간: source parsing과 AST artifact 생성. generated 모드는 typed IR lowering과 호스트 소스 생성도 포함한다.
- cold process 시간과 peak RSS
- 요청 바인딩을 포함한 전체 `Program.render` 시간
- `Program.prepare`를 한 번 호출한 뒤의 prepared render 시간
- 렌더당 persistent process 시간과 peak RSS
- artifact 바이트와 정확한 출력 식별값

`PreparedRender`는 같은 요청을 반복해서 정규화하지 않고 generated 제어 흐름을 측정하기 때문에 별도 지표로 둔다. 하나의 정규화된 요청을 여러 번 렌더할 때 이 경로를 사용한다. 한 번만 렌더하는 요청의 비용은 전체 render 수치로 판단해야 한다.

현재 21표본 실행의 중앙값은 다음과 같다.

<!-- benchmark-results:start -->
| 언어 | 모드 | Cold process | 전체 render | Prepared render | Persistent RSS |
| --- | --- | ---: | ---: | ---: | ---: |
| TypeScript | AST | 78.01 ms | 0.0050 ms | 0.0017 ms | 88.02 MiB |
| TypeScript | generated | 85.32 ms | 0.0053 ms | 0.0009 ms | 89.31 MiB |
| Go | AST | 4.39 ms | 0.0037 ms | 0.0017 ms | 11.20 MiB |
| Go | generated | 6.51 ms | 0.0064 ms | 0.0012 ms | 11.14 MiB |
| Rust | AST | 4.46 ms | 0.0054 ms | 0.0022 ms | 2.81 MiB |
| Rust | generated | 8.33 ms | 0.0046 ms | 0.0019 ms | 2.52 MiB |
| Php | AST | 66.69 ms | 0.0140 ms | 0.0086 ms | 27.98 MiB |
| Php | generated | 60.46 ms | 0.0128 ms | 0.0042 ms | 27.98 MiB |
<!-- benchmark-results:end -->

Generated 모드는 네 구현 모두에서 prepared render를 개선했다. 작은 페이지에서는 요청 바인딩이 지배적인 비용이 될 수 있다. Go generated의 전체 render는 AST보다 느리지만 prepared renderer는 더 빠르고, Rust의 전체 render는 두 모드가 비슷하다. 모드를 선택할 때 두 측정값을 함께 봐야 하며 prepared render 하나만으로 전체 요청 비용을 설명할 수 없다.

커밋된 JSON에는 예제 사이트가 사용하는 정확한 중앙값, P95, compiler와 artifact 크기 값이 들어 있다. 절대 수치는 머신과 도구 체인에 영향을 받으므로 서로 다른 실행 결과를 섞지 말고 한 실행 안에서 모드를 비교한다.
