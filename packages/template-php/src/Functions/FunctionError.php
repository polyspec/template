<?php

declare(strict_types=1);

namespace Polyspec\Template\Functions;

/**
 * Failure raised by a built-in function; the evaluator attaches the call position.
 */
final class FunctionError extends \RuntimeException
{
    public function __construct(public readonly string $errorCode, string $message)
    {
        parent::__construct($message);
    }
}
