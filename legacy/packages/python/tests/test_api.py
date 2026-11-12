#!/usr/bin/env python3
"""Package tests of the template engine.
Each test names the behavior it holds; the shared conformance cases of the
repository run in CI through the command line interface.
"""

import unittest

from polyspec.template import (
    AstProgram,
    BindError,
    Engine,
    EngineOptions,
    MapLoader,
    PageCache,
    ParseOptions,
    RenderOptions,
    RuntimeEnvironment,
    SafeString,
    analyze,
    _analyze_prefix,
    bind,
    merge,
    parse,
    parse_json,
    parse_json_bytes,
    resolve_path,
)
from polyspec.template.errors import TemplateError as TE
from polyspec.template.errors import error_without_position
from polyspec.template.number import format_number, number_to_string, round_number
from polyspec.template.values import is_truthy, loose_equals, parse_numeric_string


def render(source: str, assign=None, options=None, engine=None):
    program = engine or AstProgram(
        EngineOptions(loader=MapLoader({"main.tpl": source}))
    )
    return Engine(program).render(
        "main.tpl", assign if assign is not None else {}, options or RenderOptions()
    )


class Parsing(unittest.TestCase):
    def test_text_echo_and_comments(self):
        ast = parse("a{* hidden *}b{= v }c", "t.tpl")
        self.assertEqual(
            [node["type"] for node in ast["body"]], ["Text", "Echo", "Text"]
        )
        self.assertEqual(ast["comments"][0]["value"], " hidden ")
        self.assertEqual(render("a{* hidden *}b{= v }c", {"v": "B"}), "abBc")

    def test_if_else_and_elseif(self):
        source = "{? x > 2 }big{:? x > 1 }mid{:}small{/}"
        self.assertEqual(render(source, {"x": 3}), "big")
        self.assertEqual(render(source, {"x": 2}), "mid")
        self.assertEqual(render(source, {"x": 1}), "small")

    def test_loop_and_loop_meta(self):
        source = "{@ it = items }[{= it.index_ }:{= it }:{= it.first_ }:{= it.last_ }]{:}none{/}"
        self.assertEqual(
            render(source, {"items": parse_json('["a","b"]')}),
            "[0:a:true:false][1:b:false:true]",
        )
        self.assertEqual(render(source, {"items": parse_json("[]")}), "none")

    def test_map_loop_keys_and_values(self):
        source = "{@ e = m }{= e.key_ }={= e.value_ };{/}"
        self.assertEqual(render(source, {"m": parse_json('{"x":1,"y":2}')}), "x=1;y=2;")

    def test_assignment_forms(self):
        self.assertEqual(render("{: a = 2 }{= a }"), "2")
        self.assertEqual(render("{: a = 1 }{: a++ }{= a }"), "2")
        self.assertEqual(render("{: a = 10 }{: a -= 3 }{= a }"), "7")

    def test_include_resolves_against_the_current_template(self):
        engine = Engine(
            AstProgram(
                EngineOptions(
                    loader=MapLoader(
                        {"top.tpl": '{+ "sub/row.tpl" }', "sub/row.tpl": "R"}
                    )
                )
            )
        )
        self.assertEqual(engine.render("top.tpl", {}), "R")

    def test_block_and_ifblock_with_define(self):
        engine = Engine(
            AstProgram(
                EngineOptions(
                    loader=MapLoader({"shell.tpl": "[{# main }]", "part.tpl": "P"})
                )
            )
        )
        options = RenderOptions(
            define={"main": {"template": "part.tpl", "data": {"x": 1}}}
        )
        self.assertEqual(engine.render("shell.tpl", {}, options), "[P]")
        self.assertEqual(
            engine.render(
                "shell.tpl", {}, RenderOptions(define={"main": {"html": "H"}})
            ),
            "[H]",
        )

    def test_delimiter_directive(self):
        # LEX-22: the option selects the delimiters; LEX-23: a directive selects them for the rest of the file and is
        # valid only first.
        self.assertEqual(render("{% delimiter %%}%= 1 + 2 %"), "3")
        self.assertEqual(
            parse(";= a;", "t.tpl", ParseOptions(delimiters=";;"))["body"][0]["type"],
            "Echo",
        )
        for source in ("{= a}{% delimiter ;;}", "{% delimiter ab}"):
            with self.assertRaises(TE) as caught:
                parse(source, "t.tpl")
            self.assertEqual(caught.exception.code, "E_PARSE_INVALID_DIRECTIVE", source)

    def test_wrapped_tags(self):
        self.assertEqual(render('"{{= v }}"', {"v": "x"}), "x")
        self.assertEqual(render("<!--{? 1 }y{/}-->", {}), "<!--y-->")

    def test_escaped_open_delimiter(self):
        self.assertEqual(render(r"\{= v }", {}), "{= v }")

    def test_standalone_lines_vanish(self):
        self.assertEqual(render("A\n{: a = 1 }\n{= a }\nB"), "A\n1\nB")

    def test_analyze_returns_tags_and_tokens(self):
        analysis = analyze("{= 1 + x }", "t.tpl")
        self.assertEqual(analysis.tags[0]["kind"], "echo")
        self.assertTrue(any(token["kind"] == "number" for token in analysis.tokens))

    def test__analyze_prefix_reports_the_error_with_the_prefix(self):
        analysis = _analyze_prefix("{= 1 }{= ", "t.tpl")
        self.assertIsNotNone(analysis.error)
        self.assertEqual(analysis.tags[0]["kind"], "echo")

    def test_a_parse_error_is_the_error_object(self):
        # ERR-1: a parse error is a TemplateError with the fields code, template, line,
        # col, offset, end and message, in that order.
        with self.assertRaises(TE) as caught:
            parse("a\n{? x}", "x.tpl")
        error = caught.exception.to_object()
        self.assertEqual(
            list(error),
            ["code", "template", "line", "col", "offset", "end", "message"],
        )
        self.assertEqual(
            [
                error[key]
                for key in ("code", "template", "line", "col", "offset", "end")
            ],
            ["E_PARSE_UNCLOSED_BLOCK", "x.tpl", 2, 1, 2, 3],
        )
        self.assertNotEqual(error["message"], "")
        missing = error_without_position("E_LOAD_NOT_FOUND", "missing.tpl", "missing")
        self.assertEqual(
            missing.to_object(),
            dict(
                code="E_LOAD_NOT_FOUND",
                template="missing.tpl",
                line=0,
                col=0,
                offset=0,
                end=0,
                message="missing",
            ),
        )


