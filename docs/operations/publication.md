# Publication

[한국어](/ko/operations/publication).

No package has been published to a registry. Each package installs from a local checkout as follows. Registry publication is recorded in `docs/features.md` when it happens.

## Local installation

Go module:

```
require github.com/polyspec/template/packages/template-go v0.0.3
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

Every package declares version `0.0.3`. The version changes together in every package and in `CHANGELOG.md`, whose section `## Unreleased` above the released versions holds the entries of every change since the last release.

## Tag releases

A release is a tag of a commit of `main` (AGENTS, T22.1-4): `vX.Y.Z` releases the npm packages `@polyspec/template`, `@polyspec/template-language`, `@polyspec/template-lsp` and `@polyspec/template-codemirror`, and the Composer packages `polyspec/template` and `polyspec/template-php-ext` at version X.Y.Z, and `packages/template-go/vX.Y.Z` releases the Go module `github.com/polyspec/template/packages/template-go`. The Cargo package `polyspec-template` carries the version X.Y.Z but is not released as an archive; it is consumed by git tag, because `cargo package` rewrites git dependencies into crates.io requirements that do not resolve (T22.1-5). The push of the tag runs `.github/workflows/release.yml` (`on: push: tags: ['v*', '**/v*']`, permission `contents: write`; in a tag filter `*` does not match `/`, so `**/v*` covers the tag of a Go module at any depth), which is not the job `release` of `ci.yml`. After `make install`, its steps run `scripts/release.mjs` in this order and stop at the first failure:

```sh
make release-verify
make release-versions
make release-assets
make release-publish
```

1. `make release-verify` requires the tagged commit to be an ancestor of `origin/main` (`git merge-base --is-ancestor`) and the latest check runs `push-gate` and `ci-passed` of that commit (`gh api repos/<repository>/commits/<sha>/check-runs`) to be completed with the conclusion `success`; it names a missing or failed check and does not run the tests again.
2. `make release-versions` requires X.Y.Z in every manifest of `MANIFESTS`, the `version` field of each `composer.json` included, and the section `## X.Y.Z` in `CHANGELOG.md`, and names each file with its version and the version of the tag; for `packages/template-go/vX.Y.Z` it requires the module path of `packages/template-go/go.mod` and the section.
3. `make release-assets` builds the npm packages and writes `var/release/assets`: `npm pack` of each npm package (`.tgz`), and `git archive` of the directory of each Composer package of the tagged commit (`.zip`): the release assets are npm tarballs and Composer zips only. An archive is named `<package name>-<version>.<ext>`, with `@scope/` and `vendor/` written as `scope-` and `vendor-`. A Go tag builds and attaches nothing: `release-assets` builds the npm packages only for a tag without `/`. Each archive carries the manifest of its package unchanged: the published manifests of the tree are the published packages. The step then fails unless every packed manifest equals its manifest at the tagged commit and names each `@polyspec/*` dependency of `dependencies`, `peerDependencies` and `optionalDependencies`, and each `polyspec/*` package of `require`, by an exact version, a package of this repository by X.Y.Z, and unless each `composer.json` declares the version X.Y.Z, which an `artifact` repository reads, and no `repositories` (`checkAssets`): a path (`file:`, `link:`, `workspace:`), a git source (`git`, `github:`, ssh), a URL, a range or `@dev` installs only inside the repository.
4. `make release-publish` runs `gh release create <tag> --verify-tag --title <tag> --notes-file <the notes>` with the archives. The notes are the section `## X.Y.Z` of `CHANGELOG.md` when it has at most 125000 characters (`NOTES_LIMIT`), the limit of a release body on GitHub; a longer section is replaced by one line, `The changes of X.Y.Z are listed in [CHANGELOG.md](https://github.com/polyspec/template/blob/<tag>/CHANGELOG.md#XYZ).`, whose anchor is the version without its dots.

The tag reaches the steps through the environment variable `TAG`. `tests/scripts/release.test.mjs` runs each step against fakes of `gh` and `npm`, fails on a packed manifest that differs from its source and on each form of a dependency that installs only inside the repository, requires the published manifests of the tree to pass the same rules, installs the packed assets of the manifests of the tree in a directory outside the repository with `npm install` from an empty cache and with an `artifact` repository of Composer, requires every tracked manifest to be in `MANIFESTS` with how the tag releases it (the Rust crate as not released as an archive; consumed by git tag) or declared in `NOT_RELEASED` with its reason, and fails on a Cargo archive, and `tests/scripts/toolchain-files.test.mjs` requires the trigger, the permission and the order of the steps.

## Installing the release assets

No polyspec package is published to a registry before 0.1. A consumer downloads the archives of a GitHub Release, `https://github.com/polyspec/template/releases/download/vX.Y.Z/<archive>`, and installs them together; each archive names the polyspec packages it depends on by name and exact version, and the archive of that version beside it satisfies the dependency.

npm: list every needed tarball as a `file:` dependency. `@polyspec/template-language`, `@polyspec/template-lsp` and `@polyspec/template-codemirror` depend on `@polyspec/template-language` or `@polyspec/template` at X.Y.Z, so the tarball of that package is listed too:

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
      "require": { "php": "^8.2", "ext-mbstring": "*" },
      "autoload": { "psr-4": { "Polyspec\\Template\\": "src/" } },
      "dist": { "type": "zip", "url": "https://github.com/polyspec/template/releases/download/vX.Y.Z/polyspec-template-X.Y.Z.zip" }
    }
  }],
  "require": { "polyspec/template": "X.Y.Z" }
}
```

A `package` entry replaces the `composer.json` of the zip, so it repeats its `require` and `autoload`. Composer installs no package of the type `php-ext`: the zip of `polyspec/template-php-ext` is the source that PIE builds the extension from.

In the repository, the private root `package.json`, which is not published, resolves the npm packages of the repository: its `dependencies` and `overrides` name each of them by its directory (`file:packages/<package>`), and npm installs each as a copy (`.npmrc`). The published `package.json` and `composer.json` of each package name the polyspec packages they depend on by exact version only, and each `composer.json` declares its version, which every release sets with the other manifests. No package of the repository depends on a polyspec package of another repository, so no release tag of another repository is recorded.

## Documentation site

The online documentation is a static VitePress site. After the merge queue moves `main` to a commit whose required checks `push-gate` and `ci-passed` passed (`ci-passed` passes only when every job of `.github/workflows/ci.yml` passed), the `pages` job builds `docs/.vitepress/dist` with `make docs-static-check`, copies the already generated showcase HTML and committed AST artifacts to `examples/site/`, and deploys that directory as the Pages artifact. The job `release` of `ci.yml` has already verified the documents and showcase, so publication does not repeat those gates. The showcase does not ship a parser or renderer to the browser. The build passes `VITEPRESS_BASE` for the repository path so links and assets work under `/<repository>/` without a server-side program.

The documentation build discovers every `*.ko.md` translation pair and publishes it under `/ko/`. VitePress locale configuration supplies Korean navigation and `ko-KR` HTML metadata throughout that route tree. The static-site gate rejects suffix-style output routes, navigation that leaves the active locale, incorrect HTML language metadata and unresolved theme interpolation.

To reproduce the published artifact locally:

```sh
VITEPRESS_BASE=/template/ make docs-static-check
```
