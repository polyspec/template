<?php

declare(strict_types=1);

namespace Polyspec\Template;

/** One reusable prepared render operation. */
interface PreparedExecution
{
    /** Renders the prepared request. */
    public function render(): string;
}
