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
    /** AST-10: public schema errors retain the supplied pointer and reason. */
    public function testPublicDecodeErrorPointerAndReason(): void
    {
        foreach (['', '/body/0/expr/value~1key'] as $path) {
            $error = new AstDecodeError($path, 'expected scalar');
            self::assertInstanceOf(\InvalidArgumentException::class, $error);
            self::assertSame($path, $error->path);
            self::assertStringContainsString($path === '' ? 'the root' : $path, $error->getMessage());
            self::assertStringContainsString('expected scalar', $error->getMessage());
        }
    }

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

    /** AST-10: decoding class-call data does not require a registered host class. */
    public function testPublicDecoderPreservesClassCallAstFields(): void
    {
        $text = Support::read(Support::repoRoot() . '/tests/fixtures/ast-decode/class-call.json');
        self::assertEquals(Support::json($text), AstProgram::decodeTemplate($text));
    }

    /** AST-4, AST-10: every operator and loop metadata literal retains its canonical value. */
    public function testPublicDecoderPreservesCanonicalEnumLiterals(): void
    {
        $text = Support::read(Support::repoRoot() . '/tests/fixtures/ast-decode/enum-literals.json');
        self::assertEquals(Support::json($text), AstProgram::decodeTemplate($text));
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

    /**
     * A literal with an invalid value and an extra field names the deepest invalid node, the value (AST-10), as the
     * other runtimes do, and not the literal that holds the extra field.
     */
    public function testDecodeNamesTheDeepestInvalidValueOfALiteralWithAnExtraField(): void
    {
        $text = '{"type":"Template","name":"x","body":[{"type":"Echo","expr":{"type":"Literal","kind":"number",'
            . '"value":"1","span":[0,1],"extra":1},"span":[0,1]}],"comments":[]}';
        try {
            AstProgram::decodeTemplate($text);
            self::fail('the AST decoded');
        } catch (AstDecodeError $error) {
            self::assertSame('/body/0/expr/value', $error->path);
            self::assertStringContainsString('/body/0/expr/value', $error->getMessage());
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
