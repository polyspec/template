<?php

declare(strict_types=1);

namespace Polyspec\Template\Render;

use Polyspec\Template\Value\MapValue;

/**
 * One rendered template location and its context data.
 *
 * @phpstan-type Span array{0: int, 1: int} the start and the end byte offset of a node
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
