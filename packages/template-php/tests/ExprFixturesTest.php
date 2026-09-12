<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Polyspec\Template\Ast;
use Polyspec\Template\AstProgram;
use Polyspec\Template\Expr\Lexer;
use Polyspec\Template\Expr\Parser;
use Polyspec\Template\Render\Context;
use Polyspec\Template\Render\Evaluator;
use Polyspec\Template\Render\Frame;
use Polyspec\Template\Source;
use Polyspec\Template\TemplateError;
use Polyspec\Template\Value\Bind;

/**
 * Expression fixtures: tokens, AST and evaluation (CNF-12 to CNF-14).
 */
final class ExprFixturesTest extends TestCase
{
    /**
     * @return iterable<string, array{0: array<string, mixed>}>
     */
    public static function cases(): iterable
    {
        $cases = json_decode((string) file_get_contents(Support::exprFixture()), true);
        foreach ($cases as $case) {
            yield $case['name'] => [$case];
        }
    }

    /**
     * @return list<array{type: string, value: string}>
     */
    public static function tokenize(string $text): array
    {
        $lexer = new Lexer(Source::fromBytes('expression', $text), 0, null, 0, null, 'expression');
        $tokens = [];
        for (;;) {
            $token = $lexer->next();
            $tokens[] = ['type' => $token->type, 'value' => $token->value];
            if ($token->type === 'EOF') {
                return $tokens;
            }
        }
    }

    /**
     * @return array<string, mixed>
     */
    public static function parseExpression(string $text): array
    {
        $parser = new Parser(Source::fromBytes('expression', $text), 0, null, 0, null, 'expression');
        $expr = $parser->parseExpression();
        $trailing = $parser->peek();
        if ($trailing->type !== 'EOF') {
            throw $parser->unexpected($trailing);
        }

        return $expr;
    }

    /**
     * @param array<string, mixed> $expr
     */
    public static function evaluate(array $expr, mixed $data): mixed
    {
        $engine = new AstProgram();
        $root = Bind::map($data ?? []);
        $context = new Context($engine, $root, ['timezone' => 'Z', 'now' => 0.0], 'expression');
        $frame = new Frame('expression', null, $root);

        return (new Evaluator($context))->evaluate($expr, $frame, new \Polyspec\Template\Render\Scope());
    }

    /**
     * @param array<string, mixed> $case
     */
    #[DataProvider('cases')]
    public function testCase(array $case): void
    {
        if (isset($case['error'])) {
            $code = null;
            try {
                self::parseExpression($case['expr']);
            } catch (TemplateError $error) {
                $code = $error->errorCode;
            }
            self::assertSame($case['error'], $code);

            return;
        }
        self::assertSame($case['tokens'], self::tokenize($case['expr']));
        $ast = self::parseExpression($case['expr']);
        self::assertSame(Support::normalize($case['ast']), Support::normalize(json_decode(Ast::toJson($ast), true)));
        foreach ($case['cases'] ?? [] as $evaluation) {
            $value = Support::plain(self::evaluate($ast, $evaluation['data']));
            self::assertSame(Support::normalize($evaluation['value']), Support::normalize(json_decode((string) json_encode($value), true)));
        }
    }
}
