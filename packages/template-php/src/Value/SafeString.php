<?php

declare(strict_types=1);

namespace Polyspec\Template\Value;

/**
 * A string that the echo tag writes without escaping (VAL-6).
 */
final class SafeString
{
    /**
     * Wraps text that the echo tag writes as it is.
     */
    public function __construct(public readonly string $text)
    {
    }
}
