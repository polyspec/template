<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;
use Polyspec\Template\Native\Engine;
use Polyspec\Template\Native\TemplateError;

/**
 * The native syntax analysis: the accepted tags with their kinds and body ranges and the EDT-8 tokens, equal to those
 * of the PHP package.
 */
final class AnalyzeTest extends TestCase
{
    /**
     * @return iterable<string, array{0: string, 1: list<string>}>
     */
    public static function tagKinds(): iterable
    {
        yield 'comment' => ['{* note *}', ['comment {* note *}']];
        yield 'echo' => [
            '{= (user.name ?? null) | upper(1, "x")}',
            [
                'delimiter {',
                'keyword =',
                'operator (',
                'variable user',
                'property .name',
                'operator ??',
                'keyword null',
                'operator )',
                'operator |',
                'function upper',
                'operator (',
                'number 1',
                'operator ,',
                'string "x"',
                'operator )',
                'delimiter }',
            ],
        ];
        yield 'for' => [
            '{@ item = items}{/}',
            [
                'delimiter {',
                'keyword @',
                'variable item',
                'operator =',
                'variable items',
                'delimiter }',
                'delimiter {',
                'keyword /',
                'delimiter }',
            ],
        ];
        yield 'assignment' => [
            '{: count += 1}',
            ['delimiter {', 'keyword :', 'variable count', 'operator +=', 'number 1', 'delimiter }'],
        ];
        yield 'increment' => [
            '{: count++}',
            ['delimiter {', 'keyword :', 'variable count', 'operator ++', 'delimiter }'],
        ];
        yield 'if' => [
            '{? a in b}{:? !c}{:}{/}',
            [
                'delimiter {',
                'keyword ?',
                'variable a',
                'keyword in',
                'variable b',
                'delimiter }',
                'delimiter {',
                'keyword :?',
                'operator !',
                'variable c',
                'delimiter }',
                'delimiter {',
                'keyword :',
                'delimiter }',
                'delimiter {',
                'keyword /',
                'delimiter }',
            ],
        ];
        yield 'ifblock' => [
            '{?# side}{/}',
            ['delimiter {', 'keyword ?#', 'variable side', 'delimiter }', 'delimiter {', 'keyword /', 'delimiter }'],
        ];
        yield 'include' => [
            '{+ parts/head.tpl}{+ "quoted.tpl"}',
            [
                'delimiter {',
                'keyword +',
                'path parts/head.tpl',
                'delimiter }',
                'delimiter {',
                'keyword +',
                'string "quoted.tpl"',
                'delimiter }',
            ],
        ];
        yield 'block' => [
            '{# card cards/card.tpl title:page.title x}',
            [
                'delimiter {',
                'keyword #',
                'path card',
                'path cards/card.tpl',
                'path title:page.title',
                'path x',
                'delimiter }',
            ],
        ];
        yield 'directive' => [
            '{% delimiter []}[= a]',
            [
                'delimiter {',
                'keyword %',
                'keyword delimiter',
                'string []',
                'delimiter }',
                'delimiter [',
                'keyword =',
                'variable a',
                'delimiter ]',
            ],
        ];
        yield 'wrapped' => ['<a href="{{= url }}">', ['delimiter "{{', 'keyword =', 'variable url', 'delimiter }}"']];
    }

    /**
     * @param list<string> $expected
     */
    #[DataProvider('tagKinds')]
    public function testClassifiesEveryPartOfEveryTagKind(string $source, array $expected): void
    {
        $tokens = Engine::analyze($source, 't.tpl')['tokens'];
        $this->assertSame(
            $expected,
            array_map(
                static fn (array $token): string => $token['kind'] . ' ' . substr(
                    $source,
                    $token['start'],
                    $token['end'] - $token['start'],
                ),
                $tokens,
            ),
        );
    }

    public function testGivesEachTagItsKindAndTheRangeOfItsBody(): void
    {
        $source = "\xEF\xBB\xBF<a href=\"{{= url }}\">{* c *}{? ok}{:}{/}";
        $result = Engine::analyze($source, 't.tpl');
        $text = substr($source, 3);
        $this->assertSame(
            [['echo', '= url '], ['comment', '* c *'], ['if', '? ok'], ['else', ':'], ['close', '/']],
            array_map(
                static fn (array $tag): array => [
                    $tag['kind'],
                    substr($text, $tag['bodyStart'], $tag['bodyEnd'] - $tag['bodyStart']),
                ],
                $result['tags'],
            ),
        );
        $this->assertSame(Engine::parse($source, 't.tpl'), $result['ast']);
    }

    public function testThrowsTheParserError(): void
    {
        $this->expectException(TemplateError::class);
        Engine::analyze('{? a}', 't.tpl');
    }

    /**
     * @return iterable<string, array{0: string}>
     */
    public static function caseProvider(): iterable
    {
        foreach (Support::cases() as [$id, $directory]) {
            yield $id => [$directory];
        }
    }

    #[DataProvider('caseProvider')]
    public function testEqualsTheAnalysisOfThePhpPackage(string $directory): void
    {
        $source = Support::read($directory . '/input.tpl');
        $options = Support::delimiterOptions($directory);
        try {
            $expected = AstProgram::analyze($source, 'input.tpl', $options);
        } catch (\Polyspec\Template\TemplateError $error) {
            try {
                Engine::analyze($source, 'input.tpl', $options);
                $this->fail('the native analysis accepts a source that the package rejects: ' . $error->errorCode);
            } catch (TemplateError $native) {
                $this->assertSame($error->errorCode, $native->getErrorCode());
            }

            return;
        }
        $actual = Engine::analyze($source, 'input.tpl', $options);
        $this->assertSame($expected['tags'], $actual['tags']);
        $this->assertSame($expected['tokens'], $actual['tokens']);
        $this->assertSame(Engine::parse($source, 'input.tpl', $options), $actual['ast']);
        if (!is_file($directory . '/expected.ast.json')) {
            return;
        }
        $this->assertSame(
            Support::readJson($directory . '/expected.tokens.json'),
            array_map(
                static fn (array $token): array => [$token['start'], $token['end'], $token['kind']],
                $actual['tokens'],
            ),
        );
    }
}
