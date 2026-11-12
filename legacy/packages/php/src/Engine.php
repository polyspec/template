<?php

declare(strict_types=1);

namespace Polyspec\Template;

/** Delegates requests to one complete AST or generated program. */
final class Engine implements Program
{
    /** Creates an engine from one program. */
    public function __construct(private readonly Program $program)
    {
    }

    /** Delegates request preparation to the program. */
    public function prepare(string|array $target, mixed $assign = [], array $options = []): PreparedRender
    {
        return $this->program->prepare($target, $assign, $options);
    }

    /** Delegates rendering to the program. */
    public function render(string|array $target, mixed $assign = [], array $options = []): string
    {
        return $this->program->render($target, $assign, $options);
    }
}
