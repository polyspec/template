<?php

declare(strict_types=1);

namespace Polyspec\Template\Render;

use Polyspec\Template\Value\MapValue;

/**
 * One rendered template file: local scope, context data and active loops (RT-11 to RT-14).
 *
 * The local scope and the loop stacks are objects so that an include can share them (RT-21).
 */
final class Frame
{
    /** @var list<int>|null */
    public readonly ?array $lines;
    public readonly string $name;

    /**
     * @param array{ast: array<string, mixed>, lines: list<int>|null} $template
     * @param \ArrayObject<string, list<array<string, mixed>>> $loops
     */
    public function __construct(
        public readonly array $template,
        public readonly MapValue $context,
        public readonly MapValue $locals = new MapValue(),
        public readonly \ArrayObject $loops = new \ArrayObject(),
    ) {
        $this->lines = $template['lines'];
        $this->name = $template['ast']['name'];
    }

    public function lookup(string $name): mixed
    {
        if ($this->locals->has($name)) {
            return $this->locals->get($name);
        }
        if ($this->context->has($name)) {
            return $this->context->get($name);
        }

        return null;
    }

    /**
     * @return array<string, mixed>|null the innermost loop meta for the variable name
     */
    public function loopMeta(string $name): ?array
    {
        $stack = $this->loops[$name] ?? [];

        return $stack === [] ? null : $stack[count($stack) - 1];
    }
}
