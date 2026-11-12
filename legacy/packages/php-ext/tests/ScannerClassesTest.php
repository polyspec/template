<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Ast;
use Polyspec\Template\Parser\Parser;
use Polyspec\Template\Parser\Scanner;
use Polyspec\Template\Parser\Standalone;
use Polyspec\Template\Source;

/**
 * The AST helpers, the tag scanner and the standalone lines of the library as the extension registers them: the node
 * shape and the canonical JSON of an AST, the sigils and delimiters of a tag, and the byte ranges that standalone tags
 * remove from the output.
 */
final class ScannerClassesTest extends TestCase
{
    public function testTheExtensionRegistersTheScannerClasses(): void
    {
        foreach ([Ast::class, Scanner::class, Standalone::class] as $name) {
            $class = new \ReflectionClass($name);
            $this->assertTrue($class->isInternal(), $name . ' is not registered by the extension');
            $this->assertTrue($class->isFinal());
        }
        $this->assertSame(['index_', 'key_', 'value_', 'last_', 'first_', 'size_'], Ast::LOOP_META_FIELDS);
        $this->assertSame(['?#', ':?', '=', '@', '?', ':', '/', '+', '#', '*', '%'], Scanner::SIGILS);
        $this->assertSame([['"', '"'], ["'", "'"], ['/*', '*/'], ['<!--', '-->']], Scanner::WRAPPERS);
    }

    public function testTheAstHelpersGiveTheNodeAndItsCanonicalJson(): void
    {
        $this->assertSame([true, false], [Ast::isLoopMetaField('index_'), Ast::isLoopMetaField('index')]);
        $node = Ast::node('Text', ['value' => 'a'], 0, 1);
        $this->assertSame(['type' => 'Text', 'value' => 'a', 'span' => [0, 1]], $node);
        $this->assertSame(
            '{"type":"Literal","value":1,"x":null,"s":"é/\"","l":[1.5,true]}',
            Ast::toJson(['type' => 'Literal', 'value' => 1.0, 'x' => null, 's' => 'é/"', 'l' => [1.5, true]]),
        );
    }

    public function testTheScannerReadsTheSigilsAndTheDelimitersOfATag(): void
    {
        $this->assertSame(
            [4, true, false, '?#', '=', null, true, false, true, false, ['[', ']'], null],
            [
                Scanner::skipHorizontalSpace("a \t b", 1),
                Scanner::isHorizontalSpace("\t"),
                Scanner::isHorizontalSpace("\n"),
                Scanner::sigilAfter('{?# x}', 0),
                Scanner::sigilAfter('{= x}', 0),
                Scanner::sigilAfter('{x}', 0),
                Scanner::startsTag('{= x}', 0, '}'),
                Scanner::startsTag('{ x}', 0, '}'),
                Scanner::isDelimiterChar('['),
                Scanner::isDelimiterChar('a'),
                Scanner::parseDelimiters('[]'),
                Scanner::parseDelimiters('ab'),
            ],
        );
    }

    public function testStandaloneTagsRemoveTheirLines(): void
    {
        $source = "a\n{? x}\nb\n{/}\nc";
        $tags = Parser::analyze(Source::fromBytes('t', $source))['tags'];

        $this->assertSame([[2, 8], [10, 14]], Standalone::ranges($source, $tags));
    }
}
