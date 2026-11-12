<?php

declare(strict_types=1);

namespace Polyspec\Template\Render;

/**
 * Runtime state required by both AST and generated programs.
 *
 * @phpstan-type Limits array{iterations: int, depth: int, outputBytes: int, expressionDepth: int} the limits of a
 *     render (RT-33)
 */
interface RuntimeServices
{
    /** @return Limits */
    public function limits(): array;

    /** Returns the host function registered under a name. */
    public function hostFunction(string $name): ?callable;

    /** Returns one registered logical class function. */
    public function classFunction(string $className, string $method): ?callable;
}
