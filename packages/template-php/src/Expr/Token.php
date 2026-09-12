<?php

declare(strict_types=1);

namespace Polyspec\Template\Expr;

/**
 * Expression token (EXP-1, CNF-13). Offsets are byte indexes into the source.
 */
final class Token
{
    public function __construct(
        public readonly string $type,
        public readonly string $value,
        public readonly int $start,
        public readonly int $end,
        public readonly ?string $decoded = null,
    ) {
    }
}
