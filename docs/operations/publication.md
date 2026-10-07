# Publication

[한국어](/ko/operations/publication).

No package has been published. Each package installs from a local checkout as follows. Registry publication is recorded in `docs/features.md` when it happens.

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

Every package declares version `0.0.1`. The version changes together in every package and in `CHANGELOG.md`.

## Documentation site

The online documentation is a static VitePress site. After every required CI job (`release`, `docs`, `typescript`, `browser`, `editor`, `go`, `rust` and `php`) passes on `main`, the `pages` job builds `docs/.vitepress/dist` with `make docs-static-check`, copies the already generated showcase HTML and committed AST artifacts to `examples/site/`, and deploys that directory as the Pages artifact. The release job has already verified the documents and showcase, so publication does not repeat those gates. The showcase does not ship a parser or renderer to the browser. The build passes `VITEPRESS_BASE` for the repository path so links and assets work under `/<repository>/` without a server-side program.

The documentation build discovers every `*.ko.md` translation pair and publishes it under `/ko/`. VitePress locale configuration supplies Korean navigation and `ko-KR` HTML metadata throughout that route tree. The static-site gate rejects suffix-style output routes, navigation that leaves the active locale, incorrect HTML language metadata and unresolved theme interpolation.

To reproduce the published artifact locally:

```sh
VITEPRESS_BASE=/template/ make docs-static-check
```
