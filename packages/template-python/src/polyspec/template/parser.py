"""Template parser: text scanning, tag bodies, block structure and standalone
lines as defined in docs/spec/lexical.md and docs/spec/grammar.md.

An AST node is a plain dict with a `type` field; its shape is the JSON form of
docs/spec/ast.md.
"""

from __future__ import annotations

import re
from typing import Optional

from .errors import TemplateError, error_at
from .expr_lexer import LexerOptions, Token
from .expr_parser import ExpressionParser
from .scanner import (DEFAULT_DELIMITERS, is_horizontal_space, parse_delimiters, sigil_after,
                      skip_horizontal_space, starts_tag, wrapped_tag_at)
from .source import Source
from .standalone import standalone_ranges

_RESERVED = frozenset(('true', 'false', 'null', 'in'))
_ASSIGN_HEAD = re.compile(r'([A-Za-z_][A-Za-z0-9_]*)[ \t]*(\+\+|--|[-+*/%]=|=(?![=>]))')
_LOOP_HEAD = re.compile(r'[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*=')

_LEADING_WHITESPACE = re.compile(r'[ \t\r\n]*\Z')

_TAG_KINDS = {None: None, '*': 'comment', '=': 'echo', '@': 'for', '?': 'if', '?#': 'ifblock',
              ':?': 'elseif', ':': 'else', '/': 'close', '+': 'include', '#': 'block',
              '%': 'directive'}


class TemplateAnalysis:
    __slots__ = ('ast', 'tags', 'tokens')

    def __init__(self, ast: dict, tags: list[dict], tokens: list[dict]):
        self.ast = ast
        self.tags = tags
        self.tokens = tokens


class PrefixAnalysis:
    __slots__ = ('tags', 'tokens', 'error')

    def __init__(self, tags: list[dict], tokens: list[dict], error: 'TemplateError | None'):
        self.tags = tags
        self.tokens = tokens
        self.error = error


def parse_template(source: Source, delimiters: tuple[str, str] = DEFAULT_DELIMITERS) -> dict:
    return analyze_template(source, delimiters).ast


def analyze_template(source: Source,
                     delimiters: tuple[str, str] = DEFAULT_DELIMITERS) -> TemplateAnalysis:
    return _TemplateParser(source, delimiters).parse()


def analyze_template_prefix(source: Source,
                            delimiters: tuple[str, str] = DEFAULT_DELIMITERS) -> PrefixAnalysis:
    """The tag ranges and expression tokens a parse accepted before its first
    error, and that error (EDT-6)."""
    parser = _TemplateParser(source, delimiters)
    try:
        analysis = parser.parse()
        return PrefixAnalysis(analysis.tags, analysis.tokens, None)
    except TemplateError as error:
        return PrefixAnalysis(parser._tags, parser._consumed_tokens(), error)


def _syntax_token(token: Token) -> dict:
    keywords = frozenset(('NULL', 'TRUE', 'FALSE'))
    variables = frozenset(('IDENT', 'DOT_IDENT', 'DOT_INDEX'))
    kind = ('string' if token.type == 'STRING' else 'number' if token.type == 'NUMBER'
            else 'keyword' if token.type in keywords
            else 'variable' if token.type in variables else 'operator')
    return {'start': token.start, 'end': token.end, 'kind': kind}


class _Frame:
    __slots__ = ('node', 'items', 'has_else', 'open_start')

    def __init__(self, node: dict, items: list, open_start: int):
        self.node = node
        # The item list that receives new items.
        self.items = items
        self.has_else = False
        self.open_start = open_start


class _TagContext:
    __slots__ = ('start', 'open', 'close_count', 'wrapper')

    def __init__(self, start: int, open_index: int, close_count: int, wrapper):
        # The code point index of the tag start, including the wrapper.
        self.start = start
        # The code point index of the open delimiter (the second one for a wrapped tag).
        self.open = open_index
        self.close_count = close_count
        self.wrapper = wrapper


