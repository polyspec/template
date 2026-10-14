<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstDecodeError;
use Polyspec\Template\AstProgram;
use Polyspec\Template\Engine;
use Polyspec\Template\Loader\ArrayLoader;

/**
 * AstProgram::decodeTemplate reads the canonical AST JSON into the AST arrays of the package (AST-10).
 */
final class AstDecodeTest extends TestCase
{
    private const ECHO = '{"type":"Template","name":"x.tpl","body":[{"type":"Echo","expr":{"type":"Binary","op":"+",'
        . '"left":{"type":"Var","name":"a","span":[3,4]},"right":{"type":"Literal","kind":"number","value":1,'
        . '"span":[7,8]},"span":[3,8]},"span":[0,9]}],"comments":[]}';

    /** The expected.ast.json of every conformance case decodes into the AST that the file holds. */
    public function testDecodeReadsTheAstOfEveryConformanceCase(): void
    {
        $count = 0;
        foreach (Support::entries(Support::casesDir()) as $group) {
            foreach (Support::entries(Support::casesDir() . '/' . $group) as $name) {
                $path = Support::casesDir() . "/{$group}/{$name}/expected.ast.json";
                if (!is_file($path)) {
                    continue;
                }
                $text = Support::read($path);
                // A number literal is a float, as the parser makes it, so the arrays compare by value.
                self::assertEquals(Support::json($text), AstProgram::decodeTemplate($text), $path);
                $count++;
            }
        }
        self::assertGreaterThan(0, $count, 'no case has an expected.ast.json');
    }

    /** The decode returns the AST of parse, which a program renders without its source (RT-41). */
    public function testADecodedTemplateIsTheAstThatParseReturnsAndRenders(): void
    {
        $ast = AstProgram::decodeTemplate(self::ECHO);
        self::assertSame(AstProgram::parse('{= a + 1}', 'x.tpl'), $ast);
        $engine = new Engine(new AstProgram(new ArrayLoader(['x.tpl' => $ast])));
        self::assertSame('3', $engine->render('x.tpl', ['a' => 2]));
    }

    /** Every invalid AST of the shared fixture fails with the JSON Pointer of its invalid node, which the message names. */
    public function testDecodeFailsNamingTheJsonPointerOfTheInvalidNode(): void
    {
        $fixture = Support::readJson(Support::repoRoot() . '/tests/fixtures/ast-decode/invalid.json');
        self::assertIsArray($fixture);
        self::assertNotEmpty($fixture['cases'], 'invalid.json has no case');
        foreach ($fixture['cases'] as $case) {
            try {
                AstProgram::decodeTemplate(json_encode($case['ast'], JSON_THROW_ON_ERROR));
                self::fail("{$case['name']}: the AST decoded");
            } catch (AstDecodeError $error) {
                self::assertSame($case['path'], $error->path, $case['name']);
                $shown = $case['path'] === '' ? 'the root' : $case['path'];
                self::assertStringContainsString($shown, $error->getMessage(), $case['name']);
            }
        }
    }

    /** Text that is not JSON fails with the JsonException of json_decode. */
    public function testDecodeFailsOnTextThatIsNotJson(): void
    {
        $this->expectException(\JsonException::class);
        AstProgram::decodeTemplate('{');
    }

    /** The schema that the package holds, resources/ast.schema.json, is contracts/schema/ast.schema.json byte for byte. */
    public function testThePackageSchemaIsTheContractSchema(): void
    {
        self::assertSame(
            Support::read(Support::repoRoot() . '/contracts/schema/ast.schema.json'),
            Support::read(Support::repoRoot() . '/packages/php/resources/ast.schema.json'),
            'packages/php/resources/ast.schema.json differs from contracts/schema/ast.schema.json: '
                . 'copy the contract schema to it',
        );
    }
}
