<?php

declare(strict_types=1);

namespace Polyspec\Template\Functions;

/**
 * A group of built-in functions: Registry joins the tables of the groups.
 */
interface FunctionGroup
{
    /**
     * The functions of the group by name, with their argument counts and the callable that runs them.
     *
     * @return array<string, array{min: int, max: int, call: callable}>
     */
    public static function table(): array;
}
