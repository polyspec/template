<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

final class Exploding
{
    public function fail(): string
    {
        throw new \RuntimeException('method exploded');
    }

    public function same(object $other): bool
    {
        return $other === $this;
    }
}
