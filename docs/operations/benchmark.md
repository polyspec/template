<!-- doc-id: docs-operations-benchmark -->
# Performance measurements

Run the production-artifact benchmark with:

```sh
make bench
```

The benchmark uses one `scope-precedence` request for TypeScript, Go, Rust, PHP and Python in both `ast` and `generated` modes; the PHP extension is a separate implementation in C with no generated program operation, so it has no measurement row. Every row receives the same assign and define values, renders 177 UTF-8 bytes with the same SHA-256, and runs with the final-page cache disabled. A mismatched output, repeated output or prepared output aborts the run before results are written. The conformance suite checks the output parity of the PHP extension.

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
| TypeScript | AST | 94.74 ms | 0.0120 ms | 0.0022 ms | 109.05 MiB |
| TypeScript | generated | 99.12 ms | 0.0093 ms | 0.0019 ms | 108.31 MiB |
| Go | AST | 12.07 ms | 0.0036 ms | 0.0017 ms | 13.31 MiB |
| Go | generated | 8.50 ms | 0.0051 ms | 0.0006 ms | 12.75 MiB |
| Rust | AST | 9.53 ms | 0.0047 ms | 0.0021 ms | 6.05 MiB |
| Rust | generated | 5.35 ms | 0.0044 ms | 0.0016 ms | 2.95 MiB |
| Php | AST | 98.51 ms | 0.0214 ms | 0.0131 ms | 29.02 MiB |
| Php | generated | 91.54 ms | 0.0255 ms | 0.0067 ms | 26.91 MiB |
| Python | AST | 137.66 ms | 0.0347 ms | 0.0146 ms | 34.27 MiB |
| Python | generated | 112.87 ms | 0.0274 ms | 0.0099 ms | 34.11 MiB |
<!-- benchmark-results:end -->

Generated mode improves prepared rendering in every measured pair. Go and PHP show that request binding can dominate a very small page: Go generated full render is slower than AST even though its prepared renderer is faster, and PHP shows the same pattern. Keep both measurements when choosing a mode; a prepared-render number alone does not describe complete request cost.

The committed JSON contains the exact median, P95, compiler and artifact-size values used by the example site. Absolute values depend on the machine and toolchain, so compare modes from one run rather than combining results from different runs.
