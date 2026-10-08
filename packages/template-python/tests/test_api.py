#!/usr/bin/env python3
"""Package tests of the template engine.
Each test names the behavior it holds; the shared conformance cases of the
repository run in CI through the command line interface.
"""
import json
import math
import subprocess
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from polyspec.template import (AstProgram, BindError, Engine, EngineOptions, MapLoader,
                               PageCache, RenderOptions, SafeString, TemplateError, analyze,
                               analyze_prefix, bind, merge, parse, parse_json, parse_json_bytes,
                               resolve_path)
from polyspec.template.errors import TemplateError as TE
from polyspec.template.number import format_number, number_to_string, round_number
from polyspec.template.values import loose_equals, parse_numeric_string


def render(source: str, assign=None, options=None, engine=None):
    program = engine or AstProgram(EngineOptions(loader=MapLoader({'main.tpl': source})))
    return Engine(program).render('main.tpl', assign if assign is not None else {},
                                  options or RenderOptions())


class Parsing(unittest.TestCase):

    def test_text_echo_and_comments(self):
        ast = parse('a{* hidden *}b{= v }c', 't.tpl')
        self.assertEqual([node['type'] for node in ast['body']], ['Text', 'Echo', 'Text'])
        self.assertEqual(ast['comments'][0]['value'], ' hidden ')
        self.assertEqual(render('a{* hidden *}b{= v }c', {'v': 'B'}), 'abBc')

    def test_if_else_and_elseif(self):
        source = '{? x > 2 }big{:? x > 1 }mid{:}small{/}'
        self.assertEqual(render(source, {'x': 3}), 'big')
        self.assertEqual(render(source, {'x': 2}), 'mid')
        self.assertEqual(render(source, {'x': 1}), 'small')

    def test_loop_and_loop_meta(self):
        source = '{@ it = items }[{= it.index_ }:{= it }:{= it.first_ }:{= it.last_ }]{:}none{/}'
        self.assertEqual(render(source, {'items': parse_json('["a","b"]')}), '[0:a:true:false][1:b:false:true]')
        self.assertEqual(render(source, {'items': parse_json('[]')}), 'none')

    def test_map_loop_keys_and_values(self):
        source = '{@ e = m }{= e.key_ }={= e.value_ };{/}'
        self.assertEqual(render(source, {'m': parse_json('{"x":1,"y":2}')}), 'x=1;y=2;')

    def test_assignment_forms(self):
        self.assertEqual(render('{: a = 2 }{= a }'), '2')
        self.assertEqual(render('{: a = 1 }{: a++ }{= a }'), '2')
        self.assertEqual(render('{: a = 10 }{: a -= 3 }{= a }'), '7')

    def test_include_resolves_against_the_current_template(self):
        engine = Engine(AstProgram(EngineOptions(loader=MapLoader({
            'top.tpl': '{+ "sub/row.tpl" }', 'sub/row.tpl': 'R'}))))
        self.assertEqual(engine.render('top.tpl', {}), 'R')

    def test_block_and_ifblock_with_define(self):
        engine = Engine(AstProgram(EngineOptions(loader=MapLoader({
            'shell.tpl': '[{# main }]', 'part.tpl': 'P'}))))
        options = RenderOptions(define={'main': {'template': 'part.tpl', 'data': {'x': 1}}})
        self.assertEqual(engine.render('shell.tpl', {}, options), '[P]')
        self.assertEqual(engine.render('shell.tpl', {}, RenderOptions(
            define={'main': {'html': 'H'}})), '[H]')

    def test_delimiter_directive(self):
        self.assertEqual(render('{% delimiter %%}%= 1 + 2 %'), '3')

    def test_wrapped_tags(self):
        self.assertEqual(render('"{{= v }}"', {'v': 'x'}), 'x')
        self.assertEqual(render('<!--{? 1 }y{/}-->', {}), '<!--y-->')

    def test_escaped_open_delimiter(self):
        self.assertEqual(render(r'\{= v }', {}), '{= v }')

    def test_standalone_lines_vanish(self):
        self.assertEqual(render('A\n{: a = 1 }\n{= a }\nB'), 'A\n1\nB')

    def test_analyze_returns_tags_and_tokens(self):
        analysis = analyze('{= 1 + x }', 't.tpl')
        self.assertEqual(analysis.tags[0]['kind'], 'echo')
        self.assertTrue(any(token['kind'] == 'number' for token in analysis.tokens))

    def test_analyze_prefix_reports_the_error_with_the_prefix(self):
        analysis = analyze_prefix('{= 1 }{= ', 't.tpl')
        self.assertIsNotNone(analysis.error)
        self.assertEqual(analysis.tags[0]['kind'], 'echo')


