# Publication

[한국어](/ko/operations/publication).

No package has been published to a registry. Each package installs from a local checkout as follows. Registry publication is recorded in `docs/features.md` when it happens.

## Local installation

Go module:

```
require github.com/polyspec/template/packages/template-go v0.0.1
replace github.com/polyspec/template/packages/template-go => ../template/packages/template-go
```

npm package:

```json
{ "dependencies": { "@polyspec/template": "file:../template/packages/template-ts" } }
```

Composer package:

```json
{
  "repositories": [{ "type": "path", "url": "../template/packages/template-php" }],
  "require": { "polyspec/template": "@dev" }
}
```

Cargo crate:

```toml
[dependencies]
polyspec-template = { path = "../template/packages/template-rust" }
```

## Version

Every package declares version `0.0.1`. The version changes together in every package and in `CHANGELOG.md`, whose section `## Unreleased` above the released versions holds the entries of every change since the last release.

## Tag releases

A release is a tag of a commit of `main` (AGENTS, T22.1-4): `vX.Y.Z` releases the npm packages `@polyspec/template`, `@polyspec/template-language`, `@polyspec/template-lsp` and `@polyspec/template-codemirror`, and the Composer packages `polyspec/template` and `polyspec/template-php-ext` at version X.Y.Z, and `packages/template-go/vX.Y.Z` releases the Go module `github.com/polyspec/template/packages/template-go`. The Cargo package `polyspec-template` carries the version X.Y.Z but is not released as an archive; it is consumed by git tag, because `cargo package` rewrites git dependencies into crates.io requirements that do not resolve (T22.1-5). The push of the tag runs `.github/workflows/release.yml` (`on: push: tags: ['v*', '**/v*']`, permission `contents: write`; in a tag filter `*` does not match `/`, so `**/v*` covers the tag of a Go module at any depth), which is not the job `release` of `ci.yml`. After `make install`, its steps run `scripts/release.mjs` in this order and stop at the first failure:

```sh
make release-verify
make release-versions
make release-assets
make release-publish
```

1. `make release-verify` requires the tagged commit to be an ancestor of `origin/main` (`git merge-base --is-ancestor`) and the latest check runs `push-gate` and `ci-passed` of that commit (`gh api repos/<repository>/commits/<sha>/check-runs`) to be completed with the conclusion `success`; it names a missing or failed check and does not run the tests again.
2. `make release-versions` requires X.Y.Z in every manifest of `MANIFESTS` (a `composer.json` without a `version` field takes the version from the tag, as Composer does) and the section `## X.Y.Z` in `CHANGELOG.md`, and names each file with its version and the version of the tag; for `packages/template-go/vX.Y.Z` it requires the module path of `packages/template-go/go.mod` and the section.
3. `make release-assets` builds the npm packages and writes `var/release/assets`: `npm pack` of each npm package (`.tgz`), and `git archive` of the directory of each Composer package of the tagged commit (`.zip`): the release assets are npm tarballs and Composer zips only. An archive is named `<package name>-<version>.<ext>`, with `@scope/` and `vendor/` written as `scope-` and `vendor-`. A Go tag builds and attaches nothing: `release-assets` builds the npm packages only for a tag without `/`.
4. `make release-publish` runs `gh release create <tag> --verify-tag --title <tag> --notes-file <the section X.Y.Z>` with the archives.

The tag reaches the steps through the environment variable `TAG`. `tests/scripts/release.test.mjs` runs each step against fakes of `gh` and `npm`, requires every tracked manifest to be in `MANIFESTS` with how the tag releases it (the Rust crate as not released as an archive; consumed by git tag) or declared in `NOT_RELEASED` with its reason, and fails on a Cargo archive, and `tests/scripts/toolchain-files.test.mjs` requires the trigger, the permission and the order of the steps.

## Documentation site

The online documentation is a static VitePress site. After the merge queue moves `main` to a commit whose required checks `push-gate` and `ci-passed` passed (`ci-passed` passes only when every job of `.github/workflows/ci.yml` passed), the `pages` job builds `docs/.vitepress/dist` with `make docs-static-check`, copies the already generated showcase HTML and committed AST artifacts to `examples/site/`, and deploys that directory as the Pages artifact. The job `release` of `ci.yml` has already verified the documents and showcase, so publication does not repeat those gates. The showcase does not ship a parser or renderer to the browser. The build passes `VITEPRESS_BASE` for the repository path so links and assets work under `/<repository>/` without a server-side program.

The documentation build discovers every `*.ko.md` translation pair and publishes it under `/ko/`. VitePress locale configuration supplies Korean navigation and `ko-KR` HTML metadata throughout that route tree. The static-site gate rejects suffix-style output routes, navigation that leaves the active locale, incorrect HTML language metadata and unresolved theme interpolation.

To reproduce the published artifact locally:

```sh
VITEPRESS_BASE=/template/ make docs-static-check
```
