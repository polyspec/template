<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;
use Polyspec\Template\Format\Analyzer;
use Polyspec\Template\Format\Body;
use Polyspec\Template\Format\PackageAnalyzer;

/**
 * The tag bodies and the analyzer of the formatter of the library as the extension registers them: the analyzer of
 * the package is the parser of the package, and the body of each tag kind is written in the formatting style unless
 * the tag is kept as written.
 */
final class FormatBodyTest extends TestCase
{
    private const SOURCE = '{=a+1}{?  x&&!y }{:?z}{:}{/}{@ i=list}{/}{:n+=2}{:k++}{+  "p.tpl" }'
        . "{#  main  './x y.tpl'  k:v }{?#main}{/}{* c *}{= a\n}{=  f( x ,[ 1 ] )  }";

    public function testTheExtensionRegistersTheBodyAndTheAnalyzers(): void
    {
        foreach ([Body::class, PackageAnalyzer::class, Analyzer::class] as $name) {
            $class = new \ReflectionClass($name);
            $this->assertTrue($class->isInternal(), $name . ' is not registered by the extension');
        }
        $this->assertTrue((new \ReflectionClass(Analyzer::class))->isInterface());
        $this->assertTrue((new \ReflectionClass(Body::class))->isFinal());
        $package = new \ReflectionClass(PackageAnalyzer::class);
        $this->assertTrue($package->isFinal());
        $this->assertSame([Analyzer::class], $package->getInterfaceNames());
    }

    public function testThePackageAnalyzerIsTheParserOfThePackage(): void
    {
        $analyzer = new PackageAnalyzer();
        $options = ['delimiters' => '[]'];

        $this->assertSame(AstProgram::parse('[= a]', 'u.tpl', $options), $analyzer->parse('[= a]', 'u.tpl', $options));
        $this->assertSame(
            AstProgram::analyze('[= a]', 'u.tpl', $options),
            $analyzer->analyze('[= a]', 'u.tpl', $options),
        );

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('"<" is not a delimiter pair');
        $analyzer->analyze('{= a}', 'u.tpl', ['delimiters' => '<']);
    }

    public function testTheBodyOfEachTagIsWrittenInTheFormattingStyle(): void
    {
        $analysis = (new PackageAnalyzer())->analyze(self::SOURCE, 't.tpl', []);
        $bodies = [];
        foreach ($analysis['tags'] as $tag) {
            $tokens = array_values(array_filter(
                $analysis['tokens'],
                static fn (array $token): bool => $token['start'] >= $tag['bodyStart']
                    && $token['end'] <= $tag['bodyEnd'],
            ));
            $bodies[] = [
                $tag['kind'],
                Body::format($tag['kind'], self::SOURCE, $tag['bodyStart'], $tag['bodyEnd'], $tokens),
            ];
        }

        $this->assertSame(
            [
                ['echo', '= a + 1'],
                ['if', '? x && !y'],
                ['elseif', ':? z'],
                ['else', ':'],
                ['close', '/'],
                ['for', '@ i = list'],
                ['close', '/'],
                ['assignment', ':n += 2'],
                ['assignment', ':k++'],
                ['include', '+ "p.tpl"'],
                ['block', "# main './x y.tpl' k:v"],
                ['ifblock', '?# main'],
                ['close', '/'],
                ['comment', null],
                ['echo', null],
                ['echo', '= f(x, [1])'],
            ],
            $bodies,
        );
    }

    public function testATagIsKeptAsWrittenWhenItsBodyIsNotOnlyItsTokens(): void
    {
        $sigil = ['start' => 1, 'end' => 2, 'kind' => 'keyword'];
        $this->assertSame([null, null, null, null], [
            Body::format('directive', '{%x}', 1, 3, [$sigil]),
            Body::format('echo', "{= a /*\n*/}", 1, 9, [$sigil, ['start' => 3, 'end' => 4, 'kind' => 'variable']]),
            Body::format('echo', '{= a ; b}', 1, 8, [
                $sigil,
                ['start' => 3, 'end' => 4, 'kind' => 'variable'],
                ['start' => 7, 'end' => 8, 'kind' => 'variable'],
            ]),
            Body::format('assignment', '{:k++ x}', 1, 7, [
                $sigil,
                ['start' => 2, 'end' => 3, 'kind' => 'variable'],
                ['start' => 3, 'end' => 5, 'kind' => 'operator'],
            ]),
        ]);

        $this->expectException(\LogicException::class);
        $this->expectExceptionMessage('unknown tag kind nope');
        Body::format('nope', 'x', 0, 1, [['start' => 0, 'end' => 1, 'kind' => 'operator']]);
    }
}