class Expressions(unittest.TestCase):
    def test_operators(self):
        cases = [
            ("{= 1 + 2 * 3 }", "7"),
            ("{= (1 + 2) * 3 }", "9"),
            ("{= 7 % 3 }", "1"),
            ("{= -7 % 3 }", "-1"),
            ("{= 7 / 2 }", "3.5"),
            ('{= "a" + 1 }', "a1"),
            ("{= 1 < 2 }", "true"),
            ('{= "1" == 1 }', "true"),
            ('{= "1" === 1 }', "false"),
            ("{= 1 != 2 }", "true"),
            ('{= null ?? "d" }', "d"),
            ('{= 0 ?? "d" }', "0"),
            ("{= true && false }", "false"),
            ("{= false || 1 }", "true"),
            ("{= !0 }", "true"),
            ('{= 1 > 2 ? "a" : "b" }', "b"),
            ('{= null ?: "x" }', "x"),
            ("{= 2 in [1, 2] }", "true"),
        ]
        for source, expected in cases:
            with self.subTest(source=source):
                self.assertEqual(render(source), expected)

    def test_member_index_and_calls(self):
        assign = {"m": parse_json('{"a": {"b": [10, 20]}}')}
        self.assertEqual(render("{= m.a.b[1] }", assign), "20")
        self.assertEqual(render('{= m["a"]["b"][0] }', assign), "10")
        self.assertEqual(render("{= m.a.z }", assign), "")
        self.assertEqual(render('{= upper("hi") | lower }'), "hi")

    def test_list_and_map_literals(self):
        self.assertEqual(render("{= json([1, ...[2, 3]]) | raw }"), "[1,2,3]")
        self.assertEqual(
            render('{= json(["a" => 1, ...["b" => 2]]) | raw }'), '{"a":1,"b":2}'
        )
        self.assertEqual(render('{= "a" in ["a" => 1] }'), "true")

    def test_numbers_follow_ecmascript_tostring(self):
        # VAL-9: a number is converted to text by the shortest round-trip digits in positional or exponent form; VAL-10: the digits come from the platform.
        for value, expected in (
            (0.0, "0"),
            (1.0, "1"),
            (123.456, "123.456"),
            (1e21, "1e+21"),
            (1e-7, "1e-7"),
            (0.1 + 0.2, "0.30000000000000004"),
        ):
            self.assertEqual(number_to_string(value), expected)

    def test_number_formatting(self):
        self.assertEqual(format_number(1234567.891, 2, ".", ","), "1,234,567.89")
        self.assertEqual(format_number(0.5, 0, ".", ""), "1")
        self.assertEqual(format_number(-0.4, 0, ".", ""), "0")
        self.assertEqual(round_number(2.5, 0), 3.0)

    def test_loose_numeric_equality(self):
        self.assertTrue(loose_equals("1.50", 1.5))
        self.assertFalse(loose_equals("1.50x", 1.5))
        self.assertIsNone(parse_numeric_string("nan"))

    def test_only_the_listed_values_are_falsy(self):
        # EXP-33: null, false, 0, -0, the empty string, the empty list and the
        # empty map are falsy; every other value, also the string "0", is truthy.
        for value in (None, False, 0.0, -0.0, "", [], {}):
            self.assertFalse(is_truthy(value), repr(value))
        for value in ("0", " ", 1.0, [0], {"a": 0}, True):
            self.assertTrue(is_truthy(value), repr(value))


