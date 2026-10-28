<?php

declare(strict_types=1);

namespace Polyspec\Template\Value;

/**
 * Data binding failure (E_DATA_* codes).
 */
final class BindError extends \RuntimeException
{
    public function __construct(public readonly string $errorCode, string $message, ?\Throwable $previous = null)
    {
        parent::__construct($message, 0, $previous);
    }
}
