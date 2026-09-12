<?php

declare(strict_types=1);

namespace Polyspec\Template\Render;

use Polyspec\Template\Value\MapValue;

/** Local variables and loop stacks shared by includes and isolated by blocks. */
final class Scope
{
    public readonly MapValue $locals;
    /** @var \ArrayObject<string, list<array<string, mixed>>> */
    public readonly \ArrayObject $loops;

    public function __construct(?MapValue $locals = null)
    {
        $this->locals = $locals ?? new MapValue();
        $this->loops = new \ArrayObject();
    }

    public function lookup(Frame $frame, string $name): mixed
    {
        if ($this->locals->has($name)) {
            return $this->locals->get($name);
        }

        return $frame->context->has($name) ? $frame->context->get($name) : null;
    }

    /** @return array<string, mixed>|null */
    public function loopMeta(string $name): ?array
    {
        $stack = $this->loops[$name] ?? [];

        return $stack === [] ? null : $stack[count($stack) - 1];
    }
}
