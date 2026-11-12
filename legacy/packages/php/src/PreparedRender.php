<?php

declare(strict_types=1);

namespace Polyspec\Template;

/** A normalized request prepared for repeatable rendering. */
final class PreparedRender
{
    /** Creates a prepared request for the entry template `$name` from one program execution. */
    public function __construct(private readonly string $name, private readonly PreparedExecution $execution)
    {
    }

    /** Renders the prepared request. An error of the PHP `Error` hierarchy is E_INTERNAL (ERR-13). */
    public function render(): string
    {
        return InternalBoundary::run($this->name, fn (): string => $this->execution->render());
    }
}
