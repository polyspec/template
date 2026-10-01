<?php

declare(strict_types=1);

namespace Polyspec\Template;

/**
 * The boundary of the public parse, prepare and render operations (ERR-12, ERR-13).
 */
final class InternalBoundary
{
    /**
     * Runs one operation and reports an error of the PHP `Error` hierarchy as E_INTERNAL for
     * `$template`. A template error and every exception pass unchanged.
     *
     * @template T
     * @param \Closure(): T $operation
     * @return T
     */
    public static function run(string $template, \Closure $operation): mixed
    {
        try {
            return $operation();
        } catch (\Error $error) {
            throw TemplateError::withoutPosition('E_INTERNAL', $template, 'internal failure: ' . $error->getMessage());
        }
    }
}
