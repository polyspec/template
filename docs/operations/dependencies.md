<!-- doc-id: docs-operations-dependencies -->
# Dependency policy

[한국어](/ko/operations/dependencies).

Use the latest stable release that supports the declared runtime range. "Latest" means the latest stable release known when a dependency is chosen or updated; it is not a query of the registries on every run. Prereleases do not satisfy this rule. Every lock file is part of the release input. The currency of a dependency and the reason for a pin are judged by review; no check queries a registry.

## Scope

A registry dependency is a direct dependency that a registry resolves: an entry of `dependencies` or `devDependencies` of the root `package.json`, or of `require` or `require-dev` of a Composer manifest: the root `composer.json`, `packages/php-ext/composer.json` and `packages/cli/php/composer.json`. The root `package.json` is the only npm manifest that declares dependencies: it holds the development tools of every package, and the packages of `packages/` declare only their runtime dependencies. A `file:`, `link:` or `workspace:` dependency is a package of this repository, and `php`, `ext-*`, `lib-*` and `composer-*` are platform requirements. No registry resolves them, so "latest stable" has no meaning for them.

## Exceptions

An older stable release is recorded in this section. Each record identifies a registry dependency by its manifest, the root `package.json` or a Composer manifest, and contains the reproduced incompatibility, the condition for removing the pin and the tests that protect that condition.

- `@types/vscode` of `package.json`: vsce refuses to package an extension whose `@types/vscode` is newer than `engines.vscode` (`^1.138.0`): "@types/vscode ^1.140.0 greater than engines.vscode ^1.138.0". The extension uses no API added after VS Code 1.138, so raising `engines.vscode` would only exclude VS Code 1.138 and 1.139. The pin is removed when `engines.vscode` is raised to the latest `@types/vscode` release, because the extension needs an API of that release, and `make vscode-package` and `make template-test-vscode-integration` pass.

The policy applies to supported runtimes as well as tools. A test dependency cannot require a runtime newer than the package claims to support. The Composer manifests resolve their lockfiles with `config.platform.php` set to `8.4.1`, the platform of the PHP pin of kit. CI tests the PHP packages and extension at PHP 8.4.

## The Python lock

`packages/python/pylock.toml` locks the dependencies of the Python package. uv pip compile writes it from its sources, `packages/python/pyproject.toml` and `packages/python/constraints.txt`, and its header names the command.

Changing a version follows one sequence: establish the compatibility and security conditions, update the manifest and lock together with npm or Composer, run the affected package tests and documentation build, then run the clean-checkout release gate. A passing build cannot excuse a known vulnerability or an unexplained old pin.