class Functions(unittest.TestCase):
    def test_string_functions(self):
        cases = [
            ('{= upper("aé") }', "Aé"),
            ('{= lower("AÉ") }', "aÉ"),
            ('{= trim("  hi  ") }', "hi"),
            ('{= trim("xxhixx", "x") }', "hi"),
            ('{= replace("aXaXa", "X", "-") }', "a-a-a"),
            ('{= json(split("a,b", ",")) | raw }', '["a","b"]'),
            ('{= truncate("hello", 3) }', "hel..."),
            ('{= truncate("hello", 3, "!") }', "hel!"),
            ('{= contains("hello", "ell") }', "true"),
            ('{= contains([1, 2], "2") }', "true"),
            ('{= starts_with("hello", "he") }', "true"),
            ('{= ends_with("hello", "lo") }', "true"),
            ('{= length("héllo") }', "5"),
            ("{= length([1, 2]) }", "2"),
            ('{= first("hi") }', "h"),
            ('{= last("hi") }', "i"),
            ('{= reverse("ab") }', "ba"),
            ('{= slice("hello", 1, 3) }', "ell"),
            ('{= slice("hello", -2) }', "lo"),
        ]
        for source, expected in cases:
            with self.subTest(source=source):
                self.assertEqual(render(source), expected)

    def test_astral_code_points(self):
        self.assertEqual(render('{= length("😀a") }'), "2")
        self.assertEqual(render('{= first("😀a") }', {}), "😀")
        self.assertEqual(render('{= truncate("😀ab", 2) }'), "😀a...")

    def test_collection_functions(self):
        assign = {"m": parse_json('{"b": 2, "a": 1}')}
        self.assertEqual(render("{= json(keys(m)) | raw }", assign), '["b","a"]')
        self.assertEqual(render("{= json(values(m)) | raw }", assign), "[2,1]")
        self.assertEqual(render("{= json(sort([3, 1, 2])) | raw }"), "[1,2,3]")
        self.assertEqual(
            render(
                '{= json(sort(items, "n")) | raw }',
                {"items": parse_json('[{"n":2},{"n":1}]')},
            ),
            '[{"n":1},{"n":2}]',
        )
        self.assertEqual(render('{= join(["a","b"], "-") }'), "a-b")
        self.assertEqual(render("{= json(range(1, 4)) | raw }"), "[1,2,3,4]")
        self.assertEqual(render('{= default(0, "d") }'), "d")

    def test_encoding_functions(self):
        self.assertEqual(render('{= escape("<b>") }'), "&lt;b&gt;")
        self.assertEqual(render('{= raw("<b>") }'), "<b>")
        self.assertEqual(render('{= json("a\\"b") | raw }'), '"a\\"b"')
        self.assertEqual(
            render('{= json(["<" => "&"]) | raw }'), '{"\\u003c":"\\u0026"}'
        )
        self.assertEqual(render('{= url("a b&c") }'), "a%20b%26c")
        self.assertEqual(render('{= nl2br("a\nb") }'), "a&lt;br&gt;\nb")
        self.assertEqual(render('{= nl2br("a\nb") | raw }'), "a<br>\nb")
        self.assertEqual(render("{= type([1]) }"), "list")

    def test_number_and_date_functions(self):
        # FUN-39: the output is computed in the fixed offset of the time zone; FUN-40: the format tokens.
        self.assertEqual(render("{= number(1234.567, 2) }"), "1,234.57")
        self.assertEqual(render("{= round(1.5) }"), "2")
        self.assertEqual(render("{= floor(1.7) }"), "1")
        self.assertEqual(render("{= ceil(1.2) }"), "2")
        self.assertEqual(render("{= min(3, 1, 2) }"), "1")
        self.assertEqual(render("{= max(3, 1, 2) }"), "3")
        self.assertEqual(render('{= num("2.5") }'), "2.5")
        env = RenderOptions(env={"timezone": "Z", "now": 1700000000})
        self.assertEqual(render("{= now() }", {}, env), "1700000000")
        self.assertEqual(
            render('{= date(0, "Y-m-d H:i:s") }', {}, env), "1970-01-01 00:00:00"
        )
        self.assertEqual(
            render('{= date("2024-01-02 03:04:05", "Y-n-j H:i") }', {}, env),
            "2024-1-2 03:04",
        )
        self.assertEqual(render('{= date(0, "D l N w") }', {}, env), "Thu Thursday 4 4")
        self.assertEqual(
            render(
                '{= date(0, "P") }',
                {},
                RenderOptions(env={"timezone": "+09:30", "now": 0}),
            ),
            "+09:30",
        )

    def test_date_string_with_an_offset_out_of_range_is_not_a_date(self):
        env = RenderOptions(env={"timezone": "Z", "now": 0})
        for text in ("2024-01-01T12:00:00+25:00", "2024-01-01T12:00:00+05:60"):
            with self.assertRaises(TE, msg=text) as caught:
                render(f'{{= date("{text}", "Y") }}', {}, env)
            self.assertEqual(caught.exception.code, "E_RUNTIME_TYPE")

    def test_arity_and_unknown_function(self):
        with self.assertRaises(TE) as caught:
            render("{= upper() }")
        self.assertEqual(caught.exception.code, "E_RUNTIME_ARITY")
        with self.assertRaises(TE) as caught:
            render("{= no_such(1) }")
        self.assertEqual(caught.exception.code, "E_RUNTIME_UNKNOWN_FUNCTION")


