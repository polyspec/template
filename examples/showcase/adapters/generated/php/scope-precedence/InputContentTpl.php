<?php

declare(strict_types=1);

namespace Polyspec\Showcase\Generated\ScopePrecedence;

final class InputContentTpl
{
    public function __construct(
        public string $title,
        public string $root_label,
        public string $defined_label,
        public ?string $layout_local = null,
    ) {
    }
}
