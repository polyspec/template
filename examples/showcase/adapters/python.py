#!/usr/bin/env python3
"""Python implementation of the showcase adapter contract (packages/compiler/interface.json).

Run it as `var/python/venv/bin/python python.py SCENARIO_DIR`: `make python-package` installs packages/python
into var/python/venv, and the directory of this script, the first entry of the import path of a script, holds the
modules generated.render_adapter and generated.typed.<scenario>, the generated program of each scenario with `_` for
`-` in its name (examples/showcase/python-module.mts), which it imports with import statements. Without SHOWCASE_EXECUTION_MODE=generated it interprets the compiled AST artifacts of the scenario; with it, the adapter renders
through the generated program of the scenario. Both modes call Engine.render.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

from polyspec.template import (
    AstProgram,
    Engine,
    EngineOptions,
    MapLoader,
    RenderOptions,
    decode_template,
    parse_json_bytes,
)

from generated.render_adapter import (
    DefineEntry,
    Environment,
    RenderAdapter,
    RenderRequest,
    RepeatResult,
    Scenario,
)
from generated.typed import (
    compiler_coverage,
    empty_state,
    html_slot,
    react_boundary,
    scope_precedence,
)

PROGRAMS = {
    "compiler-coverage": compiler_coverage.GeneratedProgram,
    "empty-state": empty_state.GeneratedProgram,
    "html-slot": html_slot.GeneratedProgram,
    "react-boundary": react_boundary.GeneratedProgram,
    "scope-precedence": scope_precedence.GeneratedProgram,
}


def generated_program(root: str):
    """The generated program of the scenario in `root`."""
    scenario = Path(root).name
    if scenario not in PROGRAMS:
        raise RuntimeError(f"generated program is missing for scenario {scenario}")
    return PROGRAMS[scenario]()


def read_json(root: str, name: str):
    return parse_json_bytes((Path(root) / name).read_bytes())


def artifact_templates(root: str) -> dict:
    base = Path(root) / "compiled" / "ast"
    manifest = json.loads((base / "manifest.json").read_text(encoding="utf-8"))
    return {
        name: decode_template((base / entry["path"]).read_text(encoding="utf-8"))
        for name, entry in manifest["files"].items()
    }


def object_value(value, name: str) -> dict:
    if not isinstance(value, dict):
        raise RuntimeError(f"{name} must be an object")
    return value


def string_field(value: dict, name: str) -> str:
    if not isinstance(value.get(name), str):
        raise RuntimeError(f"{name} must be a string")
    return value[name]


def number_field(value: dict, name: str) -> float:
    field = value.get(name)
    if isinstance(field, bool) or not isinstance(field, (int, float)):
        raise RuntimeError(f"{name} must be a number")
    return float(field)


def define_value(value) -> dict:
    define = {}
    for identifier, raw in object_value(value, "define.json").items():
        if isinstance(raw, str):
            define[identifier] = DefineEntry(raw, None, None)
            continue
        entry = object_value(raw, f"define.{identifier}")
        for key in entry:
            if key not in ("template", "data", "html"):
                raise RuntimeError(f"define.{identifier} has an unknown field")
        template = entry.get("template")
        html = entry.get("html")
        data = entry.get("data")
        has_template = isinstance(template, str)
        has_html = isinstance(html, str)
        if has_template == has_html:
            raise RuntimeError(f"define.{identifier} needs one variant")
        if data is not None and not isinstance(data, dict):
            raise RuntimeError(f"define.{identifier}.data must be an object")
        if has_html and data is not None:
            raise RuntimeError(f"define.{identifier}.html cannot have data")
        define[identifier] = DefineEntry(
            template if has_template else None, data, html if has_html else None
        )
    return define


def environment_value(value) -> Environment:
    env = object_value(value, "env.json")
    for key in env:
        if key not in ("timezone", "now"):
            raise RuntimeError(f"env.json has an unknown field: {key}")
    return Environment(
        string_field(env, "timezone") if "timezone" in env else None,
        number_field(env, "now") if "now" in env else None,
    )


def engine_defines(define: dict) -> dict:
    result = {}
    for identifier, entry in define.items():
        if entry.template is not None:
            result[identifier] = (
                {"template": entry.template}
                if entry.data is None
                else {"template": entry.template, "data": entry.data}
            )
        else:
            result[identifier] = {"html": entry.html}
    return result


def engine_env(env: Environment | None) -> dict:
    result = {}
    if env is not None and env.timezone is not None:
        result["timezone"] = env.timezone
    if env is not None and env.now is not None:
        result["now"] = env.now
    return result


class Adapter(RenderAdapter):
    def __init__(self, root: str):
        self.root = root
        generated = os.environ.get("SHOWCASE_EXECUTION_MODE") == "generated"
        program = (
            generated_program(root)
            if generated
            else AstProgram(EngineOptions(loader=MapLoader(artifact_templates(root))))
        )
        self.engine = Engine(program)

    def load_scenario(self) -> Scenario:
        metadata = object_value(read_json(self.root, "scenario.json"), "scenario.json")
        env = (
            environment_value(read_json(self.root, "env.json"))
            if (Path(self.root) / "env.json").is_file()
            else None
        )
        return Scenario(
            string_field(metadata, "target"),
            object_value(read_json(self.root, "data.json"), "data.json"),
            define_value(read_json(self.root, "define.json")),
            env,
        )

    def build_request(self, scenario: Scenario) -> RenderRequest:
        return RenderRequest(
            scenario.target, scenario.assign, scenario.define, scenario.env
        )

    def render(self, request: RenderRequest) -> str:
        return self.engine.render(
            request.target,
            request.assign,
            RenderOptions(
                define=engine_defines(request.define), env=engine_env(request.env)
            ),
        )

    def render_twice(self, request: RenderRequest) -> RepeatResult:
        return RepeatResult(self.render(request), self.render(request))


def plain(request: RenderRequest) -> dict:
    define = {}
    for identifier, entry in request.define.items():
        if entry.template is not None:
            define[identifier] = (
                entry.template
                if entry.data is None
                else {"template": entry.template, "data": entry.data}
            )
        else:
            define[identifier] = {"html": entry.html}
    result = {"target": request.target, "assign": request.assign, "define": define}
    if request.env is not None:
        result["env"] = engine_env(request.env)
    return result


def digest(value: str) -> dict:
    encoded = value.encode("utf-8")
    return {"bytes": len(encoded), "sha256": hashlib.sha256(encoded).hexdigest()}


def main(argv: list[str]) -> None:
    if len(argv) < 2:
        raise RuntimeError("usage: python python.py SCENARIO_DIR")
    adapter = Adapter(argv[1])
    request = adapter.build_request(adapter.load_scenario())
    repeated = adapter.render_twice(request)
    before_failure = json.dumps(plain(request))
    failure_observed = False
    try:
        adapter.render(
            RenderRequest(
                "__contract_missing_target__",
                request.assign,
                request.define,
                request.env,
            )
        )
    except Exception:  # noqa: BLE001 - any failure of the invalid target is the observed failure
        failure_observed = True
    after_failure = json.dumps(plain(request))
    first = digest(repeated.first)
    second = digest(repeated.second)
    recovered = digest(adapter.render(request))
    print(
        json.dumps(
            {
                "language": "python",
                "type": "Adapter",
                "operations": ["loadScenario", "buildRequest", "render", "renderTwice"],
                "request": plain(request),
                "bytes": first["bytes"],
                "firstSha256": first["sha256"],
                "secondSha256": second["sha256"],
                "failureObserved": failure_observed,
                "requestUnchanged": before_failure == after_failure,
                "recoveredSha256": recovered["sha256"],
            }
        )
    )


if __name__ == "__main__":
    main(sys.argv)
