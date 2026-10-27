<!-- doc-id: docs-operations-publication -->
# Publication

[한국어](/ko/operations/publication).

Release archives are distributed as GitHub Release assets. The following commands install packages from local source checkouts. Registry publication is recorded in `docs/features.md` when it happens.

## Local installation

Go module:

```
go work init . ../template/packages/go
```

A Go module resolves the checkout through a `go.work` of the consumer, never a `replace` of its `go.mod`, which a released module would not see.

npm package:

```json
{ "dependencies": { "@polyspec/template": "file:../template/packages/ts" } }
```

Composer package:

```json
{
  "repositories": [{ "type": "path", "url": "../template/packages/php" }],
  "require": { "polyspec/template": "@dev" }
}
```

Cargo crate:

```toml
[dependencies]
polyspec-template = { path = "../template/packages/rust" }
```

Python package, from the wheel of the release asset `polyspec_template-X.Y.Z-py3-none-any.whl`:

```sh
pip install ./polyspec_template-X.Y.Z-py3-none-any.whl
```

## Version

Release versions are synchronized across the manifests of `config/release.json`. The version changes together in every package, in the consumer projects of `tests/fixtures/release-consumer` with the locks that `make release-consumer-lock TAG=vX.Y.Z` writes, and in `CHANGELOG.md`, whose section `## Unreleased` above the released versions holds the entries of every change since the last release.

## Tag releases

A release is a tag of a commit of `main` (AGENTS, T22.1-4): `vX.Y.Z` releases the npm packages `@polyspec/template`, `@polyspec/template-language`, `@polyspec/template-lsp`, `@polyspec/template-codemirror` and `@polyspec/template-compiler`, and the Composer packages `polyspec/template`, `polyspec/template-cli` and `polyspec/template-php-ext` at version X.Y.Z, and `packages/go/vX.Y.Z` releases the Go module `github.com/polyspec/template/packages/go`. The Cargo package `polyspec-template` carries the version X.Y.Z but is not released as an archive; it is consumed by git tag, as the `git-tag` distribution and its install proof declared in `config/release.json`. The Python package `polyspec-template` (`packages/python`, the package kind `wheel` of `config/release.json`) carries the version X.Y.Z and is released as its PEP 427 wheel `polyspec_template-X.Y.Z-py3-none-any.whl`, built from the tagged commit with the build backend that `pythonBackend` of `config/toolchain.json` pins by version and sha256 (`setuptools==84.2.1`). Its metadata declares the pinned runtime dependencies of `packages/python/pyproject.toml`, whose complete dependency graph and hashes are held by `packages/python/pylock.toml`; the development dependency group is not a requirement of the wheel. The push of the tag runs `.github/workflows/release.yml` (`on: push: tags: ['v*', '**/v*']`, permission `contents: write`; in a tag filter `*` does not match `/`, so `**/v*` covers the tag of a Go module at any depth), which is not the job `release` of `ci.yml`. After the bootstrap and `make release-tools`, its steps run the installed release targets (the packages, manifests and Go module are data in `config/release.json`) in this order and stop at the first failure:

```sh
make release-verify
make release-versions
make release-assets
make release-publish
make release-proof
make release-undraft
```