class Expressions(unittest.TestCase):

    def test_operators(self):
        cases = [
            ('{= 1 + 2 * 3 }', '7'), ('{= (1 + 2) * 3 }', '9'), ('{= 7 % 3 }', '1'),
            ('{= -7 % 3 }', '-1'), ('{= 7 / 2 }', '3.5'), ('{= "a" + 1 }', 'a1'),
            ('{= 1 < 2 }', 'true'), ('{= "1" == 1 }', 'true'), ('{= "1" === 1 }', 'false'),
            ('{= 1 != 2 }', 'true'), ('{= null ?? "d" }', 'd'), ('{= 0 ?? "d" }', '0'),
            ('{= true && false }', 'false'), ('{= false || 1 }', 'true'),
            ('{= !0 }', 'true'), ('{= 1 > 2 ? "a" : "b" }', 'b'), ('{= null ?: "x" }', 'x'),
             ('{= 2 in [1, 2] }', 'true'),
        ]
        for source, expected in cases:
            with self.subTest(source=source):
                self.assertEqual(render(source), expected)

    def test_member_index_and_calls(self):
        assign = {'m': parse_json('{"a": {"b": [10, 20]}}')}
        self.assertEqual(render('{= m.a.b[1] }', assign), '20')
        self.assertEqual(render('{= m["a"]["b"][0] }', assign), '10')
        self.assertEqual(render('{= m.a.z }', assign), '')
        self.assertEqual(render('{= upper("hi") | lower }'), 'hi')

    def test_list_and_map_literals(self):
        self.assertEqual(render('{= json([1, ...[2, 3]]) | raw }'), '[1,2,3]')
        self.assertEqual(render('{= json(["a" => 1, ...["b" => 2]]) | raw }'), '{"a":1,"b":2}')
        self.assertEqual(render('{= "a" in ["a" => 1] }'), 'true')

    def test_numbers_follow_ecmascript_tostring(self):
        for value, expected in ((0.0, '0'), (1.0, '1'), (123.456, '123.456'), (1e21, '1e+21'),
                                (1e-7, '1e-7'), (0.1 + 0.2, '0.30000000000000004')):
            self.assertEqual(number_to_string(value), expected)

    def test_number_formatting(self):
        self.assertEqual(format_number(1234567.891, 2, '.', ','), '1,234,567.89')
        self.assertEqual(format_number(0.5, 0, '.', ''), '1')
        self.assertEqual(format_number(-0.4, 0, '.', ''), '0')
        self.assertEqual(round_number(2.5, 0), 3.0)

    def test_loose_numeric_equality(self):
        self.assertTrue(loose_equals('1.50', 1.5))
        self.assertFalse(loose_equals('1.50x', 1.5))
        self.assertIsNone(parse_numeric_string('nan'))


