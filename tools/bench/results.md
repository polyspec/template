# Benchmark results

Renders per second and microseconds per render, measured with 50,000 renders per fixture and implementation after 5,000 unmeasured renders.

Absolute times depend on the machine, the toolchain versions and the load during the run. Only the ratios within one run are comparable. The run fails when two implementations produce different output for a fixture.

Regenerate this file with `make bench`.

## Fixtures

| Fixture     | Content                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------ |
| composition | A layout with an include, template definitions, a nested definition and scope arguments.   |
| expression  | Arithmetic, comparisons, logical operators, coalescing, ternaries and pipes over 40 items. |
| functions   | Number, date, json, url, join, sort and string functions over 30 entries.                  |
| loop        | A loop over 100 rows with loop metadata, conditions and escaped output.                    |
| text        | A page that is mostly static text with a few echo tags.                                    |

## Results

| Fixture     | rust ops/s | rust µs |
| ----------- | ---------- | ------- |
| composition | 58,478     | 17.1    |
| expression  | 10,257     | 97.5    |
| functions   | 5,278      | 189.5   |
| loop        | 7,486      | 133.6   |
| text        | 698,526    | 1.4     |