1. `make release-verify` requires the tagged commit to be an ancestor of `origin/main` (`git merge-base --is-ancestor`), the tag `packages/go/vX.Y.Z` of the Go module at the same commit, and the latest check run `ci-passed` of that commit (`gh api repos/<repository>/commits/<sha>/check-runs`) to be completed with the conclusion `success`; it names a missing or failed check and does not run the tests again.
2. `make release-versions` requires every declared manifest version to equal X.Y.Z and both changelogs to contain `## X.Y.Z`. Composer manifests may omit `version` and take their version from the tag. For `packages/go/vX.Y.Z` it checks the module path of `packages/go/go.mod` and the changelog section.
3. `make release-assets` builds the npm packages and writes `var/release/assets`: `npm pack` of each npm package (`.tgz`), `git archive` of the directory of each Composer package of the tagged commit at the time of the commit (`.zip`), and the wheel of the Python package (`.whl`, `pip wheel --no-deps --no-index` with the pinned build backend of `var/tools/wheels`, `SOURCE_DATE_EPOCH` set to the time of the commit). The step fails unless the wheel's METADATA names the package and the tag's version and holds only `name==version` Requires-Dist lines. The release assets are npm tarballs, Composer zips and the wheel. An archive is named `<package>-<language>-<version>.<ext>`, with `@scope/` and `vendor/` written as `scope-` and `vendor-` and the language `npm` or `php`: `polyspec-template-npm-X.Y.Z.tgz` is `@polyspec/template`, `polyspec-template-language-npm-X.Y.Z.tgz` is `@polyspec/template-language`, `polyspec-template-php-X.Y.Z.zip` is `polyspec/template` and `polyspec-template-php-ext-php-X.Y.Z.zip` is `polyspec/template-php-ext`. A Go tag builds and attaches nothing: `release-assets` builds the npm packages only for a tag without `/`. Each archive carries the manifest of its package unchanged: the published manifests of the tree are the published packages. The step then fails unless every packed manifest equals its manifest at the tagged commit and names each dependency of a scope of this repository by an exact version, a package of this repository by X.Y.Z, declares no `overrides`, and unless each `composer.json` declares no `repositories`; Composer manifests may omit `version` and take their version from the tag (`manifestProblems`): a path (`file:`, `link:`, `workspace:`), a git source (`git`, `github:`, ssh), a URL, a range or a development version installs only inside the repository.
4. `make release-publish` creates a draft through the GitHub API and uploads the archives. A draft from an earlier run is replaced; a public release is never replaced. The notes are the section `## X.Y.Z` of `CHANGELOG.md` when it has at most 125000 characters (`NOTES_LIMIT`), the limit of a release body on GitHub; a longer section is replaced by one line, `The changes of X.Y.Z are listed in [CHANGELOG.md](https://github.com/polyspec/template/blob/<tag>/CHANGELOG.md#XYZ).`, whose anchor is the version without its dots.

5. `make release-proof` verifies the draft assets, exact consumer installs, Rust git dependency and Go module tags from outside the checkout. Only its success allows `make release-undraft` to make the release public. A failure leaves the release as a draft.

The release workflow runs `make release-tools` before `make release-assets`, which installs the Python of `mise.toml` and the build backend `pythonBackend` of `config/toolchain.json`, because the wheel is built by that Python.

The release workflow runs once for each pushed tag. `make release-verify` of the tag `vX.Y.Z` requires the tag `packages/go/vX.Y.Z` at the same commit, so the maintainer pushes the Go tag before the tag `vX.Y.Z`, or in the same push; the run of the Go tag builds no archive and creates a draft without assets, proves the Go module, and makes that release public.

The tag reaches the steps through the environment variable `TAG`. kit tests its steps against a fixture repository in its own repository. `make release-consumer TAG=vX.Y.Z` installs the archives of `var/release/assets` in a directory outside the repository with the consumer projects of `tests/fixtures/release-consumer` (`node_modules/@polyspec/kit/scripts/kit/release-consumer.mts`, `consumers` in `config/release.json`): `npm ci` of every npm package with an empty cache and the scope `@polyspec` on an unreachable registry, and `composer install` of `polyspec/template` with an empty `COMPOSER_HOME` and cache and an `artifact` repository of the zips, and runs the smoke command of each package. Their committed locks pin each registry package by exact version and integrity and record the archives under test, which each run builds, by name and version only, without `integrity` or with an empty `shasum`; `make release-consumer-lock TAG=vX.Y.Z` writes them from the archives of that tag, so they change only with a version or a dependency. `make release-coverage` requires every tracked manifest to be in `manifests` of `config/release.json` with how the tag releases it (`archive`, `version`, or `git-tag` for the Rust crate, which is consumed by git tag) or in `notReleased` with its reason, and `tests/scripts/toolchain-files.test.mts` requires the trigger, the permission and the order of the steps.

After the draft exists, `make release-proof TAG=vX.Y.Z` (online, `node_modules/@polyspec/kit/scripts/kit/release-proof.mts`) proves it from outside the checkout, and belongs to no check: the assets of the GitHub Release are exactly the archives of the version and install together in the consumer projects, the wheel of the Python package installs with `pip install --no-index --require-hashes --no-deps` into a new virtual environment (`make release-consumer` runs the same install from var/release/assets) and `python -c "import polyspec.template"` passes, the Rust crate `polyspec-template` builds as a git dependency of a new crate, and `go list -m` resolves the Go module at its tag. `tests/scripts/release-config.test.mts` checks that `config/release.json` names these packages as their manifests declare them.

