# Benchmark procedure

The complete page benchmark lives in `project performance measurements`. Run it with:

```sh
cd project performance measurements
make bench-all
```

Every comparison engine runs in its generated mode. The implementation under test runs twice for each language: `ast` interprets the prepared AST and `gen` uses the prepared generated renderer. Both runs use the same page fixture, input data, warmup count, measured iterations and byte-exact output hash. The result is written to `project-performance/results/all.md` and `all.json`.
