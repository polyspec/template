<?php

declare(strict_types=1);

namespace Polyspec\Template\Expr;

use Polyspec\Template\Ast;
use Polyspec\Template\ErrorCode;
use Polyspec\Template\Source;
use Polyspec\Template\TemplateError;

/**
 * Expression parser as defined in EXP-7 to EXP-16 and AST-4, AST-5.
 * Nodes are nested arrays with the fields of docs/spec/ast.md.
 */
final class Parser
{
    public const DEPTH_LIMIT = 64;

    private const OR = ['OR' => '||'];
    private const AND = ['AND' => '&&'];
    private const EQUALITY = ['EQ' => '==', 'NE' => '!=', 'SEQ' => '===', 'SNE' => '!=='];
    private const COMPARISON = ['LT' => '<', 'GT' => '>', 'LE' => '<=', 'GE' => '>=', 'IN' => 'in'];
    private const ADDITIVE = ['PLUS' => '+', 'MINUS' => '-'];
    private const MULTIPLICATIVE = ['STAR' => '*', 'SLASH' => '/', 'PERCENT' => '%'];
    /** The precedence levels of the binary operators, loosest first: the table of operators and whether the level chains. */
    private const LEVELS = [
        [self::OR, true],
        [self::AND, true],
        [self::EQUALITY, false],
        [self::COMPARISON, false],
        [self::ADDITIVE, true],
        [self::MULTIPLICATIVE, true],
    ];
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
            return $this->lexer->error(ErrorCode::E_PARSE_UNTERMINATED_TAG, $open, $open + 1, 'tag is not terminated');
        }
        if ($token->type === 'EOF') {
            return $this->lexer->error(
                ErrorCode::E_PARSE_UNEXPECTED_TOKEN,
                $token->start,
                $token->start,
                'unexpected end of input',
            );
        }

        return $this->lexer->error(
            ErrorCode::E_PARSE_UNEXPECTED_TOKEN,
            $token->start,
            $token->end,
            'unexpected token ' . json_encode($token->value),
        );
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
            throw $this->lexer->error(
                ErrorCode::E_RUNTIME_LIMIT,
                $token->start,
                $token->end,
                'expression nesting exceeds ' . self::DEPTH_LIMIT,
            );
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
            $left = Ast::node('Call', ['name' => $name->value, 'args' => $args], $start, $end);
        }
        $this->leave();

        return $left;
    }

    /**
     * The conditional expression and the elvis operator (EXP-9).
     *
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

            return Ast::node('Ternary', ['test' => $test, 'then' => $then, 'else' => $else], $start, $this->lexer->consumedEnd());
        }
        if ($token->type === 'ELVIS') {
            $this->next();
            $else = $this->parseTernary();

            return Ast::node('Ternary', ['test' => $test, 'then' => null, 'else' => $else], $start, $this->lexer->consumedEnd());
        }

        return $test;
    }

    /**
     * The coalesce operator, whose missing right operand is `null` (EXP-9, EXP-14).
     *
     * @return array<string, mixed>
     */
    private function parseCoalesce(): array
    {
        $start = $this->peek()->start;
        $left = $this->parseLevel(0);
        if ($this->peek()->type !== 'COALESCE') {
            return $left;
        }
        $operator = $this->next();
        if (!isset(self::EXPRESSION_START[$this->peek()->type])) {
            $literal = Ast::node('Literal', ['kind' => 'null', 'value' => null], $operator->end, $operator->end);

            return Ast::node('Binary', ['op' => '??', 'left' => $left, 'right' => $literal], $start, $operator->end);
        }
        $right = $this->parseCoalesce();

        return Ast::node('Binary', ['op' => '??', 'left' => $left, 'right' => $right], $start, $this->lexer->consumedEnd());
    }

    /**
     * A precedence level of the binary operators, from the loosest (index 0) to the tightest, which is joined by unary
     * expressions: operands of the next level joined by the operators of the level. The operators of a level that chains
     * join from the left; an operator of a level that does not chain (associativity none, EXP-10) is unexpected after the
     * second operand.
     *
     * @return array<string, mixed>
     */
    private function parseLevel(int $level): array
    {
        if ($level === count(self::LEVELS)) {
            return $this->parseUnary();
        }
        [$operators, $chains] = self::LEVELS[$level];
        $start = $this->peek()->start;
        $left = $this->parseLevel($level + 1);
        while (($op = $operators[$this->peek()->type] ?? null) !== null) {
            $this->next();
            $right = $this->parseLevel($level + 1);
            $left = Ast::node('Binary', ['op' => $op, 'left' => $left, 'right' => $right], $start, $this->lexer->consumedEnd());
            if (!$chains && isset($operators[$this->peek()->type])) {
                throw $this->unexpected($this->peek());
            }
            if (!$chains) {
                break;
            }
        }

        return $left;
    }

    /**
     * The prefix operators `!` and `-` (EXP-9).
     *
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

            return Ast::node('Unary', ['op' => $token->type === 'BANG' ? '!' : '-', 'operand' => $operand], $token->start, $this->lexer->consumedEnd());
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
            if ($after->type === 'DOUBLE_COLON') {
                $this->next();
                $method = $this->expect('IDENT');
                $this->expect('LPAREN');
                $args = [];
                $this->parseArguments($args);
                $close = $this->expect('RPAREN');
                $node = Ast::node('ClassCall', ['className' => $first->value, 'method' => $method->value, 'args' => $args], $start, $close->end);
            } elseif ($after->type === 'LPAREN' && (!$adjacentOnly || $after->start === $first->end)) {
                $this->next();
                $args = [];
                $this->parseArguments($args);
                $close = $this->expect('RPAREN');
                $node = Ast::node('Call', ['name' => $first->value, 'args' => $args], $start, $close->end);
            } elseif ($after->type === 'DOT_IDENT' && Ast::isLoopMetaField(substr($after->value, 1))) {
                $this->next();
                $node = Ast::node('LoopMeta', ['loop' => $first->value, 'field' => substr($after->value, 1)], $start, $after->end);
            } else {
                $node = Ast::node('Var', ['name' => $first->value], $start, $first->end);
            }
        } else {
            $node = $this->parsePrimary();
        }
        for (;;) {
            $token = $this->peek();
            if ($adjacentOnly && $token->start !== $this->lexer->consumedEnd()) {
                break;
            }
            if ($token->type === 'DOT_IDENT' || $token->type === 'DOT_INDEX') {
                $this->next();
                $method = substr($token->value, 1);
                $next = $this->peek();
                if ($next->type === 'LPAREN' && (!$adjacentOnly || $next->start === $token->end)) {
                    $this->next();
                    $args = [];
                    $this->parseArguments($args);
                    $close = $this->expect('RPAREN');
                    $node = Ast::node('MemberCall', ['object' => $node, 'method' => $method, 'args' => $args], $start, $close->end);
                } else {
                    $node = Ast::node('Member', ['object' => $node, 'key' => $method], $start, $token->end);
                }
            } elseif ($token->type === 'LBRACKET') {
                $this->next();
                $index = $this->parseExpression();
                $close = $this->expect('RBRACKET');
                $node = Ast::node('Index', ['object' => $node, 'index' => $index], $start, $close->end);
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
     * A primary expression: a literal, a bracket literal, a parenthesized expression or a variable (EXP-7).
     *
     * @return array<string, mixed>
     */
    private function parsePrimary(): array
    {
        $token = $this->peek();
        switch ($token->type) {
            case 'NULL':
                $this->next();

                return Ast::node('Literal', ['kind' => 'null', 'value' => null], $token->start, $token->end);
            case 'TRUE':
            case 'FALSE':
                $this->next();

                return Ast::node('Literal', ['kind' => 'bool', 'value' => $token->type === 'TRUE'], $token->start, $token->end);
            case 'NUMBER':
                $this->next();

                return Ast::node('Literal', ['kind' => 'number', 'value' => (float) $token->value], $token->start, $token->end);
            case 'STRING':
                $this->next();

                return Ast::node('Literal', ['kind' => 'string', 'value' => $token->decoded ?? ''], $token->start, $token->end);
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
                $entries[] = Ast::node('Spread', ['expr' => $expr], $token->start, $this->lexer->consumedEnd());
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

            return Ast::node('List', ['items' => $items], $open->start, $close->end);
        }
        $mapEntries = [];
        foreach ($entries as $entry) {
            if (isset($entry['type'])) {
                $mapEntries[] = $entry;
            } elseif ($entry['value'] === null) {
                $keyStart = $entry['key']['span'][0];
                throw $this->lexer->error(
                    ErrorCode::E_PARSE_UNEXPECTED_TOKEN,
                    $keyStart,
                    $keyStart + 1,
                    'map literal entry without "=>"',
                );
            } else {
                $mapEntries[] = ['key' => $entry['key'], 'value' => $entry['value']];
            }
        }

        return Ast::node('Map', ['entries' => $mapEntries], $open->start, $close->end);
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
