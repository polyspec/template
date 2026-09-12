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

| Fixture     | ts ops/s | ts µs | go ops/s | go µs | rust ops/s | rust µs | php ops/s | php µs |
| ----------- | -------- | ----- | -------- | ----- | ---------- | ------- | --------- | ------ |
| composition | 17,325   | 57.7  | 52,780   | 18.9  | 57,881     | 17.3    | 9,913     | 100.9  |
| expression  | 9,487    | 105.4 | 9,245    | 108.2 | 10,443     | 95.8    | 1,070     | 935.0  |
| functions   | 5,122    | 195.2 | 5,929    | 168.7 | 5,616      | 178.1   | 1,186     | 843.3  |
| loop        | 5,680    | 176.1 | 7,242    | 138.1 | 7,504      | 133.3   | 957       | 1045.3 |
| text        | 159,507  | 6.3   | 606,765  | 1.6   | 716,772    | 1.4     | 120,068   | 8.3    |
