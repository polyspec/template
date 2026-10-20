<?php

declare(strict_types=1);

namespace Polyspec\Template\Native;

use Polyspec\Template\Format\Analyzer;

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
        return Engine::analyze($source, $name, $options);
    }

    public function parse(string $source, string $name, array $options): array
    {
        return Engine::parse($source, $name, $options);
    }
}
