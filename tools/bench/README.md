# Benchmark

[한국어](README.ko.md).

The benchmark measures how many times per second each implementation renders the same template with the same data.

## Run

`make bench` builds every selected core driver, measures every fixture in every core implementation, prints the table and writes `tools/bench/results.md`. `make bench-ts`, `make bench-php`, `make bench-go`, `make bench-rust` and `make bench-php-ext` measure one implementation.

| Option | Effect |
| --- | --- |
| `--langs a,b` | Measure the listed implementations. Default: every core implementation whose package exists; `php-ext` is opt-in. |
| `--fixture NAME` | Measure one fixture. Default: every fixture. |
| `--fixtures-dir DIR` | Read fixtures from another directory. |
| `--iters N` | Measured renders per fixture and implementation. Default 50000. |
| `--warmup N` | Unmeasured renders before the measurement. Default 5000. |
| `--output-md FILE` | Write the Markdown table to FILE. |
| `--output-json FILE` | Write the raw measurements to FILE. |
| `--json` | Print the raw measurements and write no table. |

Fixture `bench.json` may set `target` to the template passed to every driver instead of `input.tpl`, and `measurements` to the number of independent process samples. The default is `input.tpl` and one sample.

## What it measures

Each driver reads the template files of a fixture into a map loader, reads `data.json`, `define.json` and `env.json`, renders once to parse the templates and fill the engine cache, renders `--warmup` times without measuring, then measures `--iters` renders. It renders once more after the measured loop and records a second output hash, so the runner also checks repeatability on the same engine instance. The measurement therefore covers rendering, not parsing and not file system access.

Each driver prints one JSON line with the elapsed seconds, the SHA-256 of the rendered output and the second-render SHA-256. The runner compares the hashes of a fixture across the implementations, rejects a changed second hash and fails when two implementations produce different output, because a timing comparison of different work means nothing.

## Fixtures

A fixture is a directory under `tools/bench/fixtures/` that holds `input.tpl`, further `.tpl` files, `bench.json` with a name and a description, and the optional `data.json`, `define.json` and `env.json`. The default template name is `input.tpl`; `bench.json.target` can select another entry template, and `bench.json.measurements` can request repeated independent samples. The loader root is the fixture directory.

| Fixture | Content |
| --- | --- |
| `text` | A page that is mostly static text with a few echo tags. |
| `loop` | A loop over 100 rows with loop metadata, conditions and escaped output. |
| `expression` | Arithmetic, comparisons, logical operators, coalescing, ternaries and pipes over 40 items. |
| `composition` | A layout with an include, template definitions, a nested definition and scope arguments. |
| `functions` | Number, date, json, url, join, sort and string functions over 30 entries. |

## Results

`tools/bench/results.md` holds the table of the last general run. The executable example site stores its raw measurements in `examples/site/data/benchmark.json`. Absolute times depend on the machine, the toolchain versions and the load during the run. Only the ratios within one run are comparable.

## Resource measurements
