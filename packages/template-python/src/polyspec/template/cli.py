"""Command line interface as defined in docs/spec/conformance.md (CNF-4).

template parse [--root DIR] [--delimiters OC] FILE
template render [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] FILE
template tokens [--root DIR] [--delimiters OC] FILE
template format [--indent none|tab|N] [--delimiters OC] FILE
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import NoReturn

from .bind import BindError
from .engine import AstProgram, Engine, EngineOptions, RenderOptions
from .errors import TemplateError
from .formatter import FormatOptions, format_template
from .json_parse import parse_json_bytes
from .node_loader import FsLoader
from .number import number_to_string
from .parser import analyze_template, parse_template
from .scanner import DEFAULT_DELIMITERS, parse_delimiters
from .source import Source


class _Parser(argparse.ArgumentParser):
    """An argument parser whose usage errors exit with status 1 (CNF-4)."""

    def error(self, message: str) -> NoReturn:
        self.print_usage(sys.stderr)
        self.exit(1, f"{self.prog}: error: {message}\n")


def _delimiters(value: str) -> str:
    if parse_delimiters(value) is None:
        raise argparse.ArgumentTypeError(
            f"{value!r} is not two different delimiter characters"
        )
    return value


def _indent(value: str) -> "str | None":
    if value == "none":
        return None
    if value == "tab":
        return "\t"
    if value.isdecimal() and 1 <= int(value) <= 8:
        return " " * int(value)
    raise argparse.ArgumentTypeError("requires a number from 1 to 8, tab or none")


def _arguments() -> _Parser:
    parser = _Parser(prog="template")
    commands = parser.add_subparsers(
        dest="command", required=True, parser_class=_Parser
    )
    parse = commands.add_parser("parse")
    render = commands.add_parser("render")
    tokens = commands.add_parser("tokens")
    format_ = commands.add_parser("format")
    for option in ("--data", "--define", "--env"):
        render.add_argument(option, metavar="F")
    for command in (parse, render, tokens):
        command.add_argument("--root", metavar="DIR")
    format_.add_argument("--indent", type=_indent, default="2", metavar="none|tab|N")
    for command in (parse, render, tokens, format_):
        command.add_argument("--delimiters", type=_delimiters, metavar="OC")
        command.add_argument("file", metavar="FILE")
    return parser


def main(argv: "list[str] | None" = None) -> int:
    parser = _arguments()
    arguments = parser.parse_args(argv)

    def usage(message: str) -> NoReturn:
        parser.error(message)

    def read(path: str) -> bytes:
        # CNF-4: a file that cannot be read is a usage error.
        try:
            with open(path, "rb") as handle:
                return handle.read()
        except OSError as error:
            usage(f"cannot read {path}: {error.strerror}")

    if arguments.command == "format":
        return _format(read(arguments.file), arguments)

    file_path = os.path.abspath(arguments.file)
    root = os.path.abspath(arguments.root or os.path.dirname(file_path))
    name = os.path.relpath(file_path, root).replace(os.sep, "/")
    if name.startswith(".."):
        usage("FILE is outside of --root")
    delimiters = (
        DEFAULT_DELIMITERS
        if arguments.delimiters is None
        else parse_delimiters(arguments.delimiters)
    )

    def read_json(path: str):
        # Its content is data (VAL-12).
        return parse_json_bytes(read(os.path.join(root, path)))

    try:
        if arguments.command == "parse":
            source = Source.from_bytes(name, read(file_path))
            ast = parse_template(source, delimiters)
            sys.stdout.write(json.dumps(_json_plain(ast), ensure_ascii=False))
        elif arguments.command == "tokens":
            # EDT-8 tokens as [start, end, type] with UTF-8 byte offsets counted
            # after the byte order mark, as AST spans count them (LEX-2, FMT-2).
            source = Source.from_bytes(name, read(file_path))
            analysis = analyze_template(source, delimiters)
            tokens = [
                [source.byte_at(t["start"]), source.byte_at(t["end"]), t["kind"]]
                for t in analysis.tokens
            ]
            sys.stdout.write(json.dumps(tokens, separators=(",", ":")))
        else:
            engine = Engine(
                AstProgram(
                    EngineOptions(
                        loader=FsLoader(root), delimiters=arguments.delimiters
                    )
                )
            )
            render_options = RenderOptions()
            assign: dict = {}
            try:
                if arguments.data is not None:
                    assign = read_json(arguments.data)
                if arguments.define is not None:
                    render_options.define = _to_plain(read_json(arguments.define))
                if arguments.env is not None:
                    render_options.env = _to_plain(read_json(arguments.env))
            except BindError as error:
                raise TemplateError(error.code, name, 0, 0, 0, 0, str(error)) from None
            sys.stdout.write(engine.render(name, assign, render_options))
    except TemplateError as error:
        sys.stderr.write(json.dumps(error.to_object(), ensure_ascii=False) + "\n")
        return 2
    return 0


def _format(data: bytes, arguments: argparse.Namespace) -> int:
    """Formats the bytes of FILE: invalid UTF-8 is the parse error of the
    parser (E_LEX_INVALID_UTF8 at its position), and every other result is the
    one of format_template (FMT-14)."""
    try:
        Source.from_bytes(arguments.file, data)
    except TemplateError as error:
        return _format_error("parse", error.code, error.line, error.col, error.message)
    result = format_template(
        data.decode("utf-8"),
        FormatOptions(
            name=arguments.file,
            indent=arguments.indent,
            delimiters=arguments.delimiters,
        ),
    )
    if not result.ok:
        error = result.error
        return _format_error(
            error.reason, error.code, error.line, error.col, error.message
        )
    sys.stdout.write(result.text)
    return 0


def _format_error(
    reason: str, code: "str | None", line: int, col: int, message: str
) -> int:
    error = {"reason": reason, "code": code, "line": line, "col": col}
    sys.stderr.write(json.dumps({**error, "message": message}, ensure_ascii=False))
    return 2


def _to_plain(value):
    if isinstance(value, dict):
        return {key: _to_plain(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_to_plain(item) for item in value]
    return value


def _json_plain(value):
    """The JSON form of a value: an integral float prints without a fraction
    part, as the reference binding prints it."""
    if isinstance(value, float) and value == int(value) and abs(value) < 1e21:
        return int(number_to_string(value))
    if isinstance(value, dict):
        return {key: _json_plain(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_plain(item) for item in value]
    return value


if __name__ == "__main__":
    sys.exit(main())
