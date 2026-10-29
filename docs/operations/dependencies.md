<!-- doc-id: docs-operations-dependencies -->
# Dependency policy

[한국어](/ko/operations/dependencies).

Use the latest stable release that supports the declared runtime range. "Latest" means the latest stable release known when a dependency is chosen or updated; it is not a query of the registries on every run. Prereleases do not satisfy this rule. Every lock file is part of the release input. The currency of a dependency and the reason for a pin are judged by review; no check queries a registry.

## Scope

A registry dependency is a direct dependency that a registry resolves: an entry of `dependencies` or `devDependencies` of the root `package.json`, or of `require` or `require-dev` of a Composer manifest of `config/dependency-policy.json`. The root `package.json` is the only npm manifest that declares dependencies: it holds the development tools of every package, and the packages of `packages/` declare only their runtime dependencies. A `file:`, `link:` or `workspace:` dependency is a package of this repository, and `php`, `ext-*`, `lib-*` and `composer-*` are platform requirements. No registry resolves them, so "latest stable" has no meaning for them.

## Exceptions

An older stable release is recorded in `config/dependency-policy.json`. Each record identifies a registry dependency by its manifest, the root `package.json` or a Composer manifest, and contains the reproduced incompatibility, the condition for removing the pin and the tests that protect that condition.

The policy applies to supported runtimes as well as tools. A test dependency cannot require a runtime newer than the package claims to support. The Composer manifests resolve their lockfiles with `config.platform.php` set to `8.4.1`, the platform of the PHP pin of kit that `composerPlatforms` of `config/dependency-policy.json` declares. CI tests the PHP packages and extension at PHP 8.4.

## The Python lock: `make python-lock-check`

`make python-lock-check` checks each lock of `pythonLocks` of `config/dependency-policy.json`, `packages/python/pylock.toml`, against its sources, `packages/python/pyproject.toml` and `packages/python/constraints.txt`.

Changing a version follows one sequence: establish the compatibility and security conditions, update the manifest and lock together with npm or Composer, run the affected package tests and documentation build, then run the clean-checkout release gate. A passing build cannot excuse a known vulnerability or an unexplained old pin.
