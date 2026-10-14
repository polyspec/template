<?php

declare(strict_types=1);

namespace Polyspec\Template;

/**
 * The failure of AstProgram::decodeTemplate: the JSON is not a template AST of contracts/schema/ast.schema.json.
 */
final class AstDecodeError extends \InvalidArgumentException
{
    /**
     * @param string $path The JSON Pointer (RFC 6901) of the invalid node, empty for the root (AST-10).
     * @param string $reason The rule of the schema that the node breaks.
     */
    public function __construct(public readonly string $path, string $reason)
    {
        parent::__construct('invalid template AST at ' . ($path === '' ? 'the root' : $path) . ': ' . $reason);
    }
}
