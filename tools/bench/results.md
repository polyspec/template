# Benchmark results

Renders per second and microseconds per render, measured with 5,000 renders per fixture and implementation after 500 unmeasured renders.

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

| Fixture     | ts ops/s | ts µs | go ops/s | go µs | rust ops/s | rust µs | php ops/s | php µs |
| ----------- | -------- | ----- | -------- | ----- | ---------- | ------- | --------- | ------ |
| composition | 17,276   | 57.9  | 51,661   | 19.4  | 54,266     | 18.4    | 10,469    | 95.5   |
| expression  | 9,044    | 110.6 | 9,220    | 108.5 | 10,657     | 93.8    | 1,076     | 929.5  |
| functions   | 5,212    | 191.9 | 6,018    | 166.2 | 5,582      | 179.1   | 1,188     | 841.6  |
| loop        | 5,559    | 179.9 | 7,104    | 140.8 | 7,382      | 135.5   | 977       | 1023.9 |
| text        | 152,616  | 6.6   | 585,409  | 1.7   | 677,105    | 1.5     | 121,192   | 8.3    |