class ValuesAndErrors(unittest.TestCase):
    def test_escape_boundary_of_echo(self):
        self.assertEqual(render('{= "<i>" }'), "&lt;i&gt;")
        self.assertEqual(render('{= raw("<i>") }'), "<i>")

    def test_numbers_are_checked_by_value(self):
        # VAL-2: a number outside the safe integer range fails by its value,
        # whatever its host type or its spelling in JSON text.
        for value in (2**53, 1e19, -9007199254740992.0, 2**60):
            with self.assertRaises(TE, msg=repr(value)) as caught:
                bind({"n": value})
            self.assertEqual(caught.exception.code, "E_DATA_NUMBER_RANGE", repr(value))
        for text in (
            "9007199254740992",
            "9007199254740992.0",
            "1e19",
            "-9.007199254740992e15",
        ):
            with self.assertRaises(BindError, msg=text) as caught:
                parse_json(text)
            self.assertEqual(caught.exception.code, "E_DATA_NUMBER_RANGE", text)
        self.assertEqual(
            render("{= n }", {"n": -9007199254740991.0}), "-9007199254740991"
        )

    def test_map_keys_that_are_not_valid_unicode_are_rejected(self):
        # VAL-17: a map key is checked like a string value; a key that is not valid
        # Unicode text is E_DATA_INVALID_UTF8.
        with self.assertRaises(TE) as caught:
            render("{= json(m) | raw}", {"m": {"\ud800": 1}})
        self.assertEqual(caught.exception.code, "E_DATA_INVALID_UTF8")

    def test_bind_rules(self):
        with self.assertRaises(BindError):
            parse_json('{"a": 1e999}')
        with self.assertRaises(BindError):
            parse_json_bytes(b'["\xff"]')
        with self.assertRaises(BindError):
            parse_json("[" * 70 + "]" * 70)
        self.assertEqual(render("{= v }", {"v": SafeString("<b>")}), "&lt;b&gt;")

    def test_host_functions_and_limits(self):
        program = AstProgram(
            EngineOptions(functions={"shout": lambda args, _context: args[0] + "!"})
        )
        self.assertEqual(_shout(program), "x!")
        with self.assertRaises(TE) as caught:
            render('{= "x" + [1] }')
        self.assertEqual(caught.exception.code, "E_RUNTIME_STRINGIFY")
        with self.assertRaises(TE) as caught:
            render("{= 1 / 0 }")
        self.assertEqual(caught.exception.code, "E_RUNTIME_DIV_ZERO")
        with self.assertRaises(TE) as caught:
            render("{= length(1) }")
        self.assertEqual(caught.exception.code, "E_RUNTIME_TYPE")

    def test_the_limits_and_functions_of_a_program_are_checked(self):
        # RT-5, RT-6: limits and functions are checked when the program is created.
        loader = MapLoader({"main.tpl": "x"})
        cases = [
            ({"limits": 5}, "limits is not an object"),
            ({"limits": [1]}, "limits is not an object"),
            ({"limits": {"loops": 1}}, "limits.loops is not a limit"),
            ({"limits": {"iterations": 1.5}}, "limits.iterations is not an integer"),
            ({"limits": {"depth": "3"}}, "limits.depth is not an integer"),
            ({"limits": {"depth": True}}, "limits.depth is not an integer"),
            ({"functions": 5}, "functions is not an object"),
            ({"functions": {"f": 1}}, "functions.f is not a function"),
        ]
        for options, message in cases:
            with self.subTest(options=options):
                with self.assertRaises(ValueError) as cm:
                    AstProgram(EngineOptions(loader=loader, **options))
                self.assertEqual(str(cm.exception), message)
        program = AstProgram(
            EngineOptions(
                loader=loader,
                limits={"iterations": 10},
                functions={"f": lambda args: 1},
            )
        )
        self.assertEqual(program.runtime.limits()["iterations"], 10)

    def test_a_define_or_an_env_that_is_not_a_map_is_unsupported(self):
        # RT-4: a define or an env that is not a map fails the render.
        cases = [
            (RenderOptions(define="b.tpl"), "define is not an object"),
            (RenderOptions(define=[1]), "define is not an object"),
            (RenderOptions(env=0), "env is not an object"),
            (RenderOptions(env=["Z"]), "env is not an object"),
        ]
        for options, message in cases:
            with self.subTest(message=message):
                engine = Engine(
                    AstProgram(EngineOptions(loader=MapLoader({"main.tpl": "x"})))
                )
                with self.assertRaises(TE) as caught:
                    engine.render("main.tpl", {}, options)
                error = caught.exception.to_object()
                self.assertEqual(error["code"], "E_DATA_UNSUPPORTED_TYPE")
                self.assertEqual(error["message"], message)

    def test_the_iteration_limit_is_applied(self):
        # RT-20: exceeding the iteration limit fails with E_RUNTIME_LIMIT.
        program = AstProgram(
            EngineOptions(
                loader=MapLoader({"a.tpl": "{@ i = range(1, 10)}{= i}{/}"}),
                limits={"iterations": 5},
            )
        )
        with self.assertRaises(TE) as caught:
            Engine(program).render("a.tpl", {})
        self.assertEqual(caught.exception.code, "E_RUNTIME_LIMIT")

    def test_output_limit_is_a_positioned_template_error(self):
        program = AstProgram(
            EngineOptions(
                loader=MapLoader({"main.tpl": "abc"}), limits={"outputBytes": 1}
            )
        )
        with self.assertRaises(TE) as caught:
            render("abc", engine=program)
        error = caught.exception.to_object()
        self.assertEqual(error["code"], "E_RUNTIME_LIMIT")
        self.assertGreater(error["line"], 0)
        self.assertGreater(error["col"], 0)

    def test_render_limits_defaults_output_and_abort(self):
        defaults = dict(
            iterations=1_000_000,
            depth=32,
            outputBytes=16 * 1024 * 1024,
            expressionDepth=64,
        )
        for key in defaults:
            with self.subTest(key):
                self.assertEqual(
                    RuntimeEnvironment({key: 7}).limits(), {**defaults, key: 7}
                )
        # RT-33: the default limits; RT-35: the output size is checked as the output is written, and exceeding it
        # fails; RT-36: a failed render aborts and returns no partial output.
        self.assertEqual(
            RuntimeEnvironment().limits(),
            {
                "iterations": 1_000_000,
                "depth": 32,
                "outputBytes": 16 * 1024 * 1024,
                "expressionDepth": 64,
            },
        )

        program = AstProgram(
            EngineOptions(
                loader=MapLoader({"a.tpl": "ab{= 'cd'}"}), limits={"outputBytes": 4}
            )
        )
        self.assertEqual(Engine(program).render("a.tpl", {}), "abcd")

        program = AstProgram(
            EngineOptions(
                loader=MapLoader({"a.tpl": "ab{= 'cd'}"}), limits={"outputBytes": 3}
            )
        )
        result = None
        with self.assertRaises(TE) as caught:
            result = Engine(program).render("a.tpl", {})
        self.assertIsNone(result)
        error = caught.exception.to_object()
        self.assertEqual(error["code"], "E_RUNTIME_LIMIT")
        self.assertEqual(error["line"], 1)
        self.assertEqual(error["col"], 3)

    def test_cycle_and_not_found(self):
        engine = Engine(
            AstProgram(EngineOptions(loader=MapLoader({"a.tpl": '{+ "a.tpl" }'})))
        )
        with self.assertRaises(TE) as caught:
            engine.render("a.tpl", {})
        self.assertEqual(caught.exception.code, "E_LOAD_CYCLE")
        engine = Engine(AstProgram(EngineOptions(loader=MapLoader({}))))
        with self.assertRaises(TE) as caught:
            engine.render("missing.tpl", {})
        self.assertEqual(caught.exception.code, "E_LOAD_NOT_FOUND")

    def test_renders_a_parsed_ast(self):
        # RT-40: a program renders the AST that its loader holds without
        # parsing a source.
        ast = parse("{= a + 1}", "x.tpl")
        engine = Engine(AstProgram(EngineOptions(loader=MapLoader({"x.tpl": ast}))))
        self.assertEqual(engine.render("x.tpl", {"a": 2}), "3")

    # RT-3: render takes a template name, loaded through the loader, or a
    # parsed template, and returns the whole output as one string.
    def test_render_targets(self):
        engine = Engine(
            AstProgram(EngineOptions(loader=MapLoader({"a.tpl": "<p>{= x}</p>"})))
        )
        self.assertEqual(engine.render("a.tpl", {"x": 1}), "<p>1</p>")
        ast = parse("<p>{= x}</p>", "a.tpl")
        self.assertEqual(engine.render(ast, {"x": 1}), "<p>1</p>")

    def test_spans_count_bytes(self):
        # AST-2, LEX-16: é is two bytes, so the echo after it starts at byte 2.
        ast = parse("é{= a}", "t.tpl")
        self.assertEqual(ast["body"][1]["span"], (2, 7))

    def test_error_positions_are_bytes(self):
        # The Hangul syllable in the string is three bytes, so the error at the string start reports a byte offset.
        with self.assertRaises(TE) as caught:
            parse('{= "한', "k.tpl")
        error = caught.exception.to_object()
        self.assertEqual(
            (error["code"], error["line"], error["col"]),
            ("E_PARSE_UNTERMINATED_STRING", 1, 4),
        )

    def test_bound_maps(self):
        first = bind({"a": 1})
        self.assertEqual(list(merge(first, bind({"b": 2})).entries), ["a", "b"])
        with self.assertRaises(TE):
            merge({"a": 1}, bind({}))

    def test_resolve_path(self):
        # RT-8: a path resolves against the directory of the current template, a leading / against the root, and a
        # path that leaves the root fails with E_LOAD_OUTSIDE_ROOT.
        self.assertEqual(resolve_path("a/b/c.tpl", "d.tpl"), "a/b/d.tpl")
        self.assertEqual(resolve_path("a/b/c.tpl", "/d.tpl"), "d.tpl")
        with self.assertRaises(Exception):
            resolve_path("a.tpl", "../x.tpl")
        program = AstProgram(EngineOptions(loader=MapLoader({"o.tpl": "{+ ../z.tpl}"})))
        with self.assertRaises(TE) as caught:
            Engine(program).render("o.tpl", {})
        self.assertEqual(caught.exception.code, "E_LOAD_OUTSIDE_ROOT")

    def test_page_cache_delete_and_clear(self):
        # RT-65/66: empty pages are hits; deletion affects one key and clear all.
        cache = PageCache(now=lambda: 100.0)
        cache.set("empty", "", None)
        cache.set("other", "other", None)
        self.assertEqual(
            cache.get_or_set("empty", None, lambda: self.fail("empty page is a hit")),
            "",
        )
        cache.delete("empty")
        cache.delete("absent")
        self.assertIsNone(cache.get("empty"))
        self.assertEqual(cache.get("other"), "other")
        self.assertEqual(cache.get_or_set("empty", None, lambda: "new"), "new")
        cache.clear()
        self.assertIsNone(cache.get("empty"))
        self.assertIsNone(cache.get("other"))

    def test_page_cache(self):
        # RT-65: a positive TTL expires after that many seconds; 0 and null mean forever.
        clock = {"now": 100.0}
        cache = PageCache(now=lambda: clock["now"])
        cache.set("k", "v", 10)
        cache.set("zero", "z", 0)
        cache.set("null", "n", None)
        self.assertEqual(cache.get("k"), "v")
        self.assertEqual(cache.get_or_set("n", 0, lambda: "new"), "new")
        clock["now"] = 200.0
        self.assertIsNone(cache.get("k"))
        self.assertEqual(cache.get("zero"), "z")
        self.assertEqual(cache.get("null"), "n")

    def test_get_or_set_calls_render_once_and_stores_with_the_ttl(self):
        # RT-66: get_or_set returns the cached HTML on a hit without calling render; on a miss it calls render once,
        # stores the HTML with the TTL and returns it.
        clock = {"now": 100.0}
        cache = PageCache(now=lambda: clock["now"])
        calls = []

        def render_as(html):
            def render():
                calls.append(html)
                return html

            return render

        self.assertEqual(cache.get_or_set("page", 10, render_as("first")), "first")
        self.assertEqual(len(calls), 1)
        self.assertEqual(cache.get_or_set("page", 10, render_as("second")), "first")
        self.assertEqual(len(calls), 1)
        self.assertEqual(cache.get("page"), "first")
        clock["now"] = 111.0
        self.assertEqual(cache.get_or_set("page", 10, render_as("third")), "third")
        self.assertEqual(len(calls), 2)


def _shout(program):
    from polyspec.template import MapLoader

    program.loader = MapLoader({"main.tpl": '{= shout("x") }'})
    return Engine(program).render("main.tpl", {})


if __name__ == "__main__":
    unittest.main(verbosity=2)
