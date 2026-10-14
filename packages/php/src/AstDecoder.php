<?php

declare(strict_types=1);

namespace Polyspec\Template;

use Opis\JsonSchema\Errors\ErrorFormatter;
use Opis\JsonSchema\Errors\ValidationError;
use Opis\JsonSchema\Validator;

/**
 * Decoding of the AST JSON (AST-10): the canonical JSON of a template AST, validated against
 * contracts/schema/ast.schema.json, read as the AST arrays that the parser returns.
 *
 * @internal AstProgram::decodeTemplate is the public entry.
 */
final class AstDecoder
{
    // resources/ast.schema.json is a copy of contracts/schema/ast.schema.json, which tests/AstDecodeTest.php compares
    // with it.
    private const SCHEMA = __DIR__ . '/../resources/ast.schema.json';

    private static ?object $schema = null;

    /**
     * @return array<string, mixed>
     * @throws \JsonException when the text is not JSON
     * @throws AstDecodeError when the JSON is not a template AST
     */
    public static function decode(string $json): array
    {
        // The schema validates JSON objects as objects, so the text is read as objects first.
        $value = json_decode($json, false, 512, JSON_THROW_ON_ERROR);
        $validator = new Validator();
        $validator->setStopAtFirstError(false);
        $validator->setMaxErrors(PHP_INT_MAX);
        $error = $validator->validate($value, self::schema())->error();
        if ($error !== null) {
            $node = self::invalidNode($error);
            $reason = (new ErrorFormatter())->formatErrorMessage($node);
            throw new AstDecodeError(self::pointer($node->data()->fullPath()), $reason);
        }
        $ast = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($ast)) {
            throw new \LogicException('the schema accepted a template AST that is not an object');
        }

        return self::native($ast);
    }

    private static function schema(): object
    {
        if (self::$schema === null) {
            $text = file_get_contents(self::SCHEMA);
            if ($text === false) {
                throw new \RuntimeException('cannot read ' . self::SCHEMA);
            }
            $schema = json_decode($text, false, 512, JSON_THROW_ON_ERROR);
            if (!is_object($schema)) {
                throw new \RuntimeException(self::SCHEMA . ' is no JSON object');
            }
            self::$schema = $schema;
        }

        return self::$schema;
    }

    /**
     * The invalid node (AST-10): of the errors of the tree, the deepest instance location, and of several at that depth
     * the least in code point order. The schema selects the schema of a node by its type with if/then, so an error
     * names a value of the node itself, and the errors of an enclosing if lie above it. Of the errors at that location,
     * it is the first one without sub-errors.
     */
    private static function invalidNode(ValidationError $error): ValidationError
    {
        $found = $error;
        $pending = [$error];
        while ($pending !== []) {
            $current = array_shift($pending);
            if (self::chosenOver($current, $found)) {
                $found = $current;
            }
            array_push($pending, ...$current->subErrors());
        }

        return $found;
    }

    private static function chosenOver(ValidationError $a, ValidationError $b): bool
    {
        $left = $a->data()->fullPath();
        $right = $b->data()->fullPath();
        if (count($left) !== count($right)) {
            return count($left) > count($right);
        }
        $order = strcmp(self::pointer($left), self::pointer($right));
        if ($order !== 0) {
            return $order < 0;
        }

        return $a->subErrors() === [] && $b->subErrors() !== [];
    }

    /** @param list<int|string> $tokens */
    private static function pointer(array $tokens): string
    {
        return implode('', array_map(
            static fn (int|string $token): string => '/' . strtr((string) $token, ['~' => '~0', '/' => '~1']),
            $tokens,
        ));
    }

    /**
     * The AST of the package holds a number literal as a float, as the parser makes it.
     *
     * @param array<mixed> $value
     * @return array<mixed>
     */
    private static function native(array $value): array
    {
        foreach ($value as $key => $item) {
            if (is_array($item)) {
                $value[$key] = self::native($item);
            }
        }
        if (($value['type'] ?? null) === 'Literal' && $value['kind'] === 'number') {
            $value['value'] = (float) $value['value'];
        }

        return $value;
    }
}
