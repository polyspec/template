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

Release versions are synchronized across the manifests of `config/release.json`. The version changes together in every package and in `CHANGELOG.md`, whose section `## Unreleased` above the released versions holds the entries of every change since the last release.

## Releases

A release is the commit of a successful CI run of `main`, tagged by the release (AGENTS, T22.1-4): `vX.Y.Z` releases the npm packages `@polyspec/template`, `@polyspec/template-language`, `@polyspec/template-lsp`, `@polyspec/template-codemirror` and `@polyspec/template-compiler`, and the Composer packages `polyspec/template`, `polyspec/template-cli` and `polyspec/template-php-ext` at version X.Y.Z, and `packages/go/vX.Y.Z` releases the Go module `github.com/polyspec/template/packages/go`. The Cargo package `polyspec-template` carries the version X.Y.Z but is not released as an archive; it is consumed by git tag, as its `git-tag` manifest in `config/release.json` declares. The Python package `polyspec-template` (`packages/python`, the package kind `wheel` of `config/release.json`) carries the version X.Y.Z and is released as its PEP 427 wheel `polyspec_template-X.Y.Z-py3-none-any.whl`, built from the tagged commit with the build backend that `build-system.requires` of `packages/python/pyproject.toml` pins (`setuptools==84.2.1`). Its metadata declares the pinned runtime dependencies of `packages/python/pyproject.toml`, whose complete dependency graph and hashes are held by `packages/python/pylock.toml`; the development dependency group is not a requirement of the wheel. The maintainer starts the release with `gh workflow run release.yml -f run=<id> -f version=X.Y.Z`, where `<id>` is the successful CI run of the push that brought the version-bump commit to `main`. `.github/workflows/release.yml` (`on: workflow_dispatch` with the inputs `run` and `version`, permissions `contents: write` and `actions: read`) is a copy of kit. Its steps run the installed release targets (the packages, manifests and Go module are data in `config/release.json`) in this order and stop at the first failure; after `make release-tag` the workflow checks out the tag and installs again, and `make release-tools` runs before `make release-assets`:

```sh
make release-tag
make release-assets
make release-publish
make release-undraft
```

1. `make release-tag` reads the run `<id>` and requires a completed successful push or manual run of `.github/workflows/ci.yml` on `main` whose commit is an ancestor of `origin/main`; it does not run the tests again. It creates and pushes the annotated tags `vX.Y.Z` and `packages/go/vX.Y.Z` of the Go module at that commit, passes for a tag that is already there, and refuses a tag at another commit or a lightweight one.
2. `make release-assets` builds the npm packages and writes `var/release/assets`: `npm pack` of each npm package (`.tgz`), `git archive` of the directory of each Composer package of the tagged commit at the time of the commit (`.zip`), and the wheel of the Python package (`.whl`, `uv build --wheel` with the build backend of `build-system.requires`, `SOURCE_DATE_EPOCH` set to the time of the commit). The step fails unless the wheel's METADATA names the package and the tag's version and holds only `name==version` Requires-Dist lines. It also writes `packages.json`, the Composer repository of the release (kit K871): each Composer package of `config/release.json` (`polyspec/template`, `polyspec/template-cli` and `polyspec/template-php-ext`) at version X.Y.Z, with the `composer.json` of the tagged commit and a dist of type `zip` whose URL is the release asset `https://github.com/polyspec/template/releases/download/vX.Y.Z/<archive>` and whose shasum is the sha1 of the zip. A consumer reads the packages from the repository `{"type": "composer", "url": "https://github.com/polyspec/template/releases/download/vX.Y.Z/packages.json"}`. The release assets are npm tarballs, Composer zips, `packages.json` and the wheel. An archive is named `<package>-<language>-<version>.<ext>`, with `@scope/` and `vendor/` written as `scope-` and `vendor-` and the language `npm` or `php`: `polyspec-template-npm-X.Y.Z.tgz` is `@polyspec/template`, `polyspec-template-language-npm-X.Y.Z.tgz` is `@polyspec/template-language`, `polyspec-template-php-X.Y.Z.zip` is `polyspec/template` and `polyspec-template-php-ext-php-X.Y.Z.zip` is `polyspec/template-php-ext`. Each archive carries the manifest of its package unchanged: the published manifests of the tree are the published packages.
3. `make release-publish` creates a draft through the GitHub API and uploads the archives and `packages.json`. A draft from an earlier run is replaced; a public release is never replaced. The notes are the section `## X.Y.Z` of `CHANGELOG.md` when it has at most 125000 characters (`NOTES_LIMIT`), the limit of a release body on GitHub; a longer section is replaced by one line, `The changes of X.Y.Z are listed in [CHANGELOG.md](https://github.com/polyspec/template/blob/<tag>/CHANGELOG.md#XYZ).`, whose anchor is the version without its dots.

4. `make release-undraft` makes the release public. A failure of an earlier step leaves the release as a draft.

The release workflow runs `make release-tools` before `make release-assets`, which installs the Python of `mise.toml`, because the wheel is built by that Python.

The release workflow runs once for each dispatch. `make release-tag` creates and pushes the Go tag with the tag `vX.Y.Z`, so the maintainer pushes no tag; a tag pushed with the token of the run starts no workflow. `make release-tag` compares no manifest version with `version`, and a pushed tag is never moved, so the maintainer dispatches only the version of the version-bump commit of that run.

The tag reaches the steps through the environment variable `TAG`. kit tests its steps against a fixture repository in its own repository. `make release-coverage` requires every tracked manifest to be in `manifests` of `config/release.json` with how the tag releases it (`archive`, `version`, or `git-tag` for the Rust crate, which is consumed by git tag) or in `notReleased` with its reason, and kit tests the trigger, the permissions and the order of the steps of its release workflow.

A consumer checks a release by installing its archives with its own package manager; no step of the release installs them. `tests/scripts/release-config.test.mts` checks that `config/release.json` names the packages as their manifests declare them.

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

Composer: either the `composer` repository of the `packages.json` that the release publishes beside its archives,

```json
{
  "repositories": [{ "type": "composer", "url": "https://github.com/polyspec/template/releases/download/vX.Y.Z/packages.json" }],
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

Pages installs the locked tool package before make reads its bootstrap, then selects only Node tools. Its artifact must come from the successful CI run of the same commit.
