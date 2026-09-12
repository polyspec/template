<?php

declare(strict_types=1);

namespace Polyspec\Template\Value;

/**
 * Malformed JSON text.
 */
final class JsonSyntaxError extends \RuntimeException
{
    public function __construct(string $message, public readonly int $offset)
    {
        parent::__construct($message);
    }
}
