# Benchmark procedure

The complete page benchmark lives in `project performance measurements`. Run it with:

```sh
cd project performance measurements
make bench-all
```

The benchmark records compilation mode and compiled-artifact refresh separately. The implementation under test runs `ast` and `gen` with the same fixture and input. The uncached parse track uses `refresh=dev`, which parses the source on every call. The generated track uses generated host-language source built before timing. Final-page caching is disabled so business logic and rendered HTML caching do not hide template work.

Measured adapters use the same output bytes, input data, iteration counts and validation. Dynamic adapters parse or compile on every measured render; static generated adapters record their build-time compilation separately. A result is written only after output bytes, SHA-256, HTML structure and the adapter's refresh policy pass.

Primary measurements are cold page process time and maximum resident memory. Persistent render time, parse/compile counts, artifact build time, output size and hash are diagnostic measurements. The full report is written to `project-performance/results/all.md` and `all.json`.
