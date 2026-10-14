<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests\Value;

final class SelfSerializing implements \JsonSerializable
{
    public function jsonSerialize(): mixed
    {
        return $this;
    }
}
