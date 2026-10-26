<!-- doc-id: rebuild-publish-build -->
# Rebuild record: publish-build

[한국어](/ko/rebuild/publish-build)

Verdict: **none fits.** The repository keeps its own publication of a build output. Measured on 2026-10-20.

## Covers

- `scripts/publish-build.mts`

## Requirement

The checks run executables and shared libraries that a build produces (the Go and Rust command line interfaces and the PHP
extension). cargo links `target/release/<binary>` again on every build and go build rewrites its output, so every build
leaves a new file even when nothing changed, and macOS checks a new executable on its first run (29.8 s for the Rust command on
a loaded machine, past the 10 s limit of a conformance call).

| Item | Requirement |
|---|---|
| P1 | the destination keeps its file while the bytes of the build equal it |
| P2 | changed bytes replace the destination by a rename, so a reader never finds a missing or half written file |
| P3 | the mode of the build is the mode of the destination |
| P4 | it runs on every platform of the repository without a tool outside Node.js |

## Tools evaluated

| Tool | Verdict |
|---|---|
| `install -C -S` (BSD, macOS) | copies only when the content differs (P1) through a temporary file and a rename (P2), but the options `-S` and `-C` together exist only in the BSD `install`; the `install` of coreutils has no `-S` and Windows has none (P4) |
| `rsync --checksum` | skips equal files and writes through a temporary file (P1, P2) but is not on every platform (P4) |
| `cp -u`, `cmake -E copy_if_different` | the first compares times and the second needs CMake, and neither renames (P2, P4) |
| `write-file-atomic` (npm) | writes through a temporary file and a rename (P2) but writes the content it is given and compares nothing (P1) |

## Why none fits

P1 and P2 together, on every platform with only Node.js, are not met by one tool; the script is 20 lines of `node:fs`
(`readFileSync` compare, `copyFileSync` to a temporary name, `chmodSync`, `renameSync`).

## Retry condition

Revisit when `write-file-atomic` or a tool of the ecosystems of the repository skips equal content, or when cargo and go build
publish an unchanged output without a new file.
