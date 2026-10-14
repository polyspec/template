<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

class Bag extends \stdClass
{
    public int $a = 1;
    private int $p = 3;

    public function hiddenValue(): int
    {
        return $this->p;
    }
}
