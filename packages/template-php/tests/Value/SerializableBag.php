<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests\Value;

final class SerializableBag extends \stdClass implements \JsonSerializable
{
    public int $a = 1;

    public function jsonSerialize(): mixed
    {
        return ['j' => true];
    }
}
