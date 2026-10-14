<?php

declare(strict_types=1);

namespace Polyspec\Showcase\Generated\ScopePrecedence;

final class Definition
{
    public function __construct(
        public readonly ?string $template = null,
        public readonly ?string $html = null,
        public readonly mixed $data = null,
    ) {
    }
}
