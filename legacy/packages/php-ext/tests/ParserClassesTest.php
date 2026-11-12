<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Parser\BlockTag;
use Polyspec\Template\Parser\Parser;
use Polyspec\Template\Source;
use Polyspec\Template\TemplateError;

/**
 * The template parser of the library as the extension registers it: the AST of a template, the accepted tags and
 * the tokens of an analysis, and the path and the body that a block tag reads, each failure at the byte where it
 * breaks.
 */
final class ParserClassesTest extends TestCase
{
    public function testTheExtensionRegistersTheParserClasses(): void
    {
        foreach ([Parser::class, BlockTag::class] as $name) {
            $class = new \ReflectionClass($name);
            $this->assertTrue($class->isInternal(), $name . ' is not registered by the extension');
            $this->assertTrue($class->isFinal());
        }
    }

    public function testTheParserGivesTheAstOfATemplate(): void
    {
        $this->assertSame(
            [
                'type' => 'Template',
                'name' => 't.tpl',
                'body' => [
                    ['type' => 'Text', 'value' => 'a', 'span' => [0, 1]],
                    ['type' => 'Echo', 'expr' => ['type' => 'Var', 'name' => 'x', 'span' => [4, 5]], 'span' => [1, 6]],
                    ['type' => 'Text', 'value' => 'b', 'span' => [6, 7]],
                ],
                'comments' => [],
            ],
            Parser::parse(Source::fromBytes('t.tpl', 'a{= x}b')),
        );

        try {
            Parser::parse(Source::fromBytes('t.tpl', '{? x}'));
            $this->fail('E_PARSE_UNCLOSED_BLOCK expected');
        } catch (TemplateError $error) {
            $this->assertSame(
                ['E_PARSE_UNCLOSED_BLOCK', 'block is not closed before the end of the file', 0],
                [$error->errorCode, $error->getMessage(), $error->offset],
            );
        }
    }

    public function testTheAnalysisGivesTheAcceptedTagsAndTheirTokens(): void
    {
        $analysis = Parser::analyze(Source::fromBytes('t.tpl', '[?x]y[/]'), '[', ']');

        $this->assertSame(
            [
                ['start' => 0, 'end' => 4, 'echo' => false, 'kind' => 'if', 'bodyStart' => 1, 'bodyEnd' => 3],
                ['start' => 5, 'end' => 8, 'echo' => false, 'kind' => 'close', 'bodyStart' => 6, 'bodyEnd' => 7],
            ],
            $analysis['tags'],
        );
        $this->assertSame(
            [
                ['start' => 0, 'end' => 1, 'kind' => 'delimiter'],
                ['start' => 1, 'end' => 2, 'kind' => 'keyword'],
                ['start' => 2, 'end' => 3, 'kind' => 'variable'],
                ['start' => 3, 'end' => 4, 'kind' => 'delimiter'],
                ['start' => 5, 'end' => 6, 'kind' => 'delimiter'],
                ['start' => 6, 'end' => 7, 'kind' => 'keyword'],
                ['start' => 7, 'end' => 8, 'kind' => 'delimiter'],
            ],
            $analysis['tokens'],
        );
        $this->assertSame(
            ['type' => 'Var', 'name' => 'x', 'span' => [2, 3]],
            $analysis['ast']['body'][0]['branches'][0]['test'],
        );
    }

    public function testABlockTagReadsItsPathAndItsBody(): void
    {
        $tag = new BlockTag(Source::fromBytes('t.tpl', '{+ "a/b.tpl"}{# main ./x.tpl k:v.w m}'), 't.tpl', '}', 1);

        $this->assertSame(['path' => 'a/b.tpl', 'start' => 3, 'end' => 12, 'quoted' => true], $tag->readIncludePath(2));
        $this->assertSame(
            [
                'id' => 'main',
                'path' => './x.tpl',
                'scope' => [
                    [
                        'name' => 'k',
                        'expr' => [
                            'type' => 'Member',
                            'object' => ['type' => 'Var', 'name' => 'v', 'span' => [31, 32]],
                            'key' => 'w',
                            'span' => [31, 34],
                        ],
                    ],
                    ['name' => 'm', 'expr' => ['type' => 'Var', 'name' => 'm', 'span' => [35, 36]]],
                ],
                'words' => [
                    ['start' => 16, 'end' => 20, 'quoted' => false],
                    ['start' => 21, 'end' => 28, 'quoted' => false],
                    ['start' => 29, 'end' => 34, 'quoted' => false],
                    ['start' => 35, 'end' => 36, 'quoted' => false],
                ],
                'end' => 36,
            ],
            $tag->readBlockBody(15),
        );
    }

    public function testABlockTagFailsAtTheByteWhereItBreaks(): void
    {
        $cases = [
            ['readIncludePath', '{+ x}', ['E_PARSE_INVALID_PATH', '"x" is not a path', 3]],
            ['readBlockBody', '{# !}', ['E_PARSE_INVALID_BLOCK_TAG', 'block tag requires an identifier or a path', 3]],
            ['readBlockBody', '{# a k: }', ['E_PARSE_INVALID_BLOCK_TAG', 'scope item requires a value after ":"', 6]],
        ];
        foreach ($cases as [$method, $text, $expected]) {
            try {
                (new BlockTag(Source::fromBytes('t.tpl', $text), 't.tpl', '}', 1))->$method(2);
                $this->fail($expected[0] . ' expected for ' . $text);
            } catch (TemplateError $error) {
                $this->assertSame($expected, [$error->errorCode, $error->getMessage(), $error->offset], $text);
            }
        }
    }
}
