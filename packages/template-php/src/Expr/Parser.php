<?php

declare(strict_types=1);

namespace Polyspec\Template\Expr;

use Polyspec\Template\Ast;
use Polyspec\Template\Source;
use Polyspec\Template\TemplateError;

/**
 * Expression parser as defined in EXP-7 to EXP-16 and AST-4, AST-5.
 * Nodes are nested arrays with the fields of docs/spec/ast.md.
 */
final class Parser
{
    public const DEPTH_LIMIT = 64;

    private const EQUALITY = ['EQ' => '==', 'NE' => '!=', 'SEQ' => '===', 'SNE' => '!=='];
    private const COMPARISON = ['LT' => '<', 'GT' => '>', 'LE' => '<=', 'GE' => '>=', 'IN' => 'in'];
    private const ADDITIVE = ['PLUS' => '+', 'MINUS' => '-'];
    private const MULTIPLICATIVE = ['STAR' => '*', 'SLASH' => '/', 'PERCENT' => '%'];
    private const EXPRESSION_START = [
        'IDENT' => true, 'NUMBER' => true, 'STRING' => true, 'NULL' => true, 'TRUE' => true, 'FALSE' => true,
        'LPAREN' => true, 'LBRACKET' => true, 'BANG' => true, 'MINUS' => true,
    ];

    public readonly Lexer $lexer;
    private int $depth = 0;

    public function __construct(
        private readonly Source $source,
        int $start,
        ?string $close,
        int $closeCount,
        ?int $openIndex,
        string $template,
    ) {
        $this->lexer = new Lexer($source, $start, $close, $closeCount, $openIndex, $template);
    }

    /**
     * Byte index after the last consumed token.
     */
    public function end(): int
    {
        return $this->lexer->consumedEnd();
    }

    public function peek(): Token
    {
        return $this->lexer->peek();
    }

    public function next(): Token
    {
        return $this->lexer->next();
    }

    public function unexpected(Token $token): TemplateError
    {
        $close = $this->lexer->close;
        $open = $this->lexer->openIndex;
        if ($open !== null && $close !== null && strpos($this->source->text, $close, $token->start) === false) {
            return $this->lexer->error('E_PARSE_UNTERMINATED_TAG', $open, $open + 1, 'tag is not terminated');
        }
        if ($token->type === 'EOF') {
            return $this->lexer->error('E_PARSE_UNEXPECTED_TOKEN', $token->start, $token->start, 'unexpected end of input');
        }

        return $this->lexer->error('E_PARSE_UNEXPECTED_TOKEN', $token->start, $token->end, 'unexpected token ' . json_encode($token->value));
    }

    public function expect(string $type): Token
    {
        $token = $this->peek();
        if ($token->type !== $type) {
            throw $this->unexpected($token);
        }

        return $this->next();
    }

    /**
     * Consumes the close delimiter of a tag (LEX-11) and returns the index after it.
     */
    public function expectClose(): int
    {
        $token = $this->peek();
        if ($token->type === 'CLOSE') {
            $this->next();

            return $token->end;
        }
        if ($token->type === 'EOF') {
            throw $this->unexpected($token);
        }
        $close = (string) $this->lexer->close;
        $end = -1;
        for ($k = 0; $k < $this->lexer->closeCount; $k++) {
            $part = $this->peek();
            if ($part->value !== $close || ($k > 0 && $part->start !== $end)) {
                throw $this->unexpected($part);
            }
            $this->next();
            $end = $part->end;
        }

        return $end;
    }

    private function enter(): void
    {
        $this->depth++;
        if ($this->depth > self::DEPTH_LIMIT) {
            $token = $this->peek();
            throw $this->lexer->error('E_RUNTIME_LIMIT', $token->start, $token->end, 'expression nesting exceeds ' . self::DEPTH_LIMIT);
        }
    }

    private function leave(): void
    {
        $this->depth--;
    }

    /**
     * @return array<string, mixed>
     */
    public function parseExpression(): array
    {
        $this->enter();
        $start = $this->peek()->start;
        $left = $this->parseTernary();
        while ($this->peek()->type === 'PIPE') {
            $this->next();
            $name = $this->expect('IDENT');
            $args = [$left];
            $end = $name->end;
            if ($this->peek()->type === 'LPAREN') {
                $this->next();
                $this->parseArguments($args);
                $end = $this->expect('RPAREN')->end;
            }
            $left = Ast::call($name->value, $args, $start, $end);
        }
        $this->leave();

        return $left;
    }

