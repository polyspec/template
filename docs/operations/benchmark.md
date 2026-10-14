<!-- doc-id: docs-operations-benchmark -->
# Performance measurements

Run the production-artifact benchmark with:

```sh
make bench
```

The benchmark uses one `scope-precedence` request for TypeScript, Go, Rust and PHP in both `ast` and `generated` modes. Every row receives the same assign and define values, renders 177 UTF-8 bytes with the same SHA-256, and runs with the final-page cache disabled. A mismatched output, repeated output or prepared output aborts the run before results are written.

Each row contains 21 independent cold-process samples and 21 independent persistent-process samples of 1,000 renders after 20 warmups. The report records median and P95 for:

- compiler time: source parsing and AST artifact creation; generated mode also includes typed IR lowering and host-source emission;
- cold process time and peak RSS;
- full `Program.render` time, including request binding;
- prepared render time after one `Program.prepare` call;
- persistent process time per render and peak RSS;
- artifact bytes and exact output identity.

`PreparedRender` is a separate metric because it measures generated control flow without repeatedly normalizing the same request. It is the relevant path when one normalized request is rendered more than once. Full render remains the request-level cost and must be considered for one-shot rendering.

The current 21-sample run produced these medians:

<!-- benchmark-results:start -->
| Language | Mode | Cold process | Full render | Prepared render | Persistent RSS |
| --- | --- | ---: | ---: | ---: | ---: |
| TypeScript | AST | 192.71 ms | 0.0159 ms | 0.0044 ms | 95.58 MiB |
| TypeScript | generated | 180.80 ms | 0.0125 ms | 0.0024 ms | 93.55 MiB |
| Go | AST | 15.36 ms | 0.0058 ms | 0.0030 ms | 11.27 MiB |
| Go | generated | 12.77 ms | 0.0055 ms | 0.0014 ms | 10.72 MiB |
| Rust | AST | 10.84 ms | 0.0073 ms | 0.0036 ms | 2.78 MiB |
| Rust | generated | 10.29 ms | 0.0056 ms | 0.0029 ms | 2.53 MiB |
| Php | AST | 146.72 ms | 0.0243 ms | 0.0163 ms | 28.11 MiB |
| Php | generated | 119.88 ms | 0.0168 ms | 0.0068 ms | 28.25 MiB |
<!-- benchmark-results:end -->

Generated mode improves prepared rendering in all four implementations. Go and Rust show that request binding can dominate a very small page: Go generated full render is slower than AST even though its prepared renderer is faster, while Rust is approximately equal at full-render scale. Keep both measurements when choosing a mode; a prepared-render number alone does not describe complete request cost.

The committed JSON contains the exact median, P95, compiler and artifact-size values used by the example site. Absolute values depend on the machine and toolchain, so compare modes from one run rather than combining results from different runs.
