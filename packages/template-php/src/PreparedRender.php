<?php

declare(strict_types=1);

namespace Polyspec\Template;

/** A normalized request prepared for repeatable rendering. */
final class PreparedRender
{
    /** Creates a prepared request from one program execution. */
    public function __construct(private readonly PreparedExecution $execution)
    {
    }

    /** Renders the prepared request. */
    public function render(): string
    {
        return $this->execution->render();
    }
}