    /**
     * @return array<string, mixed>
     */
    private function parseTernary(): array
    {
        $start = $this->peek()->start;
        $test = $this->parseCoalesce();
        $token = $this->peek();
        if ($token->type === 'QUESTION') {
            $this->next();
            $then = $this->parseTernary();
            $this->expect('COLON');
            $else = $this->parseTernary();

            return Ast::ternary($test, $then, $else, $start, $this->end());
        }
        if ($token->type === 'ELVIS') {
            $this->next();
            $else = $this->parseTernary();

            return Ast::ternary($test, null, $else, $start, $this->end());
        }

        return $test;
    }

    /**
     * @return array<string, mixed>
     */
    private function parseCoalesce(): array
    {
        $start = $this->peek()->start;
        $left = $this->parseOr();
        if ($this->peek()->type !== 'COALESCE') {
            return $left;
        }
        $operator = $this->next();
        if (!isset(self::EXPRESSION_START[$this->peek()->type])) {
            $literal = Ast::literal('null', null, $operator->end, $operator->end);

            return Ast::binary('??', $left, $literal, $start, $operator->end);
        }
        $right = $this->parseCoalesce();

        return Ast::binary('??', $left, $right, $start, $this->end());
    }

    /**
     * @return array<string, mixed>
     */
    private function parseOr(): array
    {
        $start = $this->peek()->start;
        $left = $this->parseAnd();
        while ($this->peek()->type === 'OR') {
            $this->next();
            $right = $this->parseAnd();
            $left = Ast::binary('||', $left, $right, $start, $this->end());
        }

        return $left;
    }

    /**
     * @return array<string, mixed>
     */
    private function parseAnd(): array
    {
        $start = $this->peek()->start;
        $left = $this->parseEquality();
        while ($this->peek()->type === 'AND') {
            $this->next();
            $right = $this->parseEquality();
            $left = Ast::binary('&&', $left, $right, $start, $this->end());
        }

        return $left;
    }

    /**
     * @return array<string, mixed>
     */
    private function parseEquality(): array
    {
        $start = $this->peek()->start;
        $left = $this->parseComparison();
        $op = self::EQUALITY[$this->peek()->type] ?? null;
        if ($op === null) {
            return $left;
        }
        $this->next();
        $right = $this->parseComparison();
        $node = Ast::binary($op, $left, $right, $start, $this->end());
        if (isset(self::EQUALITY[$this->peek()->type])) {
            throw $this->unexpected($this->peek());
        }

        return $node;
    }

    /**
     * @return array<string, mixed>
     */
    private function parseComparison(): array
    {
        $start = $this->peek()->start;
        $left = $this->parseAdditive();
        $op = self::COMPARISON[$this->peek()->type] ?? null;
        if ($op === null) {
            return $left;
        }
        $this->next();
        $right = $this->parseAdditive();
        $node = Ast::binary($op, $left, $right, $start, $this->end());
        if (isset(self::COMPARISON[$this->peek()->type])) {
            throw $this->unexpected($this->peek());
        }

        return $node;
    }

