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
| TypeScript | AST | 167.76 ms | 0.0127 ms | 0.0029 ms | 93.81 MiB |
| TypeScript | generated | 184.45 ms | 0.0094 ms | 0.0021 ms | 92.53 MiB |
| Go | AST | 17.05 ms | 0.0038 ms | 0.0020 ms | 11.30 MiB |
| Go | generated | 10.93 ms | 0.0067 ms | 0.0009 ms | 10.98 MiB |
| Rust | AST | 10.20 ms | 0.0056 ms | 0.0024 ms | 2.83 MiB |
| Rust | generated | 16.35 ms | 0.0066 ms | 0.0024 ms | 2.58 MiB |
| Php | AST | 94.13 ms | 0.0214 ms | 0.0121 ms | 28.08 MiB |
| Php | generated | 103.54 ms | 0.0165 ms | 0.0066 ms | 28.20 MiB |
<!-- benchmark-results:end -->

Generated mode improves prepared rendering in all four implementations. Go and Rust show that request binding can dominate a very small page: Go generated full render is slower than AST even though its prepared renderer is faster, while Rust is approximately equal at full-render scale. Keep both measurements when choosing a mode; a prepared-render number alone does not describe complete request cost.

The committed JSON contains the exact median, P95, compiler and artifact-size values used by the example site. Absolute values depend on the machine and toolchain, so compare modes from one run rather than combining results from different runs.
