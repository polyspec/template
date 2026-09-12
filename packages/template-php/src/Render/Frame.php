<?php

declare(strict_types=1);

namespace Polyspec\Template\Render;

use Polyspec\Template\Value\MapValue;

/**
 * One rendered template location and its context data.
 */
final class Frame
{
    /**
     * @param list<int>|null $lines
     */
    public function __construct(
        public readonly string $name,
        public readonly ?array $lines,
        public readonly MapValue $context,
    ) {
    }

}