class Functions(unittest.TestCase):

    def test_string_functions(self):
        cases = [
            ('{= upper("aé") }', 'Aé'), ('{= lower("AÉ") }', 'aÉ'),
            ('{= trim("  hi  ") }', 'hi'), ('{= trim("xxhixx", "x") }', 'hi'),
            ('{= replace("aXaXa", "X", "-") }', 'a-a-a'),
            ('{= json(split("a,b", ",")) | raw }', '["a","b"]'),
            ('{= truncate("hello", 3) }', 'hel...'),
            ('{= truncate("hello", 3, "!") }', 'hel!'),
            ('{= contains("hello", "ell") }', 'true'),
            ('{= contains([1, 2], "2") }', 'true'),
            ('{= starts_with("hello", "he") }', 'true'),
            ('{= ends_with("hello", "lo") }', 'true'),
            ('{= length("héllo") }', '5'), ('{= length([1, 2]) }', '2'),
            ('{= first("hi") }', 'h'), ('{= last("hi") }', 'i'),
            ('{= reverse("ab") }', 'ba'), ('{= slice("hello", 1, 3) }', 'ell'),
            ('{= slice("hello", -2) }', 'lo'),
        ]
        for source, expected in cases:
            with self.subTest(source=source):
                self.assertEqual(render(source), expected)

    def test_astral_code_points(self):
        self.assertEqual(render('{= length("😀a") }'), '2')
        self.assertEqual(render('{= first("😀a") }', {}), '😀')
        self.assertEqual(render('{= truncate("😀ab", 2) }'), '😀a...')

    def test_collection_functions(self):
        assign = {'m': parse_json('{"b": 2, "a": 1}')}
        self.assertEqual(render('{= json(keys(m)) | raw }', assign), '["b","a"]')
        self.assertEqual(render('{= json(values(m)) | raw }', assign), '[2,1]')
        self.assertEqual(render('{= json(sort([3, 1, 2])) | raw }'), '[1,2,3]')
        self.assertEqual(render('{= json(sort(items, "n")) | raw }',
                                {'items': parse_json('[{"n":2},{"n":1}]')}), '[{"n":1},{"n":2}]')
        self.assertEqual(render('{= join(["a","b"], "-") }'), 'a-b')
        self.assertEqual(render('{= json(range(1, 4)) | raw }'), '[1,2,3,4]')
        self.assertEqual(render('{= default(0, "d") }'), 'd')

    def test_encoding_functions(self):
        self.assertEqual(render('{= escape("<b>") }'), '&lt;b&gt;')
        self.assertEqual(render('{= raw("<b>") }'), '<b>')
        self.assertEqual(render('{= json("a\\"b") | raw }'), '"a\\"b"')
        self.assertEqual(render('{= json(["<" => "&"]) | raw }'), '{"\\u003c":"\\u0026"}')
        self.assertEqual(render('{= url("a b&c") }'), 'a%20b%26c')
        self.assertEqual(render('{= nl2br("a\nb") }'), 'a&lt;br&gt;\nb')
        self.assertEqual(render('{= nl2br("a\nb") | raw }'), 'a<br>\nb')
        self.assertEqual(render('{= type([1]) }'), 'list')

    def test_number_and_date_functions(self):
        self.assertEqual(render('{= number(1234.567, 2) }'), '1,234.57')
        self.assertEqual(render('{= round(1.5) }'), '2')
        self.assertEqual(render('{= floor(1.7) }'), '1'),
        self.assertEqual(render('{= ceil(1.2) }'), '2')
        self.assertEqual(render('{= min(3, 1, 2) }'), '1')
        self.assertEqual(render('{= max(3, 1, 2) }'), '3')
        self.assertEqual(render('{= num("2.5") }'), '2.5')
        env = RenderOptions(env={'timezone': 'Z', 'now': 1700000000})
        self.assertEqual(render('{= now() }', {}, env), '1700000000')
        self.assertEqual(render('{= date(0, "Y-m-d H:i:s") }', {}, env), '1970-01-01 00:00:00')
        self.assertEqual(render('{= date("2024-01-02 03:04:05", "Y-n-j H:i") }', {}, env),
                         '2024-1-2 03:04')
        self.assertEqual(render('{= date(0, "D l N w") }', {}, env), 'Thu Thursday 4 4')
        self.assertEqual(render('{= date(0, "P") }', {}, RenderOptions(
            env={'timezone': '+09:30', 'now': 0})), '+09:30')

    def test_arity_and_unknown_function(self):
        with self.assertRaises(TE) as caught:
            render('{= upper() }')
        self.assertEqual(caught.exception.code, 'E_RUNTIME_ARITY')
        with self.assertRaises(TE) as caught:
            render('{= no_such(1) }')
        self.assertEqual(caught.exception.code, 'E_RUNTIME_UNKNOWN_FUNCTION')


