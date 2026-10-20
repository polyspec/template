<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstDecodeError;
use Polyspec\Template\AstDecoder;

/**
 * The decode of the AST JSON of the library as the extension registers it: the extension validates the JSON against
 * the schema of the contract that it holds, fails at the deepest invalid node with the reason of the validator of
 * the library, and reads a valid AST as the arrays that the parser returns.
 */
final class AstDecoderClassTest extends TestCase
{
    public function testTheExtensionRegistersAstDecoder(): void
    {
        $class = new \ReflectionClass(AstDecoder::class);
        $this->assertTrue($class->isInternal(), AstDecoder::class . ' is not registered by the extension');
        $this->assertTrue($class->isFinal());
    }

    public function testTheSchemaOfTheExtensionIsTheContractSchema(): void
    {
        $header = file_get_contents(Support::repositoryRoot() . '/packages/php-ext/src/pt_ast_schema.h');
        $this->assertIsString($header);
        $this->assertSame(1, preg_match('/pt_ast_schema\[\] =\n(.*?);\n/s', $header, $literal));
        preg_match_all('/^\s*"((?:[^"\\\\]|\\\\.)*)"$/m', $literal[1], $pieces);
        $this->assertNotSame([], $pieces[1]);

        $this->assertSame(
            file_get_contents(Support::repositoryRoot() . '/contracts/schema/ast.schema.json'),
            stripcslashes(implode('', $pieces[1])),
        );
    }

    public function testEveryInvalidAstFailsAtItsNodeWithTheReasonOfTheLibrary(): void
    {
        $fixture = json_decode(
            (string) file_get_contents(Support::repositoryRoot() . '/tests/fixtures/ast-decode/invalid.json'),
            true,
            512,
            JSON_THROW_ON_ERROR,
        );
        $reasons = [
            'The data (array) must match the type: object',
            'The required properties (comments) are missing',
            'The data must match the const value',
            'The data (integer) must match the type: object',
            'The data should match one item from enum',
            'Additional object properties are not allowed: extra',
            'The required properties (span) are missing',
            'The string should match pattern: ^[A-Za-z_][A-Za-z0-9_]*$',
            'The required properties (test) are missing',
            'Array should have at least 1 items, 0 found',
            'The data (integer) must match the type: array',
            'The data (integer) must match the type: string',
            'Minimum string length is 1, found 0',
            'The string should match pattern: ^[A-Za-z_][A-Za-z0-9_]*$',
            'The data (string) must match the type: number',
            'The data should match one item from enum',
            'The required properties (span) are missing',
            'The data should match one item from enum',
            'The required properties (expr) are missing',
            'Additional object properties are not allowed: extra',
            'Number must be greater than or equal to 0',
            'Array should have at most 2 items, 3 found',
            'The required properties (value) are missing',
        ];
        $this->assertCount(count($reasons), $fixture['cases']);
        foreach ($fixture['cases'] as $index => $case) {
            $at = $case['path'] === '' ? 'the root' : $case['path'];
            $this->assertSame(
                [$case['path'], 'invalid template AST at ' . $at . ': ' . $reasons[$index]],
                self::failure((string) json_encode($case['ast'])),
                $case['name'],
            );
        }
    }

    public function testOfSeveralErrorsTheDeepestAndFirstIsTheFailure(): void
    {
        $cases = [
            '{"type":"Template","name":"x","body":[{"type":"Text","span":[0,1],"extra":1,"more":2}],"comments":[]}'
                => ['/body/0', 'invalid template AST at /body/0: The required properties (value) are missing'],
            '{"type":"Template","name":"x","body":[{"type":"Text","value":1,"span":[0,"a"]}],"comments":[]}'
                => [
                    '/body/0/span/1',
                    'invalid template AST at /body/0/span/1: The data (string) must match the type: integer',
                ],
            '{"name":"x","body":[],"comments":[],"x":1}'
                => ['', 'invalid template AST at the root: The required properties (type) are missing'],
            '{"type":"Template","name":"x","body":[{"type":"Echo","expr":{"type":"Literal","kind":"number","value":1.5,'
                . '"span":[0.5,1]},"span":[0,1]}],"comments":[]}'
                => [
                    '/body/0/expr/span/0',
                    'invalid template AST at /body/0/expr/span/0: The data (number) must match the type: integer',
                ],
        ];
        foreach ($cases as $text => $expected) {
            $this->assertSame($expected, self::failure($text), $text);
        }
    }

    public function testAValidAstIsTheArraysOfTheParser(): void
    {
        $this->assertSame(
            [
                'type' => 'Template',
                'name' => 'x',
                'body' => [[
                    'type' => 'Echo',
                    'expr' => ['type' => 'Literal', 'kind' => 'number', 'value' => 2.0, 'span' => [1.0, 4]],
                    'span' => [0, 6],
                ]],
                'comments' => [],
            ],
            AstDecoder::decode('{"type":"Template","name":"x","body":[{"type":"Echo","expr":{"type":"Literal",'
                . '"kind":"number","value":2,"span":[1.0,4]},"span":[0,6]}],"comments":[]}'),
        );
    }

    public function testTextThatIsNotJsonIsAJsonError(): void
    {
        $this->expectException(\JsonException::class);
        $this->expectExceptionMessage('Syntax error');
        AstDecoder::decode('{');
    }

    /** @return array{0: string, 1: string} the path and the message of the decode failure of `text` */
    private static function failure(string $text): array
    {
        try {
            AstDecoder::decode($text);
        } catch (AstDecodeError $error) {
            return [$error->path, $error->getMessage()];
        }
        self::fail('the AST decoded: ' . $text);
    }
}
