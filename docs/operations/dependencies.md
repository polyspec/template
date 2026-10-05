# Dependency policy

[한국어](/ko/operations/dependencies).

Use the latest stable release that supports the declared runtime range. "Latest" means the latest stable release known when a dependency is chosen or updated, at its review; it is not a query of the registries on every run. Prereleases do not satisfy this rule. Every lock file is part of the release input.

## Scope

A registry dependency is a direct dependency that a registry resolves: an entry of `dependencies` or `devDependencies` of the root `package.json`, or of `require` or `require-dev` of a Composer manifest of `config/dependency-policy.json`. The root `package.json` is the only npm manifest that declares dependencies: it holds the development tools of every package, and the packages of `packages/` declare only their runtime dependencies. A `file:`, `link:` or `workspace:` dependency is a package of this repository, and `php`, `ext-*`, `lib-*` and `composer-*` are platform requirements. No registry resolves them, so "latest stable" has no meaning for them, and they are outside the review by the definition of its scope, not by an exception. The gate still checks a package of this repository against its lock: `package-lock.json` resolves it to the directory that `package.json` names, at the version of its `package.json`.

## The review: `make dependency-review`

`make dependency-review` is a developer command. It asks the registries for the latest stable release of every registry dependency (`npm view`, `composer outdated --locked`) and for the advisories of every lock (`npm audit` at severity moderate and above, `composer audit` for every advisory and abandoned package). It prints one line for each newer stable release without an exception, each exception whose dependency is current again and each advisory, with the package, its version, the newer release or the advisory and the fix, and fails when there is one. A dependency kept by an exception is printed with the reason of its exception.

- `make dependency-review RECORD=1` also writes what it reviewed to `config/dependency-review.json`: the time of the review, the sha256 and the advisories of every lock, and the locked and latest stable version of every registry dependency. It keeps the record unchanged when a registry query fails.
- `make dependency-review UPDATE=1` first raises every newer dependency without an exception to its latest stable release, keeping the range operator of its manifest (`npm install`, `composer require --update-with-dependencies`), and updates the packages with an advisory (`npm audit fix`, `composer update --with-dependencies`); then it reviews and records again.

Run it when a dependency is chosen or updated; a change of a manifest or a lock is committed with its record. The scheduled workflow `.github/workflows/dependency-review.yml` runs `make dependency-review` every day. An advisory against a version that the repository ships is a defect in what it ships, found later, and the scheduled run finds it without waiting for a developer. Its red result names the package, the version, the advisory or the newer release and the fix command; the fix is a task like any other. It is not a gate of a commit.

## The gate: `make dependency-policy-check`

`make dependency-policy-check`, which `make dependency-audit` runs, reads only the files of the checkout and queries no registry, so one tree gives one result at any time. It reports every finding in one run, one line each with the rule that it breaks and its fix, and fails when there is one:

- a registry dependency or a lock without an entry in the review record, or a record entry that no manifest or policy declares;
- a lock whose sha256 differs from the record, or a dependency whose locked version differs from the record: the lock changed without a review;
- a lock with an advisory at its review;
- a dependency older than the latest stable release of its review without an exception, and an exception whose dependency was current at its review;
- an incomplete, duplicate or unknown exception;
- a Composer manifest or lock that does not resolve for the declared minimum PHP, and a lock that `composer validate --strict` finds stale, run with `COMPOSER_DISABLE_NETWORK=1`;
- a package of this repository locked at another directory or version, and a `package-lock.json` that records other dependencies than `package.json`.

Its mutation gate `scripts/check-dependency-policy-mutation.mjs` copies the dependency files and proves that the check rejects an outdated dependency without an exception, a Composer platform other than the declared minimum, a lock changed without a review and a lock with an advisory. `tests/scripts/dependency-policy.test.mjs` runs the gate and the review against stub registries.

## Exceptions

An older stable release requires a record in `config/dependency-policy.json`. Each record identifies a registry dependency by its manifest, the root `package.json` or a Composer manifest, and contains the reproduced incompatibility, the condition for removing the pin and the tests that protect that condition.

The policy applies to supported runtimes as well as tools. A test dependency cannot require a runtime newer than the package claims to support. Both Composer manifests resolve their lockfiles with `config.platform.php` set to `8.2.0`; the gate rejects a stale lock or a platform override that differs from the declared minimum. CI tests the PHP packages and extension at PHP 8.2 and at the current release environment.

Changing a version follows one sequence: establish the compatibility and security conditions, update the manifest and lock together with `make dependency-review UPDATE=1`, run the affected package tests and documentation build, run `make dependency-audit`, then run the clean-checkout release gate. A passing review cannot replace a failing build, and a passing build cannot excuse a known vulnerability or an unexplained old pin.
