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
| TypeScript | AST | 90.25 ms | 0.0062 ms | 0.0019 ms | 92.47 MiB |
| TypeScript | generated | 94.16 ms | 0.0063 ms | 0.0010 ms | 90.55 MiB |
| Go | AST | 5.21 ms | 0.0026 ms | 0.0014 ms | 10.70 MiB |
| Go | generated | 5.53 ms | 0.0054 ms | 0.0010 ms | 10.84 MiB |
| Rust | AST | 4.70 ms | 0.0047 ms | 0.0023 ms | 2.78 MiB |
| Rust | generated | 4.39 ms | 0.0047 ms | 0.0019 ms | 2.52 MiB |
| Php | AST | 66.16 ms | 0.0146 ms | 0.0090 ms | 28.05 MiB |
| Php | generated | 63.28 ms | 0.0134 ms | 0.0042 ms | 27.98 MiB |
<!-- benchmark-results:end -->

Generated mode improves prepared rendering in all four implementations. Go and Rust show that request binding can dominate a very small page: Go generated full render is slower than AST even though its prepared renderer is faster, while Rust is approximately equal at full-render scale. Keep both measurements when choosing a mode; a prepared-render number alone does not describe complete request cost.

The committed JSON contains the exact median, P95, compiler and artifact-size values used by the example site. Absolute values depend on the machine and toolchain, so compare modes from one run rather than combining results from different runs.
