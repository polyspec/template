<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests\Value;

final class InvalidName
{
    public string $name = "\xff";

    public function bad(): string
    {
        return "\xff";
    }
}
