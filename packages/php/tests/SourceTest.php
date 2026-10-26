<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\Source;
use Polyspec\Template\TemplateError;

/**
 * LEX-24: public source contexts preserve UTF-8 and native byte indexes.
 *
 * @phpstan-type ValidSource array{
 *   id: string, name: string, input: string, rawHex: string, text: string, hex: string,
 *   lines: list<int>, offsets: array{byte: list<int>},
 *   probe: array{offset: int, end: int, line: int, col: int}
 * }
 * @phpstan-type InvalidSource array{id: string, hex: string, offset: int, line: int, col: int}
 */
final class SourceTest extends TestCase
{
    /** @return array{valid: list<ValidSource>, invalid: list<InvalidSource>} */
    private static function fixture(): array
    {
        /** @var array{valid: list<ValidSource>, invalid: list<InvalidSource>} $fixture The committed fixture is also schema-checked by the source contract unit. */
        $fixture = Support::json(Support::read(Support::repoRoot() . '/tests/fixtures/source-context.json'));
        self::assertNotEmpty($fixture['valid']);
        self::assertNotEmpty($fixture['invalid']);

        return $fixture;
    }

    public function testPublicSourceContextsPreserveTheSharedFixtures(): void
    {
        foreach (self::fixture()['valid'] as $item) {
            $input = hex2bin($item['rawHex']);
            self::assertIsString($input);
            $contexts = [Source::fromBytes($item['name'], $input), Source::fromText($item['name'], $item['input'])];
            if ($input !== '') {
                $input[0] = "\0";
            }
            foreach ($contexts as $source) {
                self::assertSame(
                    [$item['name'], $item['text'], $item['hex'], $item['lines']],
                    [$source->name, $source->text, bin2hex($source->bytes()), $source->lines],
                    $item['id'],
                );
                $offsets = $item['offsets']['byte'];
                self::assertSame(count($offsets) - 1, $source->length());
                foreach ($offsets as $start => $offset) {
                    self::assertSame($offset, $source->byteAt($start));
                    for ($end = $start; $end < count($offsets); $end++) {
                        self::assertSame([$offset, $offsets[$end]], $source->span($start, $end));
                    }
                }
                self::assertSame($item['lines'], Source::lineIndex($source->bytes()));
                $probe = $item['probe'];
                self::assertSame([$probe['line'], $probe['col']], Source::position($source->lines, $probe['offset']));
                $error = $source->error('E_PARSE_UNEXPECTED_TOKEN', $probe['offset'], $probe['end'], 'message');
                self::assertSame([
                    'code' => 'E_PARSE_UNEXPECTED_TOKEN', 'template' => $item['name'],
                    'line' => $probe['line'], 'col' => $probe['col'],
                    'offset' => $probe['offset'], 'end' => $probe['end'], 'message' => 'message',
                ], $error->toArray());
                self::rejectsIndex(fn () => $source->byteAt($source->length() + 1));
                self::rejectsIndex(fn () => $source->span(1, 0));
            }
        }
    }

    public function testPublicSourceRejectsSharedInvalidUtf8(): void
    {
        foreach (self::fixture()['invalid'] as $item) {
            $input = hex2bin($item['hex']);
            self::assertIsString($input);
            foreach (['fromBytes', 'fromText'] as $method) {
                try {
                    Source::{$method}('invalid.tpl', $input);
                    self::fail('invalid source accepted');
                } catch (TemplateError $error) {
                    self::assertSame(
                        ['E_LEX_INVALID_UTF8', $item['offset'], $item['offset'] + 1, $item['line'], $item['col']],
                        [$error->errorCode, $error->offset, $error->end, $error->errorLine, $error->errorCol],
                        $item['id'],
                    );
                }
            }
        }
    }

    private static function rejectsIndex(\Closure $operation): void
    {
        $failure = null;
        try {
            $operation();
        } catch (\ValueError $error) {
            $failure = $error;
        }
        self::assertInstanceOf(\ValueError::class, $failure);
    }
}