class ValuesAndErrors(unittest.TestCase):

    def test_escape_boundary_of_echo(self):
        self.assertEqual(render('{= "<i>" }'), '&lt;i&gt;')
        self.assertEqual(render('{= raw("<i>") }'), '<i>')

    def test_bind_rules(self):
        with self.assertRaises(BindError):
            parse_json('{"a": NaN}' if False else '{"a": 1e999}')
        with self.assertRaises(BindError):
            parse_json_bytes(b'["\xff"]')
        with self.assertRaises(BindError):
            parse_json('[' * 70 + ']' * 70)
        self.assertEqual(render('{= v }', {'v': SafeString('<b>')}), '&lt;b&gt;')

    def test_host_functions_and_limits(self):
        program = AstProgram(EngineOptions(functions={'shout': lambda args, ctx: args[0] + '!'}))
        self.assertEqual(Engine(program).render('main.tpl', {}, RenderOptions())
                         if False else shout_check(program), 'x!')
        with self.assertRaises(TE) as caught:
            render('{= "x" + [1] }')
        self.assertEqual(caught.exception.code, 'E_RUNTIME_STRINGIFY')
        with self.assertRaises(TE) as caught:
            render('{= 1 / 0 }')
        self.assertEqual(caught.exception.code, 'E_RUNTIME_DIV_ZERO')
        with self.assertRaises(TE) as caught:
            render('{= length(1) }')
        self.assertEqual(caught.exception.code, 'E_RUNTIME_TYPE')

    def test_output_limit_is_a_positioned_template_error(self):
        program = AstProgram(EngineOptions(loader=MapLoader({'main.tpl': 'abc'}),
                                           limits={'outputBytes': 1}))
        with self.assertRaises(TE) as caught:
            render('abc', engine=program)
        error = caught.exception.to_object()
        self.assertEqual(error['code'], 'E_RUNTIME_LIMIT')
        self.assertGreater(error['line'], 0)
        self.assertGreater(error['col'], 0)

    def test_cycle_and_not_found(self):
        engine = Engine(AstProgram(EngineOptions(
            loader=MapLoader({'a.tpl': '{+ "a.tpl" }'}))))
        with self.assertRaises(TE) as caught:
            engine.render('a.tpl', {})
        self.assertEqual(caught.exception.code, 'E_LOAD_CYCLE')
        engine = Engine(AstProgram(EngineOptions(loader=MapLoader({}))))
        with self.assertRaises(TE) as caught:
            engine.render('missing.tpl', {})
        self.assertEqual(caught.exception.code, 'E_LOAD_NOT_FOUND')

    def test_error_positions_are_bytes(self):
        # 한 is three bytes, so the error at the string start reports a byte offset.
        with self.assertRaises(TE) as caught:
            parse('{= "한', 'k.tpl')
        error = caught.exception.to_object()
        self.assertEqual((error['code'], error['line'], error['col']),
                         ('E_PARSE_UNTERMINATED_STRING', 1, 4))

    def test_bound_maps(self):
        first = bind({'a': 1})
        self.assertEqual(list(merge(first, bind({'b': 2})).entries), ['a', 'b'])
        with self.assertRaises(TE):
            merge({'a': 1}, bind({}))

    def test_resolve_path(self):
        self.assertEqual(resolve_path('a/b/c.tpl', 'd.tpl'), 'a/b/d.tpl')
        self.assertEqual(resolve_path('a/b/c.tpl', '/d.tpl'), 'd.tpl')
        with self.assertRaises(Exception):
            resolve_path('a.tpl', '../x.tpl')

    def test_page_cache(self):
        clock = {'now': 100.0}
        cache = PageCache(now=lambda: clock['now'])
        cache.set('k', 'v', 10)
        self.assertEqual(cache.get('k'), 'v')
        self.assertEqual(cache.get_or_set('n', 0, lambda: 'new'), 'new')
        clock['now'] = 200.0
        self.assertIsNone(cache.get('k'))


def shout_check(program):
    return Engine(program).render('main.tpl', {'x': 'x'} if False else {},
                                   RenderOptions(define={})) if False else _shout(program)


def _shout(program):
    from polyspec.template import MapLoader
    program.loader = MapLoader({'main.tpl': '{= shout("x") }'})
    return Engine(program).render('main.tpl', {})


class CommandLine(unittest.TestCase):

    def test_parse_writes_the_ast_json(self):
        directory = Path(__file__).resolve().parents[1]
        result = subprocess.run(
            [sys.executable, '-m', 'polyspec.template.cli', 'parse', 'greeting.tpl'],
            cwd=directory / 'tests' / 'fixtures', capture_output=True, text=True,
            env={'PYTHONPATH': str(directory / 'src'), 'PATH': '/usr/bin:/bin'})
        self.assertEqual(result.returncode, 0, result.stderr)
        ast = json.loads(result.stdout)
        self.assertEqual(ast['type'], 'Template')
        self.assertEqual([node['type'] for node in ast['body']], ['Text', 'Echo', 'Text'])

    def test_render_writes_the_output_and_exit_2_on_template_error(self):
        directory = Path(__file__).resolve().parents[1]
        environment = {'PYTHONPATH': str(directory / 'src'), 'PATH': '/usr/bin:/bin'}
        fixtures = directory / 'tests' / 'fixtures'
        result = subprocess.run(
            [sys.executable, '-m', 'polyspec.template.cli', 'render', 'greeting.tpl',
             '--data', 'greeting.json'],
            cwd=fixtures, capture_output=True, text=True, env=environment)
        self.assertEqual((result.returncode, result.stdout), (0, 'Hello, World!'))
        result = subprocess.run(
            [sys.executable, '-m', 'polyspec.template.cli', 'render', 'broken.tpl'],
            cwd=fixtures, capture_output=True, text=True, env=environment)
        self.assertEqual(result.returncode, 2)
        error = json.loads(result.stderr)
        self.assertEqual(error['code'], 'E_PARSE_UNTERMINATED_TAG')


if __name__ == '__main__':
    unittest.main(verbosity=2)
