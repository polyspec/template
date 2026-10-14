<?php

declare(strict_types=1);

namespace Polyspec\Template\Format;

/**
 * Why the formatter returned no text.
 */
final class FormatError
{
    /**
     * @param 'parse'|'invariant'|'html' $reason `parse`: the source does not parse. `invariant`: the formatted text
     *        does not parse to the same AST. `html`: the HTML structure is not balanced, so the lines cannot be
     *        indented.
     * @param string|null $code error code of the parser, or null
     * @param int $line 1-based line of the error position
     * @param int $col 1-based byte column of the error position, as in parser errors (ERR-1)
     */
    public function __construct(
        public readonly string $reason,
        public readonly ?string $code,
        public readonly int $line,
        public readonly int $col,
        public readonly string $message,
    ) {
    }

    /**
     * @return array{reason: string, code: string|null, line: int, col: int, message: string}
     */
    public function toArray(): array
    {
        return [
            'reason' => $this->reason,
            'code' => $this->code,
            'line' => $this->line,
            'col' => $this->col,
            'message' => $this->message,
        ];
    }
}
