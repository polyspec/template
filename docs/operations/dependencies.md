# Dependency policy

[한국어](/ko/operations/dependencies).

Use the latest stable release that supports the declared runtime range. Prereleases do not satisfy this rule. Every lock file is part of the release input, and `make dependency-audit` rejects known JavaScript and PHP advisories at the configured severity.

An older stable release requires a record in `config/dependency-policy.json`. Each record identifies a direct dependency by its manifest, the root `package.json` or a Composer manifest, and contains the reproduced incompatibility, the condition for removing the pin and the tests that protect that condition. The root `package.json` is the only npm manifest that declares dependencies: it holds the development tools of every package, and the packages of `packages/` declare only their runtime dependencies. `make dependency-policy-check` queries current stable releases and fails for an outdated dependency without a record for its manifest, a stale record, an absent direct dependency or an incomplete reason. Before the query it proves that it rejects an outdated dependency without a record and accepts one with a record; its mutation test removes a required exception and proves that the checker rejects the unexplained pin.

The policy applies to supported runtimes as well as tools. A test dependency cannot require a runtime newer than the package claims to support. Both Composer manifests resolve their lockfiles with `config.platform.php` set to `8.2.0`; the policy gate rejects a stale lock or a platform override that differs from the declared minimum. CI tests the PHP packages and extension at PHP 8.2 and at the current release environment.

Changing a version follows one sequence: establish the compatibility and security conditions, update the manifest and lock together, run the affected package tests and documentation build, run the dependency policy and advisory checks, then run the clean-checkout release gate. A passing audit cannot replace a failing build, and a passing build cannot excuse a known vulnerability or an unexplained old pin.
