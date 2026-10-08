# Development

The required checks of the repository root apply to this package. Development runs unit tests only: run `python3 tests/test_api.py` while a change is in progress, with the RED case first and the same case to GREEN. The conformance and parity runners of the repository run this package through its command line interface in CI; no rule requires a local run before a commit or a push.

- Package layout: `src/polyspec/template/` holds the implementation, `tests/` the unit tests, `tests/fixtures/` the files the command line tests read.
- `python3 tests/test_api.py` runs the unit tests of the package; each test names the behavior it holds.
- `PYTHONPATH=src python3 -m polyspec.template.cli …` runs the command line interface from the checkout.
- Keep the engine faithful to the shared specification: `docs/spec/*.md` of the repository root define the behavior, and the conformance cases of `tests/cases/` are the shared acceptance criteria.
