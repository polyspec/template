<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Escape;
use Polyspec\Template\InternalBoundary;
use Polyspec\Template\Loader\Path;
use Polyspec\Template\Source;
use Polyspec\Template\TemplateError;
use Polyspec\Template\Utf8;

/**
 * The support classes of the library as the extension registers them: a source is checked UTF-8 text without its byte
 * order mark and with its line index, the escape of HTML replaces five characters, the internal boundary turns a PHP
 * error into E_INTERNAL, and an include path resolves against the current template within the root.
 */
final class SupportClassesTest extends TestCase
{
    public function testTheExtensionRegistersTheSupportClasses(): void
    {
        foreach ([Source::class, Utf8::class, Escape::class, InternalBoundary::class, Path::class] as $name) {
            $class = new \ReflectionClass($name);
            $this->assertTrue($class->isInternal(), $name . ' is not registered by the extension');
            $this->assertTrue($class->isFinal());
        }
    }

    public function testASourceIsItsTextWithoutTheByteOrderMarkAndWithItsLines(): void
    {
        $source = Source::fromBytes('page.tpl', "\xEF\xBB\xBFab\ncd\n");

        $this->assertSame(['page.tpl', "ab\ncd\n", [0, 3, 6], 6], [
            $source->name,
            $source->text,
            $source->lines,
            $source->length(),
        ]);
        $this->assertSame([0, 2, 3], Source::lineIndex("a\n\nb"));
        $this->assertSame([[1, 1], [1, 3], [2, 1], [3, 2]], [
            Source::position([0, 3, 6], 0),
            Source::position([0, 3, 6], 2),
            Source::position([0, 3, 6], 3),
            Source::position([0, 3, 6], 7),
        ]);
    }

    public function testASourceOfInvalidUtf8FailsAtTheFirstInvalidByte(): void
    {
        try {
            Source::fromBytes('page.tpl', "ab\nc\xC3(");
            $this->fail('E_LEX_INVALID_UTF8 expected');
        } catch (TemplateError $error) {
            $this->assertSame(
                ['E_LEX_INVALID_UTF8', 'page.tpl', 2, 2, 4, 5, 'invalid UTF-8 byte at offset 4'],
                [
                    $error->errorCode,
                    $error->template,
                    $error->errorLine,
                    $error->errorCol,
                    $error->offset,
                    $error->end,
                    $error->getMessage(),
                ],
            );
        }
    }

    public function testUtf8CountsAndSplitsCodePoints(): void
    {
        $this->assertSame([true, false, -1, 1, 0], [
            Utf8::isValid("a\u{e9}"),
            Utf8::isValid("a\xC3"),
            Utf8::firstInvalid("a\u{e9}\u{1F600}"),
            Utf8::firstInvalid("a\xED\xA0\x80"),
            Utf8::firstInvalid("\xC0\x80"),
        ]);
        $this->assertSame(["\u{e9}", "\u{FFFD}", ''], [Utf8::chr(0xE9), Utf8::chr(0xD800), Utf8::chr(0x110000)]);
        $this->assertSame([['a', "\u{e9}", "\u{1F600}"], [], 3], [
            Utf8::codePoints("a\u{e9}\u{1F600}"),
            Utf8::codePoints(''),
            Utf8::length("a\u{e9}\u{1F600}"),
        ]);
    }

    public function testTheEscapeOfHtmlReplacesFiveCharacters(): void
    {
        $this->assertSame('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;', Escape::html('<a href="x">&\'</a>'));
        $this->assertSame("\u{e9}", Escape::html("\u{e9}"));
    }

    public function testTheInternalBoundaryTurnsAPhpErrorIntoAnInternalFailure(): void
    {
        $this->assertSame(3, InternalBoundary::run('page.tpl', static fn (): int => 3));
        try {
            InternalBoundary::run('page.tpl', static function (): never {
                throw new \TypeError('broken');
            });
            $this->fail('E_INTERNAL expected');
        } catch (TemplateError $error) {
            $this->assertSame(
                ['E_INTERNAL', 'page.tpl', 'internal failure: broken'],
                [$error->errorCode, $error->template, $error->getMessage()],
            );
        }
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('host');
        InternalBoundary::run('page.tpl', static function (): never {
            throw new \RuntimeException('host');
        });
    }

    public function testAPathResolvesAgainstTheCurrentTemplateWithinTheRoot(): void
    {
        $this->assertSame(['a/c.tpl', 'c.tpl', 'a/b/d.tpl', 'x/y.tpl', null, 'c.tpl'], [
            Path::resolve('a/b.tpl', 'c.tpl'),
            Path::resolve('a/b.tpl', '../c.tpl'),
            Path::resolve('a/b.tpl', './b//d.tpl'),
            Path::resolve('a/b.tpl', '/x/y.tpl'),
            Path::resolve('a/b.tpl', '../../c.tpl'),
            Path::resolve('b.tpl', 'c.tpl'),
        ]);
    }
}
