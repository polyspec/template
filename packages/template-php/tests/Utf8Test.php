<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Polyspec\Template\Utf8;

/**
 * `Utf8::isValid` gives the same result as `Utf8::firstInvalid() < 0` (VAL-14): on every 1-byte and 2-byte
 * sequence, on every 3-byte and 4-byte sequence built from the boundary bytes, and on named cases.
 */
final class Utf8Test extends TestCase
{
    /** Bytes at and next to every boundary of the UTF-8 byte classes. */
    private const BOUNDARY = [0x00, 0x7F, 0x80, 0x8F, 0x90, 0x9F, 0xA0, 0xBF, 0xC0, 0xC1, 0xC2, 0xDF, 0xE0, 0xED, 0xEF, 0xF0, 0xF4, 0xF5, 0xFF];

    public function testOneAndTwoByteSequences(): void
    {
        for ($a = 0; $a < 256; $a++) {
            $this->assertSame(Utf8::firstInvalid(chr($a)) < 0, Utf8::isValid(chr($a)), sprintf('%02X', $a));
            for ($b = 0; $b < 256; $b++) {
                $bytes = chr($a) . chr($b);
                $this->assertSame(Utf8::firstInvalid($bytes) < 0, Utf8::isValid($bytes), sprintf('%02X %02X', $a, $b));
            }
        }
    }

    public function testBoundaryThreeAndFourByteSequences(): void
    {
        foreach (self::BOUNDARY as $a) {
            foreach (self::BOUNDARY as $b) {
                foreach (self::BOUNDARY as $c) {
                    $bytes = chr($a) . chr($b) . chr($c);
                    $this->assertSame(Utf8::firstInvalid($bytes) < 0, Utf8::isValid($bytes), bin2hex($bytes));
                    foreach (self::BOUNDARY as $d) {
                        $bytes4 = $bytes . chr($d);
                        $this->assertSame(Utf8::firstInvalid($bytes4) < 0, Utf8::isValid($bytes4), bin2hex($bytes4));
                    }
                }
            }
        }
    }

    /** @return iterable<string, array{string, bool}> */
    public static function named(): iterable
    {
        yield 'empty' => ['', true];
        yield 'NUL' => ["\x00", true];
        yield 'Korean text' => ['한국어 문장', true];
        yield 'U+FFFF' => ["\u{FFFF}", true];
        yield 'noncharacter U+FDD0' => ["\u{FDD0}", true];
        yield 'U+10FFFF' => ["\xF4\x8F\xBF\xBF", true];
        yield 'above U+10FFFF' => ["\xF4\x90\x80\x80", false];
        yield 'lead F5' => ["\xF5\x80\x80\x80", false];
        yield 'surrogate D800' => ["\xED\xA0\x80", false];
        yield 'surrogate DFFF' => ["\xED\xBF\xBF", false];
        yield 'surrogate pair as bytes' => ["\xED\xA0\xBD\xED\xB8\x80", false];
        yield 'overlong C0 AF' => ["\xC0\xAF", false];
        yield 'overlong C1 BF' => ["\xC1\xBF", false];
        yield 'overlong E0 80 AF' => ["\xE0\x80\xAF", false];
        yield 'overlong F0 8F BF BF' => ["\xF0\x8F\xBF\xBF", false];
        yield 'truncated 2-byte' => ["a\xC2", false];
        yield 'truncated 4-byte' => ["\xF0\x9F\x98", false];
        yield 'lone continuation' => ["\x80", false];
        yield 'emoji' => ["\u{1F600}", true];
    }

    #[DataProvider('named')]
    public function testNamedCases(string $bytes, bool $valid): void
    {
        $this->assertSame($valid, Utf8::firstInvalid($bytes) < 0);
        $this->assertSame($valid, Utf8::isValid($bytes));
    }
}
