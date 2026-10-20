<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Format\Indent;

/**
 * The indentation of the formatter of the library as the extension registers it: the edits that set the spaces and
 * tabs at the start of each line by the nesting of HTML elements and template blocks, or the tag where the HTML
 * structure fails.
 */
final class IndentClassTest extends TestCase
{
    private const TEXT = "<ul>\n{@ x = xs}\n<li>{= x}</li>\n{/}\n</ul>\n<pre>\n  a\n</pre>\n";
    private const TAGS = [
        ['kind' => 'for', 'start' => 5, 'end' => 15],
        ['kind' => 'echo', 'start' => 20, 'end' => 25],
        ['kind' => 'close', 'start' => 31, 'end' => 34],
    ];

    public function testTheExtensionRegistersIndent(): void
    {
        $class = new \ReflectionClass(Indent::class);
        $this->assertTrue($class->isInternal(), Indent::class . ' is not registered by the extension');
        $this->assertTrue($class->isFinal());
        $this->assertTrue($class->getConstructor()?->isPrivate());

        $this->expectException(\ReflectionException::class);
        $this->expectExceptionMessage('Access to non-public constructor of class Polyspec\Template\Format\Indent');
        $class->newInstance('', [], true);
    }

    public function testTheEditsIndentTheLinesByTheirNesting(): void
    {
        $this->assertSame(
            ['edits' => [
                ['start' => 5, 'end' => 5, 'text' => '  '],
                ['start' => 16, 'end' => 16, 'text' => '    '],
                ['start' => 31, 'end' => 31, 'text' => '  '],
            ]],
            Indent::edits(self::TEXT, self::TAGS, '  ', 'indent', null),
        );
        $this->assertSame(
            ['edits' => [
                ['start' => 5, 'end' => 5, 'text' => "\t"],
                ['start' => 16, 'end' => 16, 'text' => "\t"],
            ]],
            Indent::edits(self::TEXT, self::TAGS, "\t", 'keep', ['start' => 0, 'end' => 20]),
        );
    }

    public function testAStructureThatCannotBeIndentedNamesItsTag(): void
    {
        $this->assertSame(
            ['error' => ['index' => 6, 'message' => 'the end tag </span> does not match the open element <div>']],
            Indent::edits("<div>\n</span>\n", [], '  ', 'indent', null),
        );
        $this->assertSame(
            ['error' => [
                'index' => 12,
                'message' => 'a template block without an else branch must end with the HTML elements open at its'
                    . ' start',
            ]],
            Indent::edits(
                "{? a}\n<div>\n{/}\n</div>\n",
                [['kind' => 'if', 'start' => 0, 'end' => 5], ['kind' => 'close', 'start' => 12, 'end' => 15]],
                '  ',
                'indent',
                null,
            ),
        );
    }
}
