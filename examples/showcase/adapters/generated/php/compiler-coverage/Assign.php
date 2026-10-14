<?php

declare(strict_types=1);

namespace Polyspec\Showcase\Generated\CompilerCoverage;

use Polyspec\Template\Value\MapValue;

final class Assign
{
    public function __construct(
        public readonly bool $flag,
        public readonly string $dangerous,
        public readonly array $empty_list,
        public readonly MapValue $empty_map,
        public readonly Page $page,
        public readonly array $numbers,
        public readonly MapValue $lookup,
        public readonly array $rows,
    ) {
    }
}
