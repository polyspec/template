<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

final class MagicHolder
{
    /**
     * @param list<mixed> $arguments
     */
    public function __call(string $name, array $arguments): string
    {
        return 'magic:' . $name;
    }

    public function visible(): string
    {
        return $this->hidden();
    }

    private function hidden(): string
    {
        return 'h';
    }
}
