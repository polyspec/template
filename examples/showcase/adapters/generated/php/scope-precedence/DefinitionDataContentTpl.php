<?php

declare(strict_types=1);

namespace Polyspec\Showcase\Generated\ScopePrecedence;

final class DefinitionDataContentTpl
{
    public function __construct(
        public bool $has_title = false,
        public ?string $title = null,
        public bool $has_root_label = false,
        public ?string $root_label = null,
        public bool $has_defined_label = false,
        public ?string $defined_label = null,
        public bool $has_layout_local = false,
        public ?string $layout_local = null,
    ) {
    }
}
