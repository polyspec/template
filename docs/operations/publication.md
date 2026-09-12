# Publication

[한국어](publication.ko.md).

No package has been published. This procedure describes how a consuming application uses the packages from a local checkout. Registry publication is recorded in `docs/features.md` when it happens.

## Local consumption

Go application:

```
require github.com/polyspec/template v0.0.1
replace github.com/polyspec/template => ../template/packages/template-go
```

Node application:

```json
{ "dependencies": { "@polyspec/template": "file:../template/packages/template-ts" } }
```

PHP application:

```json
{
  "repositories": [{ "type": "path", "url": "../template/packages/template-php" }],
  "require": { "polyspec/template": "@dev" }
}
```

Rust application:

```toml
[dependencies]
polyspec-template = { path = "../template/packages/template-rust" }
```

## Version

Every package declares version `0.0.1`. The version changes together in every package and in `CHANGELOG.md`.

## Documentation site

The online documentation is a static VitePress site. The GitHub Pages workflow runs `make docs-check` and `make showcase-check`, builds `docs/.vitepress/dist` with `make docs-static-check`, copies the already generated showcase HTML and committed AST artifacts to `examples/site/`, and deploys that directory as the Pages artifact. The showcase does not ship a parser or renderer to the browser. It passes `VITEPRESS_BASE` for the repository path so links and assets work under `/<repository>/` without a server-side application.

To reproduce the published artifact locally:

```sh
VITEPRESS_BASE=/template/ make docs-static-check
```