class _TemplateParser:
    def __init__(self, source: Source, delimiters: tuple[str, str]):
        self.delimiters = delimiters
        self.source = source
        self.text = source.text
        self._root: list = []
        self._frames: list[_Frame] = []
        self._tags: list[dict] = []
        self._comments: list[dict] = []
        self._expression_parsers: list[ExpressionParser] = []
        self._saw_tag = False
        self._text_before_first_tag_is_whitespace = True

    @property
    def _name(self) -> str:
        return self.source.name

    def _fail(self, code: str, start: int, end: int, message: str) -> TemplateError:
        return error_at(code, self._name, self.source.lines, self.source.span(start, end),
                        message)

    @property
    def _items(self) -> list:
        return self._frames[-1].items if self._frames else self._root

    def parse(self) -> TemplateAnalysis:
        self._scan()
        if self._frames:
            frame = self._frames[-1]
            raise self._fail('E_PARSE_UNCLOSED_BLOCK', frame.open_start, frame.open_start + 1,
                             'block is not closed before the end of the file')
        removed = standalone_ranges(self.text, self._tags)
        return TemplateAnalysis(
            {'type': 'Template', 'name': self._name, 'body': self._finalize(self._root, removed),
             'comments': self._comments},
            self._tags, self._consumed_tokens())

    def _consumed_tokens(self) -> list[dict]:
        return [mapped for parser in self._expression_parsers
                for token in parser.lexer.consumed
                if token.type not in ('CLOSE', 'EOF')
                for mapped in (_syntax_token(token),)]

    # Pass 1: text scanning and tag parsing.
    def _scan(self) -> None:
        text = self.text
        index = 0
        text_start = 0

        def flush_text(end: int) -> None:
            if end > text_start:
                self._push_text(text_start, end, text[text_start:end])

        while index < len(text):
            char = text[index]
            open_char = self.delimiters[0]
            if (char == '\\' and text[index + 1:index + 2] == open_char
                    and starts_tag(text, index + 1, self.delimiters)):
                flush_text(index)
                self._push_text(index, index + 2, open_char)
                index += 2
                text_start = index
                continue
            if char == open_char and starts_tag(text, index, self.delimiters):
                flush_text(index)
                index = self._parse_tag(_TagContext(index, index, 1, None))
                text_start = index
                continue
            wrapper = wrapped_tag_at(text, index, self.delimiters)
            if wrapper is not None:
                flush_text(index)
                open_index = skip_horizontal_space(text, index + len(wrapper[0])) + 1
                index = self._parse_tag(_TagContext(index, open_index, 2, wrapper))
                text_start = index
                continue
            index += 1
        flush_text(len(text))

    def _push_text(self, start: int, end: int, value: str) -> None:
        if (not self._saw_tag and self._text_before_first_tag_is_whitespace
                and not _LEADING_WHITESPACE.fullmatch(value)):
            self._text_before_first_tag_is_whitespace = False
        self._items.append({'kind': 'text', 'start': start, 'end': end, 'value': value})

    def _close_sequence(self, context: _TagContext) -> str:
        return self.delimiters[1] * context.close_count

    # Parses one tag starting at context.start and returns the code point index after it.
    def _parse_tag(self, context: _TagContext) -> int:
        text = self.text
        sigil = sigil_after(text, context.open)
        if sigil is None:
            body_start = context.open + 1
        else:
            body_start = skip_horizontal_space(
                text, skip_horizontal_space(text, context.open + 1) + len(sigil))
        is_directive = sigil == '%'
        first_tag = not self._saw_tag
        self._saw_tag = True

        echo = False
        if sigil == '*':
            end = self._parse_comment(context, body_start)
        elif sigil == '=':
            echo = True
            parser = self._expression_parser(context, body_start)
            expr = parser.parse_expression()
            end = self._finish_tag(context, parser.expect_close())
            self._items.append({'type': 'Echo', 'expr': expr,
                                'span': self.source.span(context.start, end)})
        elif sigil == '@':
            end = self._parse_loop(context, body_start)
        elif sigil == '?':
            parser = self._expression_parser(context, body_start)
            test = parser.parse_expression()
            end = self._finish_tag(context, parser.expect_close())
            span = self.source.span(context.start, end)
            node = {'type': 'If', 'branches': [{'test': test, 'body': [], 'span': span}],
                    'else': None, 'span': span}
            self._open_frame(node, node['branches'][0]['body'], context.start)
        elif sigil == '?#':
            parser = self._expression_parser(context, body_start)
            id = parser.expect('IDENT')
            end = self._finish_tag(context, parser.expect_close())
            node = {'type': 'IfBlock', 'id': id.value, 'body': [], 'else': None,
                    'span': self.source.span(context.start, end)}
            self._open_frame(node, node['body'], context.start)
        elif sigil == ':?':
            frame = self._frames[-1] if self._frames else None
            if frame is None:
                raise self._fail('E_PARSE_ELSE_OUTSIDE_BLOCK', context.start, context.start + 1,
                                 '"{:?}" outside of a block')
            if frame.node['type'] != 'If':
                raise self._fail('E_PARSE_ELSEIF_NOT_IN_IF', context.start, context.start + 1,
                                 '"{:?}" inside a loop or if-block')
            if frame.has_else:
                raise self._fail('E_PARSE_ELSEIF_AFTER_ELSE', context.start, context.start + 1,
                                 '"{:?}" after "{:}"')
            parser = self._expression_parser(context, body_start)
            test = parser.parse_expression()
            end = self._finish_tag(context, parser.expect_close())
            body: list = []
            frame.node['branches'].append({'test': test, 'body': body,
                                           'span': self.source.span(context.start, end)})
            frame.items = body
        elif sigil == ':':
            if _ASSIGN_HEAD.match(text, body_start):
                end = self._parse_assignment(context, body_start)
            else:
                frame = self._frames[-1] if self._frames else None
                if frame is None:
                    raise self._fail('E_PARSE_ELSE_OUTSIDE_BLOCK', context.start, context.start + 1,
                                     '"{:}" outside of a block')
                if frame.has_else:
                    raise self._fail('E_PARSE_DUPLICATE_ELSE', context.start, context.start + 1,
                                     'second "{:}" in the same block')
                end = self._finish_tag(context, self._expect_close_raw(context, body_start))
                body = []
                if frame.node['type'] == 'For':
                    frame.node['empty'] = body
                else:
                    frame.node['else'] = body
                frame.has_else = True
                frame.items = body
        elif sigil == '/':
            frame = self._frames.pop() if self._frames else None
            if frame is None:
                raise self._fail('E_PARSE_UNEXPECTED_CLOSE', context.start, context.start + 1,
                                 '"{/}" without an open block')
            end = self._finish_tag(context, self._expect_close_raw(context, body_start))
            frame.node['span'] = self.source.span(frame.open_start, end)
            self._items.append(frame.node)
        elif sigil == '+':
            reader = self._raw_reader(context)
            path, path_end = reader.read_include_path(body_start)
            end = self._finish_tag(context, self._expect_close_raw(context, path_end))
            self._items.append({'type': 'Include', 'path': path,
                                'span': self.source.span(context.start, end)})
        elif sigil == '#':
            reader = self._raw_reader(context)
            body_result = reader.read_block_body(body_start)
            end = self._finish_tag(context, self._expect_close_raw(context, body_result.end))
            self._items.append({'type': 'Block', 'id': body_result.id, 'path': body_result.path,
                                'scope': body_result.scope,
                                'span': self.source.span(context.start, end)})
        elif sigil == '%':
            end = self._parse_directive(context, body_start, first_tag)
        else:
            raise self._fail('E_PARSE_UNEXPECTED_TOKEN', body_start, body_start + 1, 'unknown tag')
        if is_directive and not first_tag:
            raise self._fail('E_PARSE_INVALID_DIRECTIVE', context.start, context.start + 1,
                             'delimiter directive is not the first tag')
        assignment = sigil == ':' and _ASSIGN_HEAD.match(text, body_start) is not None
        kind = 'assignment' if assignment else _TAG_KINDS[sigil]
        self._tags.append({'start': context.start, 'end': end, 'echo': echo, 'kind': kind})
        return end

    def _expression_parser(self, context: _TagContext, start: int) -> ExpressionParser:
        parser = ExpressionParser(
            self.source, start,
            LexerOptions(close=self.delimiters[1], close_count=context.close_count,
                         open_index=context.open),
            self._name)
        self._expression_parsers.append(parser)
        return parser

    def _raw_reader(self, context: _TagContext):
        from .block_tag import RawTagReader
        return RawTagReader(self.source, self._name, self.delimiters[1], context.close_count,
                            self._fail)

    def _expect_close_raw(self, context: _TagContext, index: int) -> int:
        """Skips horizontal whitespace and consumes the close delimiter sequence."""
        at = skip_horizontal_space(self.text, index)
        sequence = self._close_sequence(context)
        if self.text.startswith(sequence, at):
            return at + len(sequence)
        if self.text.find(self.delimiters[1], at) < 0:
            raise self._fail('E_PARSE_UNTERMINATED_TAG', context.open, context.open + 1,
                             'tag is not terminated')
        raise self._fail('E_PARSE_UNEXPECTED_TOKEN', at, at + 1,
                         f'unexpected {json_text(self.text[at])} before the end of the tag')

    def _finish_tag(self, context: _TagContext, after_close: int) -> int:
        """For a wrapped tag, consumes the wrapper closer after the close delimiters (LEX-19)."""
        if context.wrapper is None:
            return after_close
        at = skip_horizontal_space(self.text, after_close)
        if not self.text.startswith(context.wrapper[1], at):
            raise self._fail('E_PARSE_INVALID_WRAPPER', context.start,
                             context.start + len(context.wrapper[0]),
                             f'wrapped tag is not followed by {json_text(context.wrapper[1])}')
        return at + len(context.wrapper[1])

    def _parse_comment(self, context: _TagContext, body_start: int) -> int:
        terminator = '*' + self._close_sequence(context)
        at = self.text.find(terminator, body_start)
        if at < 0:
            raise self._fail('E_PARSE_UNTERMINATED_COMMENT', context.open, context.open + 1,
                             'comment is not terminated')
        end = self._finish_tag(context, at + len(terminator))
        # The value starts after the sigil `*` (AST-9).
        value_start = skip_horizontal_space(self.text, context.open + 1) + 1
        self._comments.append({'type': 'Comment', 'value': self.text[value_start:at],
                               'span': self.source.span(context.start, end)})
        return end

    def _parse_loop(self, context: _TagContext, body_start: int) -> int:
        head = _LOOP_HEAD.match(self.text, body_start)
        if not head:
            at = skip_horizontal_space(self.text, body_start)
            raise self._fail('E_PARSE_UNEXPECTED_TOKEN', at, at + 1,
                             'loop requires "name = expression"')
        name = head.group(1)
        name_start = body_start + head.group(0).index(name)
        if name in _RESERVED:
            raise self._fail('E_PARSE_RESERVED_NAME', name_start, name_start + len(name),
                             f'{name} is a reserved word')
        parser = self._expression_parser(context, head.end())
        iter_expr = parser.parse_expression()
        end = self._finish_tag(context, parser.expect_close())
        span = self.source.span(context.start, end)
        node = {'type': 'For', 'name': name, 'iter': iter_expr, 'body': [], 'empty': None,
                'span': span}
        self._open_frame(node, node['body'], context.start)
        return end

    def _parse_assignment(self, context: _TagContext, body_start: int) -> int:
        head = _ASSIGN_HEAD.match(self.text, body_start)
        if not head:
            raise self._fail('E_PARSE_UNEXPECTED_TOKEN', body_start, body_start + 1, 'unknown tag')
        name = head.group(1)
        operator = head.group(2)
        if name in _RESERVED:
            raise self._fail('E_PARSE_RESERVED_NAME', body_start, body_start + len(name),
                             f'{name} is a reserved word')
        variable = {'type': 'Var', 'name': name,
                    'span': self.source.span(body_start, body_start + len(name))}
        after_operator = head.end()
        if operator in ('++', '--'):
            end = self._finish_tag(context, self._expect_close_raw(context, after_operator))
            operator_start = after_operator - 2
            one = {'type': 'Literal', 'kind': 'number', 'value': 1.0,
                   'span': self.source.span(operator_start, after_operator)}
            expr = {'type': 'Binary', 'op': '+' if operator == '++' else '-',
                    'left': variable, 'right': one,
                    'span': self.source.span(body_start, after_operator)}
        else:
            parser = self._expression_parser(context, after_operator)
            value = parser.parse_expression()
            end = self._finish_tag(context, parser.expect_close())
            if operator == '=':
                expr = value
            else:
                expr = {'type': 'Binary', 'op': operator[0], 'left': variable, 'right': value,
                        'span': self.source.span(body_start, parser.end)}
        self._items.append({'type': 'Set', 'name': name, 'expr': expr,
                            'span': self.source.span(context.start, end)})
        return end

    def _parse_directive(self, context: _TagContext, body_start: int, first_tag: bool) -> int:
        def invalid(message: str) -> TemplateError:
            return self._fail('E_PARSE_INVALID_DIRECTIVE', context.start, context.start + 1,
                              message)

        if not first_tag or not self._text_before_first_tag_is_whitespace:
            raise invalid('delimiter directive is not the first tag')
        index = skip_horizontal_space(self.text, body_start)
        if not self.text.startswith('delimiter', index):
            raise invalid('directive is not "delimiter"')
        index = skip_horizontal_space(self.text, index + len('delimiter'))
        value = ''
        while (index < len(self.text)
               and not is_horizontal_space(ord(self.text[index]))
               and not self.text.startswith(self._close_sequence(context), index)):
            value += self.text[index]
            index += 1
            if len(value) > 2:
                break
        delimiters = parse_delimiters(value)
        if delimiters is None:
            raise invalid(f'{json_text(value)} is not a delimiter pair')
        end = self._finish_tag(context, self._expect_close_raw(context, index))
        self.delimiters = delimiters
        return end

    def _open_frame(self, node: dict, items: list, open_start: int) -> None:
        self._frames.append(_Frame(node, items, open_start))

    # Pass 3: applies standalone removal to text pieces and merges them into Text nodes.
    def _finalize(self, items: list, removed: list[tuple[int, int]]) -> list[dict]:
        nodes: list[dict] = []
        pending: list[dict] = []

        def flush() -> None:
            if not pending:
                return
            value = ''.join(piece['value'] for piece in pending)
            if value:
                nodes.append({'type': 'Text', 'value': value,
                              'span': self.source.span(pending[0]['start'], pending[-1]['end'])})
            pending.clear()

        for item in items:
            if 'kind' in item:
                pending.extend(_cut_piece(item, removed))
                continue
            flush()
            nodes.append(self._finalize_node(item, removed))
        flush()
        return nodes

    def _finalize_node(self, node: dict, removed: list[tuple[int, int]]) -> dict:
        if node['type'] == 'If':
            node['branches'] = [dict(branch, body=self._finalize(branch['body'], removed))
                                for branch in node['branches']]
            if node['else'] is not None:
                node['else'] = self._finalize(node['else'], removed)
        elif node['type'] == 'For':
            node['body'] = self._finalize(node['body'], removed)
            if node['empty'] is not None:
                node['empty'] = self._finalize(node['empty'], removed)
        elif node['type'] == 'IfBlock':
            node['body'] = self._finalize(node['body'], removed)
            if node['else'] is not None:
                node['else'] = self._finalize(node['else'], removed)
        return node


def _cut_piece(piece: dict, removed: list[tuple[int, int]]) -> list[dict]:
    """Removes the parts of a text piece that fall inside removed ranges."""
    result: list[dict] = []
    cursor = piece['start']

    def push(start: int, end: int) -> None:
        if end <= start:
            return
        value = (piece['value'][start - piece['start']:end - piece['start']]
                 if piece['end'] - piece['start'] == len(piece['value']) else piece['value'])
        result.append({'kind': 'text', 'start': start, 'end': end, 'value': value})

    for start, end in removed:
        if end <= cursor:
            continue
        if start >= piece['end']:
            break
        push(cursor, min(start, piece['end']))
        cursor = max(cursor, end)
    push(cursor, piece['end'])
    return result


def json_text(value: str) -> str:
    import json
    return json.dumps(value)
