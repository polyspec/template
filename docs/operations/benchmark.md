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
| TypeScript | AST | 132.97 ms | 0.0113 ms | 0.0034 ms | 93.20 MiB |
| TypeScript | generated | 163.04 ms | 0.0100 ms | 0.0016 ms | 91.97 MiB |
| Go | AST | 9.75 ms | 0.0035 ms | 0.0018 ms | 11.28 MiB |
| Go | generated | 10.44 ms | 0.0050 ms | 0.0011 ms | 10.75 MiB |
| Rust | AST | 7.78 ms | 0.0061 ms | 0.0027 ms | 2.81 MiB |
| Rust | generated | 7.41 ms | 0.0045 ms | 0.0018 ms | 2.53 MiB |
| Php | AST | 87.45 ms | 0.0202 ms | 0.0133 ms | 28.11 MiB |
| Php | generated | 84.69 ms | 0.0156 ms | 0.0063 ms | 28.28 MiB |
<!-- benchmark-results:end -->

Generated mode improves prepared rendering in all four implementations. Go and Rust show that request binding can dominate a very small page: Go generated full render is slower than AST even though its prepared renderer is faster, while Rust is approximately equal at full-render scale. Keep both measurements when choosing a mode; a prepared-render number alone does not describe complete request cost.

The committed JSON contains the exact median, P95, compiler and artifact-size values used by the example site. Absolute values depend on the machine and toolchain, so compare modes from one run rather than combining results from different runs.
