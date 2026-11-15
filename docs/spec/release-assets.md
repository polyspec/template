<!-- doc-id: spec-release-assets -->
# Release asset workflow

[한국어](/ko/spec/release-assets).

The `platform` job of `.github/workflows/assets.yml` builds the Go static library, Python wheel and npm platform package
once for each native platform. Its matrix contains only three explicit include rows: `linux-x64-gnu` on `ubuntu-26.04`,
`linux-arm64-gnu` on `ubuntu-26.04-arm`, and `darwin-arm64` on `macos-15`. It performs no PHP setup or extension build.

The independent `php` job contains only explicit include rows for those same platform-runner pairs crossed with every
minor of `phpExtension.minors` in `config/toolchain.json`. Each row declares `platform`, `runner` and `php`; no extra axis,
exclude rule or inline build expands or hides the six declared builds. `runs-on` selects `matrix.runner`, and each matrix
uses `fail-fast: false` so another row's failure does not cancel a diagnostic result.

Each PHP row checks out the selected ref with full history, bootstraps its locked packages, installs Rust and its locked
crates, writes release recipes and installs the declared LLVM. It runs the conditional release check before building.
Exactly one pinned setup-php action selects `matrix.php`, with no tools or coverage, before exactly one
<code v-pre>make release-php-ext PHP=php EXPECTED_PHP_MINOR=${{ matrix.php }}</code>. The expected minor is a required recipe input: the
running PHP and its configuration must match it before compilation. PHP setup in another job does not establish this
job's PHP version.

Each PHP row uploads only `var/release/assets/` as <code v-pre>assets-php-${{ matrix.platform }}-${{ matrix.php }}</code>. The non-PHP rows
use <code v-pre>assets-${{ matrix.platform }}</code> and the standalone npm job uses `assets-npm`. Each build command has one job owner;
an extra, missing or duplicate owner, wrong runner, wrong minor, setup after a build or colliding artifact name fails the
workflow's unit owner. Setup, preparation, builds and upload retain `!cancelled()` guards; the release check also requires
`inputs.release`. Each job owns all tools and locked inputs it executes.

The source workflow implements this isolation contract, checked by the T28.60 unit owners and mutation tests.
The installed generated release recipes do not yet enforce `EXPECTED_PHP_MINOR`; adoption of recipes with that guard and
native CI execution remain separate verification gates. Source workflow tests do not establish a native release build.
