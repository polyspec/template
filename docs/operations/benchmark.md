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
| TypeScript | AST | 131.36 ms | 0.0079 ms | 0.0020 ms | 92.67 MiB |
| TypeScript | generated | 154.38 ms | 0.0096 ms | 0.0015 ms | 92.31 MiB |
| Go | AST | 10.72 ms | 0.0039 ms | 0.0023 ms | 11.30 MiB |
| Go | generated | 11.63 ms | 0.0046 ms | 0.0009 ms | 10.72 MiB |
| Rust | AST | 8.20 ms | 0.0053 ms | 0.0023 ms | 2.78 MiB |
| Rust | generated | 7.81 ms | 0.0054 ms | 0.0021 ms | 2.55 MiB |
| Php | AST | 76.31 ms | 0.0209 ms | 0.0127 ms | 28.09 MiB |
| Php | generated | 79.11 ms | 0.0157 ms | 0.0055 ms | 28.27 MiB |
<!-- benchmark-results:end -->

Generated mode improves prepared rendering in all four implementations. Go and Rust show that request binding can dominate a very small page: Go generated full render is slower than AST even though its prepared renderer is faster, while Rust is approximately equal at full-render scale. Keep both measurements when choosing a mode; a prepared-render number alone does not describe complete request cost.

The committed JSON contains the exact median, P95, compiler and artifact-size values used by the example site. Absolute values depend on the machine and toolchain, so compare modes from one run rather than combining results from different runs.
