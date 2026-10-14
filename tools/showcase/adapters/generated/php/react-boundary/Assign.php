<?php

declare(strict_types=1);

namespace Polyspec\Showcase\Generated\ReactBoundary;

final class Assign
{
    public function __construct(
        public readonly ?string $title = null,
        public readonly ?string $heading = null,
        public readonly ?string $island_label = null,
        public readonly ?string $root_label = null,
        public readonly ?string $defined_label = null,
        public readonly ?Page $page = null,
    ) {
    }
}
