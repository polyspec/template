<?php

declare(strict_types=1);

namespace Polyspec\Template\Native;

use RuntimeException;

/**
 * The native engine is the C extension polyspec_template, which PIE builds and installs from the package
 * polyspec/template-php-ext. Without it the native classes fail with this error and run no other engine.
 */
final class ExtensionNotLoaded extends RuntimeException
{
    /** Fails when the PHP that runs the caller has not loaded the extension. */
    public static function check(): void
    {
        if (!extension_loaded('polyspec_template')) {
            throw new self(
                'the polyspec_template extension is not loaded; install it with PIE: pie install polyspec/template-php-ext',
            );
        }
    }
}
