"""Expression parser as defined in EXP-7 to EXP-16 and AST-4, AST-5."""

from __future__ import annotations

from typing import Optional

from .errors import TemplateError
from .expr_lexer import ExpressionLexer, LexerOptions, Token
from .source import Source

EQUALITY = {'EQ': '==', 'NE': '!=', 'SEQ': '===', 'SNE': '!=='}
COMPARISON = {'LT': '<', 'GT': '>', 'LE': '<=', 'GE': '>=', 'IN': 'in'}
ADDITIVE = {'PLUS': '+', 'MINUS': '-'}
MULTIPLICATIVE = {'STAR': '*', 'SLASH': '/', 'PERCENT': '%'}

EXPRESSION_START = frozenset(('IDENT', 'NUMBER', 'STRING', 'NULL', 'TRUE', 'FALSE', 'LPAREN',
                              'LBRACKET', 'BANG', 'MINUS'))

EXPRESSION_DEPTH_LIMIT = 64

LOOP_META_FIELDS = ('index_', 'key_', 'value_', 'last_', 'first_', 'size_')


def is_loop_meta_field(name: str) -> bool:
    return name in LOOP_META_FIELDS


class ExpressionParser:
    def __init__(self, source: Source, start: int, options: LexerOptions, template: str):
        self.source = source
        self.options = options
        self.lexer = ExpressionLexer(source, start, options, template)
        self.depth = 0

    def expect_close(self) -> int:
        """Consumes the close delimiter of a tag (LEX-11) and returns the index after it."""
        token = self.peek()
        if token.type == 'CLOSE':
            self.next()
            return token.end
        if token.type == 'EOF':
            raise self.unexpected(token)
        close = self.options.close
        end = -1
        for count in range(self.options.close_count):
            part = self.peek()
            if part.value != close or (count > 0 and part.start != end):
                raise self.unexpected(part)
            self.next()
            end = part.end
        return end

    def at_end(self) -> bool:
        token = self.peek()
        return token.type in ('CLOSE', 'EOF')

    @property
    def end(self) -> int:
        """The code point index after the last consumed token."""
        return self.lexer.consumed_end

    def peek(self) -> Token:
        return self.lexer.peek()

    def next(self) -> Token:
        return self.lexer.next()

    def unexpected(self, token: Token) -> TemplateError:
        if self.options.open_index is not None and self.options.close is not None:
            remaining = self.source.text.find(self.options.close, token.start)
            if remaining < 0:
                return self.lexer.error('E_PARSE_UNTERMINATED_TAG', self.options.open_index,
                                        self.options.open_index + 1, 'tag is not terminated')
        if token.type == 'EOF':
            return self.lexer.error('E_PARSE_UNEXPECTED_TOKEN', token.start, token.start,
                                    'unexpected end of input')
        return self.lexer.error('E_PARSE_UNEXPECTED_TOKEN', token.start, token.end,
                                f'unexpected token {json_text(token.value)}')

    def expect(self, type: str) -> Token:
        token = self.peek()
        if token.type != type:
            raise self.unexpected(token)
        return self.next()

    def _span(self, start: int, end: int) -> tuple[int, int]:
        return self.source.span(start, end)

    def _enter(self) -> None:
        self.depth += 1
        if self.depth > EXPRESSION_DEPTH_LIMIT:
            token = self.peek()
            raise self.lexer.error('E_RUNTIME_LIMIT', token.start, token.end,
                                   f'expression nesting exceeds {EXPRESSION_DEPTH_LIMIT}')

    def _leave(self) -> None:
        self.depth -= 1

    def parse_expression(self) -> dict:
        self._enter()
        start = self.peek().start
        left = self.parse_ternary()
        while self.peek().type == 'PIPE':
            self.next()
            name = self.expect('IDENT')
            args = [left]
            end = name.end
            if self.peek().type == 'LPAREN':
                self.next()
                self._parse_arguments(args)
                end = self.expect('RPAREN').end
            left = {'type': 'Call', 'name': name.value, 'args': args, 'span': self._span(start, end)}
        self._leave()
        return left

    def parse_ternary(self) -> dict:
        start = self.peek().start
        test = self.parse_coalesce()
        token = self.peek()
        if token.type == 'QUESTION':
            self.next()
            then = self.parse_ternary()
            self.expect('COLON')
            otherwise = self.parse_ternary()
            return {'type': 'Ternary', 'test': test, 'then': then, 'else': otherwise,
                    'span': self._span(start, self.end)}
        if token.type == 'ELVIS':
            self.next()
            otherwise = self.parse_ternary()
            return {'type': 'Ternary', 'test': test, 'then': None, 'else': otherwise,
                    'span': self._span(start, self.end)}
        return test

    def parse_coalesce(self) -> dict:
        start = self.peek().start
        left = self.parse_or()
        if self.peek().type != 'COALESCE':
            return left
        operator = self.next()
        if self.peek().type not in EXPRESSION_START:
            literal = {'type': 'Literal', 'kind': 'null', 'value': None,
                       'span': self._span(operator.end, operator.end)}
            return {'type': 'Binary', 'op': '??', 'left': left, 'right': literal,
                    'span': self._span(start, operator.end)}
        right = self.parse_coalesce()
        return {'type': 'Binary', 'op': '??', 'left': left, 'right': right,
                'span': self._span(start, self.end)}

    def parse_or(self) -> dict:
        start = self.peek().start
        left = self.parse_and()
        while self.peek().type == 'OR':
            self.next()
            right = self.parse_and()
            left = {'type': 'Binary', 'op': '||', 'left': left, 'right': right,
                    'span': self._span(start, self.end)}
        return left

    def parse_and(self) -> dict:
        start = self.peek().start
        left = self.parse_equality()
        while self.peek().type == 'AND':
            self.next()
            right = self.parse_equality()
            left = {'type': 'Binary', 'op': '&&', 'left': left, 'right': right,
                    'span': self._span(start, self.end)}
        return left

    def parse_equality(self) -> dict:
        start = self.peek().start
        left = self.parse_comparison()
        op = EQUALITY.get(self.peek().type)
        if not op:
            return left
        self.next()
        right = self.parse_comparison()
        node = {'type': 'Binary', 'op': op, 'left': left, 'right': right,
                'span': self._span(start, self.end)}
        if self.peek().type in EQUALITY:
            raise self.unexpected(self.peek())
        return node

    def parse_comparison(self) -> dict:
        start = self.peek().start
        left = self.parse_additive()
        op = COMPARISON.get(self.peek().type)
        if not op:
            return left
        self.next()
        right = self.parse_additive()
        node = {'type': 'Binary', 'op': op, 'left': left, 'right': right,
                'span': self._span(start, self.end)}
        if self.peek().type in COMPARISON:
            raise self.unexpected(self.peek())
        return node

    def parse_additive(self) -> dict:
        start = self.peek().start
        left = self.parse_multiplicative()
        while True:
            op = ADDITIVE.get(self.peek().type)
            if not op:
                return left
            self.next()
            right = self.parse_multiplicative()
            left = {'type': 'Binary', 'op': op, 'left': left, 'right': right,
                    'span': self._span(start, self.end)}

    def parse_multiplicative(self) -> dict:
        start = self.peek().start
        left = self.parse_unary()
        while True:
            op = MULTIPLICATIVE.get(self.peek().type)
            if not op:
                return left
            self.next()
            right = self.parse_unary()
            left = {'type': 'Binary', 'op': op, 'left': left, 'right': right,
                    'span': self._span(start, self.end)}

    def parse_unary(self) -> dict:
        token = self.peek()
        if token.type in ('BANG', 'MINUS'):
            self.next()
            self._enter()
            operand = self.parse_unary()
            self._leave()
            return {'type': 'Unary', 'op': '!' if token.type == 'BANG' else '-',
                    'operand': operand, 'span': self._span(token.start, self.end)}
        return self.parse_postfix(False)

    def parse_postfix(self, adjacent_only: bool) -> dict:
        """Parses a postfix expression.

        With adjacent_only, accessors and calls must touch the previous token (GRM-14).
        """
        self._enter()
        first = self.peek()
        start = first.start
        if first.type == 'IDENT':
            self.next()
            after = self.peek()
            if after.type == 'DOUBLE_COLON':
                self.next()
                method = self.expect('IDENT')
                self.expect('LPAREN')
                args: list[dict] = []
                self._parse_arguments(args)
                close = self.expect('RPAREN')
                node = {'type': 'ClassCall', 'className': first.value, 'method': method.value,
                        'args': args, 'span': self._span(start, close.end)}
            elif after.type == 'LPAREN' and (not adjacent_only or after.start == first.end):
                self.next()
                args = []
                self._parse_arguments(args)
                close = self.expect('RPAREN')
                node = {'type': 'Call', 'name': first.value, 'args': args,
                        'span': self._span(start, close.end)}
            elif after.type == 'DOT_IDENT' and is_loop_meta_field(after.value[1:]):
                self.next()
                field = after.value[1:]
                node = {'type': 'LoopMeta', 'loop': first.value, 'field': field,
                        'span': self._span(start, after.end)}
            else:
                node = {'type': 'Var', 'name': first.value, 'span': self._span(start, first.end)}
        else:
            node = self._parse_primary()
        while True:
            token = self.peek()
            if adjacent_only and token.start != self.end:
                break
            if token.type in ('DOT_IDENT', 'DOT_INDEX'):
                self.next()
                method = token.value[1:]
                if (self.peek().type == 'LPAREN'
                        and (not adjacent_only or self.peek().start == token.end)):
                    self.next()
                    args = []
                    self._parse_arguments(args)
                    close = self.expect('RPAREN')
                    node = {'type': 'MemberCall', 'object': node, 'method': method, 'args': args,
                            'span': self._span(start, close.end)}
                else:
                    node = {'type': 'Member', 'object': node, 'key': method,
                            'span': self._span(start, token.end)}
            elif token.type == 'LBRACKET':
                self.next()
                index = self.parse_expression()
                close = self.expect('RBRACKET')
                node = {'type': 'Index', 'object': node, 'index': index,
                        'span': self._span(start, close.end)}
            elif token.type == 'LPAREN':
                raise self.unexpected(token)
            else:
                break
        self._leave()
        return node

    def _parse_primary(self) -> dict:
        token = self.peek()
        if token.type == 'NULL':
            self.next()
            return {'type': 'Literal', 'kind': 'null', 'value': None,
                    'span': self._span(token.start, token.end)}
        if token.type in ('TRUE', 'FALSE'):
            self.next()
            return {'type': 'Literal', 'kind': 'bool', 'value': token.type == 'TRUE',
                    'span': self._span(token.start, token.end)}
        if token.type == 'NUMBER':
            self.next()
            return {'type': 'Literal', 'kind': 'number', 'value': float(token.value),
                    'span': self._span(token.start, token.end)}
        if token.type == 'STRING':
            self.next()
            return {'type': 'Literal', 'kind': 'string', 'value': token.decoded or '',
                    'span': self._span(token.start, token.end)}
        if token.type == 'LPAREN':
            self.next()
            inner = self.parse_expression()
            self.expect('RPAREN')
            return inner
        if token.type == 'LBRACKET':
            return self._parse_bracket()
        raise self.unexpected(token)

    def _parse_bracket(self) -> dict:
        open_token = self.next()
        entries: list[dict] = []
        arrows = 0
        while self.peek().type != 'RBRACKET':
            token = self.peek()
            if token.type == 'SPREAD':
                self.next()
                expr = self.parse_expression()
                entries.append({'type': 'Spread', 'expr': expr,
                                'span': self._span(token.start, self.end)})
            else:
                key = self.parse_expression()
                if self.peek().type == 'ARROW':
                    self.next()
                    arrows += 1
                    entries.append({'key': key, 'value': self.parse_expression()})
                else:
                    entries.append({'key': key, 'value': None})
            if self.peek().type == 'COMMA':
                self.next()
                continue
            if self.peek().type != 'RBRACKET':
                raise self.unexpected(self.peek())
        close = self.next()
        span = self._span(open_token.start, close.end)
        if arrows == 0:
            return {'type': 'List',
                    'items': [entry if 'type' in entry else entry['key']
                              for entry in entries],
                    'span': span}
        map_entries = []
        for entry in entries:
            if 'expr' in entry:
                map_entries.append(entry)
            elif entry['value'] is None:
                start = entry['key']['span'][0]
                raise self.lexer.error('E_PARSE_UNEXPECTED_TOKEN', self._index_of_byte(start),
                                       self._index_of_byte(start) + 1,
                                       'map literal entry without "=>"')
            else:
                map_entries.append(entry)
        return {'type': 'Map', 'entries': map_entries, 'span': span}

    def _parse_arguments(self, args: list[dict]) -> None:
        while self.peek().type != 'RPAREN':
            args.append(self.parse_expression())
            if self.peek().type == 'COMMA':
                self.next()
                continue
            if self.peek().type != 'RPAREN':
                raise self.unexpected(self.peek())

    def _index_of_byte(self, byte: int) -> int:
        low, high = 0, len(self.source.text)
        while low < high:
            middle = (low + high) >> 1
            if self.source.byte_at(middle) < byte:
                low = middle + 1
            else:
                high = middle
        return low


def json_text(value: str) -> str:
    import json
    return json.dumps(value)
