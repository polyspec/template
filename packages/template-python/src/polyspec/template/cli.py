"""Command line interface as defined in docs/spec/conformance.md (CNF-4).

    template parse FILE [--root DIR] [--delimiters OC]
    template render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC]
"""

from __future__ import annotations

import json
import os
import sys
from typing import Optional

from .bind import BindError
from .engine import AstProgram, Engine, RenderOptions
from .errors import TemplateError
from .json_parse import parse_json_bytes
from .node_loader import FsLoader
from .parser import parse_template
from .scanner import parse_delimiters
from .source import Source

USAGE = ('usage: template parse FILE [--root DIR] [--delimiters OC]\n'
         '       template render FILE [--data F] [--define F] [--env F] [--root DIR] '
         '[--delimiters OC]\n')


def usage(message: str) -> 'SystemExit':
    sys.stderr.write(f'{message}\n{USAGE}')
    return SystemExit(1)


def main(argv: 'list[str] | None' = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    if len(arguments) < 2 or arguments[0] not in ('parse', 'render'):
        usage('command and FILE are required')
        return 1
    command, file_name = arguments[0], arguments[1]
    rest = arguments[2:]

    keys = ('data', 'define', 'env', 'root', 'delimiters')
    options: dict[str, Optional[str]] = {key: None for key in keys}
    index = 0
    while index < len(rest):
        flag = rest[index]
        if not flag.startswith('--') or index + 1 >= len(rest):
            usage(f'invalid option {flag}')
            return 1
        key = flag[2:]
        if key not in keys:
            usage(f'unknown option {flag}')
            return 1
        options[key] = rest[index + 1]
        index += 2

    file_path = os.path.abspath(file_name)
    root = os.path.abspath(options['root'] or os.path.dirname(file_path))
    name = os.path.relpath(file_path, root).replace(os.sep, '/')
    if name.startswith('..'):
        usage('FILE is outside of --root')
        return 1

    def read_json(path: str):
        # CNF-4: a file that cannot be read is a usage error; its content is data (VAL-12).
        try:
            with open(os.path.join(root, path), 'rb') as handle:
                data = handle.read()
        except OSError:
            usage(f'cannot read {path}')
            raise SystemExit(1) from None
        return parse_json_bytes(data)

    def to_plain(value):
        if isinstance(value, dict):
            return {key: to_plain(item) for key, item in value.items()}
        if isinstance(value, list):
            return [to_plain(item) for item in value]
        return value

    try:
        engine_options: dict = {'loader': FsLoader(root)}
        if options['delimiters'] is not None:
            engine_options['delimiters'] = options['delimiters']
        if command == 'parse':
            try:
                with open(file_path, 'rb') as handle:
                    data = handle.read()
            except OSError:
                usage(f'cannot read {file_name}')
                return 1
            delimiters = parse_delimiters(options['delimiters']) if options['delimiters'] \
                else ('{', '}')
            ast = parse_template(Source.from_bytes(name, data), delimiters)
            sys.stdout.write(json.dumps(_json_plain(ast), ensure_ascii=False))
        else:
            engine = Engine(AstProgram(_engine_options(engine_options)))
            render_options = RenderOptions()
            assign: dict = {}
            try:
                if options['data'] is not None:
                    assign = read_json(options['data'])
                if options['define'] is not None:
                    render_options.define = to_plain(read_json(options['define']))
                if options['env'] is not None:
                    render_options.env = to_plain(read_json(options['env']))
            except BindError as error:
                raise TemplateError(error.code, name, 0, 0, 0, 0, str(error)) from None
            sys.stdout.write(engine.render(name, assign, render_options))
    except TemplateError as error:
        sys.stderr.write(json.dumps(error.to_object(), ensure_ascii=False) + '\n')
        return 2
    return 0


def _json_plain(value):
    """The JSON form of a value: an integral float prints without a fraction
    part, as the reference binding prints it."""
    if isinstance(value, float) and value == int(value) and abs(value) < 1e21:
        from .number import number_to_string
        return int(number_to_string(value))
    if isinstance(value, dict):
        return {key: _json_plain(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_plain(item) for item in value]
    return value


def _engine_options(values: dict):
    from .engine import EngineOptions
    return EngineOptions(loader=values['loader'], delimiters=values.get('delimiters'))


if __name__ == '__main__':
    sys.exit(main())
