<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

final class SelfSerializing implements \JsonSerializable
{
    public function jsonSerialize(): mixed
    {
        return $this;
    }
}
