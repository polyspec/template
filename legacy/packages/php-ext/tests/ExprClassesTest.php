<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Expr\Lexer;
use Polyspec\Template\Expr\Parser;
use Polyspec\Template\Expr\Token;
use Polyspec\Template\Source;
use Polyspec\Template\TemplateError;

/**
 * The expression lexer and parser of the library as the extension registers them: the tokens of an expression up to
 * the close delimiter of its tag, its AST, and each failure at the byte where the expression breaks.
 */
final class ExprClassesTest extends TestCase
{
    public function testTheExtensionRegistersTheExpressionClasses(): void
    {
        foreach ([Token::class, Lexer::class, Parser::class] as $name) {
            $class = new \ReflectionClass($name);
            $this->assertTrue($class->isInternal(), $name . ' is not registered by the extension');
            $this->assertTrue($class->isFinal());
        }
        $this->assertSame(64, Parser::DEPTH_LIMIT);
    }

    public function testTheLexerGivesTheTokensUpToTheCloseDelimiter(): void
    {
        $lexer = new Lexer(Source::fromBytes('t.tpl', 'a + 1}'), 0, '}', 1, null, 't.tpl');
        $tokens = [];
        do {
            $token = $lexer->next();
            $tokens[] = [$token->type, $token->value, $token->start, $token->end, $token->decoded];
        } while ($token->type !== 'CLOSE' && $token->type !== 'EOF');

        $this->assertSame(
            [
                ['IDENT', 'a', 0, 1, null],
                ['PLUS', '+', 2, 3, null],
                ['NUMBER', '1', 4, 5, null],
                ['CLOSE', '}', 5, 6, null],
            ],
            $tokens,
        );

        $bare = new Lexer(Source::fromBytes('t', 'a + 1'), 0, null, 0, null, 't');
        $this->assertSame('IDENT', $bare->peek()->type);
        $bare->next();
        $bare->next();
        $types = array_map(static fn (Token $token): string => $token->type, $bare->consumed());
        $this->assertSame([['IDENT', 'PLUS'], 3, 'a + 1'], [$types, $bare->consumedEnd(), $bare->text()]);
        $this->assertSame(["a\nb", 6], Lexer::stringLiteral(Source::fromBytes('t', '"a\nb" x'), 0, 't'));
    }

    public function testTheParserGivesTheAstOfAnExpression(): void
    {
        $parser = new Parser(Source::fromBytes('t.tpl', 'a + 1}'), 0, '}', 1, null, 't.tpl');

        $this->assertSame(
            [
                'type' => 'Binary',
                'op' => '+',
                'left' => ['type' => 'Var', 'name' => 'a', 'span' => [0, 1]],
                'right' => ['type' => 'Literal', 'kind' => 'number', 'value' => 1.0, 'span' => [4, 5]],
                'span' => [0, 5],
            ],
            $parser->parseExpression(),
        );
        $this->assertSame(6, $parser->expectClose());
        $this->assertInstanceOf(Lexer::class, $parser->lexer);
    }

    public function testAnExpressionThatBreaksFailsAtItsByte(): void
    {
        try {
            (new Parser(Source::fromBytes('t', 'a +'), 0, null, 0, null, 't'))->parseExpression();
            $this->fail('E_PARSE_UNEXPECTED_TOKEN expected');
        } catch (TemplateError $error) {
            $this->assertSame(
                ['E_PARSE_UNEXPECTED_TOKEN', 'unexpected end of input', 3],
                [$error->errorCode, $error->getMessage(), $error->offset],
            );
        }
    }
}
