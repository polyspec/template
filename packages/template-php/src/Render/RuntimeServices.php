<?php

declare(strict_types=1);

namespace Polyspec\Template\Render;

/** Runtime state required by both AST and generated programs. */
interface RuntimeServices
{
    /** @return array{iterations: int, depth: int, outputBytes: int, expressionDepth: int} */
    public function limits(): array;

    /** Returns the host function registered under a name. */
    public function hostFunction(string $name): ?callable;
}
