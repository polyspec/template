<?php

declare(strict_types=1);

namespace Polyspec\Template\Native;

use Polyspec\Template\Format\Analyzer;
use Polyspec\Template\TemplateError as PackageTemplateError;

/**
 * The native parser of the extension as the analyzer of the formatter of the PHP package, which defines the
 * formatting once for both implementations.
 */
final class NativeAnalyzer implements Analyzer
{
    /** @throws ExtensionNotLoaded when the extension is not loaded */
    public function __construct()
    {
        ExtensionNotLoaded::check();
    }

    public function analyze(string $source, string $name, array $options): array
    {
        try {
            return Engine::analyze($source, $name, $options);
        } catch (TemplateError $error) {
            throw self::packageError($error);
        }
    }

    public function parse(string $source, string $name, array $options): array
    {
        try {
            return Engine::parse($source, $name, $options);
        } catch (TemplateError $error) {
            throw self::packageError($error);
        }
    }

    /**
     * The error of the extension as the error type that the formatter reads; the fields are the same (ERR-1).
     */
    public static function packageError(TemplateError $error): PackageTemplateError
    {
        return new PackageTemplateError(
            $error->getErrorCode(),
            $error->getTemplate(),
            $error->getErrorLine(),
            $error->getErrorCol(),
            $error->getOffset(),
            $error->getEnd(),
            $error->getMessage(),
        );
    }
}
