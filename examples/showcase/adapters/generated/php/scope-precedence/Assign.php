<?php

declare(strict_types=1);

namespace Polyspec\Showcase\Generated\ScopePrecedence;

final class Assign
{
    public function __construct(
        public readonly Page $page,
        public readonly string $root_label,
        public readonly string $defined_label,
    ) {
    }
}