    /**
     * @return array<string, mixed>
     */
    private function parseAdditive(): array
    {
        $start = $this->peek()->start;
        $left = $this->parseMultiplicative();
        for (;;) {
            $op = self::ADDITIVE[$this->peek()->type] ?? null;
            if ($op === null) {
                return $left;
            }
            $this->next();
            $right = $this->parseMultiplicative();
            $left = Ast::binary($op, $left, $right, $start, $this->end());
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function parseMultiplicative(): array
    {
        $start = $this->peek()->start;
        $left = $this->parseUnary();
        for (;;) {
            $op = self::MULTIPLICATIVE[$this->peek()->type] ?? null;
            if ($op === null) {
                return $left;
            }
            $this->next();
            $right = $this->parseUnary();
            $left = Ast::binary($op, $left, $right, $start, $this->end());
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function parseUnary(): array
    {
        $token = $this->peek();
        if ($token->type === 'BANG' || $token->type === 'MINUS') {
            $this->next();
            $this->enter();
            $operand = $this->parseUnary();
            $this->leave();

            return Ast::unary($token->type === 'BANG' ? '!' : '-', $operand, $token->start, $this->end());
        }

        return $this->parsePostfix(false);
    }

    /**
     * Parses a postfix expression. With $adjacentOnly, accessors and calls must touch the previous token (GRM-14).
     *
     * @return array<string, mixed>
     */
    public function parsePostfix(bool $adjacentOnly): array
    {
        $this->enter();
        $first = $this->peek();
        $start = $first->start;
        if ($first->type === 'IDENT') {
            $this->next();
            $after = $this->peek();
            if ($after->type === 'LPAREN' && (!$adjacentOnly || $after->start === $first->end)) {
                $this->next();
                $args = [];
                $this->parseArguments($args);
                $close = $this->expect('RPAREN');
                $node = Ast::call($first->value, $args, $start, $close->end);
            } elseif ($after->type === 'DOT_IDENT' && Ast::isLoopMetaField(substr($after->value, 1))) {
                $this->next();
                $node = Ast::loopMeta($first->value, substr($after->value, 1), $start, $after->end);
            } else {
                $node = Ast::variable($first->value, $start, $first->end);
            }
        } else {
            $node = $this->parsePrimary();
        }
        for (;;) {
            $token = $this->peek();
            if ($adjacentOnly && $token->start !== $this->end()) {
                break;
            }
            if ($token->type === 'DOT_IDENT' || $token->type === 'DOT_INDEX') {
                $this->next();
                $node = Ast::member($node, substr($token->value, 1), $start, $token->end);
            } elseif ($token->type === 'LBRACKET') {
                $this->next();
                $index = $this->parseExpression();
                $close = $this->expect('RBRACKET');
                $node = Ast::index($node, $index, $start, $close->end);
            } elseif ($token->type === 'LPAREN') {
                throw $this->unexpected($token);
            } else {
                break;
            }
        }
        $this->leave();

        return $node;
    }

    /**
     * @return array<string, mixed>
     */
    private function parsePrimary(): array
    {
        $token = $this->peek();
        switch ($token->type) {
            case 'NULL':
                $this->next();

                return Ast::literal('null', null, $token->start, $token->end);
            case 'TRUE':
            case 'FALSE':
                $this->next();

                return Ast::literal('bool', $token->type === 'TRUE', $token->start, $token->end);
            case 'NUMBER':
                $this->next();

                return Ast::literal('number', (float) $token->value, $token->start, $token->end);
            case 'STRING':
                $this->next();

                return Ast::literal('string', $token->decoded ?? '', $token->start, $token->end);
            case 'LPAREN':
                $this->next();
                $inner = $this->parseExpression();
                $this->expect('RPAREN');

                return $inner;
            case 'LBRACKET':
                return $this->parseBracket();
            default:
                throw $this->unexpected($token);
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function parseBracket(): array
    {
        $open = $this->next();
        /** @var list<array{key: array<string, mixed>, value: array<string, mixed>|null}|array<string, mixed>> $entries */
        $entries = [];
        $arrows = 0;
        while ($this->peek()->type !== 'RBRACKET') {
            $token = $this->peek();
            if ($token->type === 'SPREAD') {
                $this->next();
                $expr = $this->parseExpression();
                $entries[] = Ast::spread($expr, $token->start, $this->end());
            } else {
                $key = $this->parseExpression();
                if ($this->peek()->type === 'ARROW') {
                    $this->next();
                    $arrows++;
                    $entries[] = ['key' => $key, 'value' => $this->parseExpression()];
                } else {
                    $entries[] = ['key' => $key, 'value' => null];
                }
            }
            if ($this->peek()->type === 'COMMA') {
                $this->next();
                continue;
            }
            if ($this->peek()->type !== 'RBRACKET') {
                throw $this->unexpected($this->peek());
            }
        }
        $close = $this->next();
        if ($arrows === 0) {
            $items = [];
            foreach ($entries as $entry) {
                $items[] = isset($entry['type']) ? $entry : $entry['key'];
            }

            return Ast::listLiteral($items, $open->start, $close->end);
        }
        $mapEntries = [];
        foreach ($entries as $entry) {
            if (isset($entry['type'])) {
                $mapEntries[] = $entry;
            } elseif ($entry['value'] === null) {
                $keyStart = $entry['key']['span'][0];
                throw $this->lexer->error('E_PARSE_UNEXPECTED_TOKEN', $keyStart, $keyStart + 1, 'map literal entry without "=>"');
            } else {
                $mapEntries[] = ['key' => $entry['key'], 'value' => $entry['value']];
            }
        }

        return Ast::mapLiteral($mapEntries, $open->start, $close->end);
    }

    /**
     * @param list<array<string, mixed>> $args
     */
    private function parseArguments(array &$args): void
    {
        while ($this->peek()->type !== 'RPAREN') {
            $args[] = $this->parseExpression();
            if ($this->peek()->type === 'COMMA') {
                $this->next();
                continue;
            }
            if ($this->peek()->type !== 'RPAREN') {
                throw $this->unexpected($this->peek());
            }
        }
    }
}