## Installing the release assets

No polyspec package is published to a registry before 0.1. A consumer downloads the archives of a GitHub Release, `https://github.com/polyspec/template/releases/download/vX.Y.Z/<archive>`, and installs them together; each archive names the polyspec packages it depends on by name and exact version, and the archive of that version beside it satisfies the dependency.

npm: list every needed tarball as a `file:` dependency. `@polyspec/template-language`, `@polyspec/template-lsp`, `@polyspec/template-codemirror` and `@polyspec/template-compiler` depend on `@polyspec/template-language` or `@polyspec/template` at X.Y.Z, so the tarball of that package is listed too:

```json
{
  "dependencies": {
    "@polyspec/template": "file:vendor/polyspec-template-X.Y.Z.tgz",
    "@polyspec/template-language": "file:vendor/polyspec-template-language-X.Y.Z.tgz"
  }
}
```

`npm install` installs the polyspec packages from the tarballs alone; the other dependencies of `@polyspec/template-lsp` and `@polyspec/template-codemirror` come from the npm registry.

Composer: either an `artifact` repository, the directory that holds the downloaded zips,

```json
{
  "repositories": [{ "type": "artifact", "url": "vendor/polyspec" }],
  "require": { "polyspec/template": "X.Y.Z" }
}
```

or one `package` repository entry per zip URL, with the name, version and `dist` of the zip:

```json
{
  "repositories": [{
    "type": "package",
    "package": {
      "name": "polyspec/template",
      "version": "X.Y.Z",
      "type": "library",
      "require": { "php": ">=8.4", "ext-mbstring": "*" },
      "autoload": { "psr-4": { "Polyspec\\Template\\": "src/" } },
      "dist": { "type": "zip", "url": "https://github.com/polyspec/template/releases/download/vX.Y.Z/polyspec-template-X.Y.Z.zip" }
    }
  }],
  "require": { "polyspec/template": "X.Y.Z" }
}
```

A `package` entry replaces the `composer.json` of the zip, so it repeats its `require` and `autoload`. Composer installs no package of the type `php-ext`: the zip of `polyspec/template-php-ext` is the C source that PIE builds and installs the extension from, with no PHP classes and no command. The PHP side of the extension is in `polyspec/template`: the command `vendor/bin/template.php` runs on the classes of the extension when PHP loads it, and on the PHP implementation of the library when it does not.

In the repository, the private root `package.json`, which is not published, resolves the npm packages of the repository: its `workspaces` name the directory of each of them, and npm links each into `node_modules`. The root `composer.json`, which is not published either, resolves the Composer packages the same way: its `path` repository names `packages/php`, Composer links it into the root `vendor/` and the root `composer.lock` records it, and its autoload-dev maps the tests of `packages/php-ext`, a package of the type `php-ext` that Composer does not install. The published `package.json` and `composer.json` of each package name the polyspec packages they depend on by exact version only, and each `composer.json` declares its version, which every release sets with the other manifests; a published `composer.json` declares no `repositories` and has no `composer.lock`, as a library commits none. No package of the repository depends on a polyspec package of another repository, so no release tag of another repository is recorded.

## Documentation site

The online documentation is a static VitePress site. After a push to `main`, the `pages` job builds `docs/.vitepress/dist` with `make docs-static-check`, downloads the artifact `example-site` that the job `showcase` of the CI run of the same commit built (the pages workflow runs after a successful CI run of `main`), copies it to `examples/site/`, and deploys that directory as the Pages artifact. The job `docs` and the job `showcase` of `ci.yml` verify the documents and the showcase on the same push, so publication does not repeat those gates. The showcase does not ship a parser or renderer to the browser. The build passes `VITEPRESS_BASE` for the repository path so links and assets work under `/<repository>/` without a server-side program.

The documentation build discovers every `*.ko.md` translation pair and publishes it under `/ko/`. VitePress locale configuration supplies Korean navigation and `ko-KR` HTML metadata throughout that route tree. The static-site gate rejects suffix-style output routes, navigation that leaves the active locale, incorrect HTML language metadata and unresolved theme interpolation.

To reproduce the published artifact locally:

```sh
VITEPRESS_BASE=/template/ make docs-static-check
```

Pages selects the declared PHP and installs the locked tool package before make reads its bootstrap, then installs the checkout toolchain. Its artifact must come from the successful CI run of the same commit.
