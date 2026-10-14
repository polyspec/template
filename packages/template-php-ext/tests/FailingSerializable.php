<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

final class FailingSerializable implements \JsonSerializable
{
    public function jsonSerialize(): mixed
    {
        throw new \RuntimeException('serialize exploded');
    }
}
