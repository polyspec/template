<?php

declare(strict_types=1);

namespace Polyspec\Template\Format;

use Polyspec\Template\AstProgram;

/**
 * The parser of this package as the analyzer of the formatter.
 */
final class PackageAnalyzer implements Analyzer
{
    public function analyze(string $source, string $name, array $options): array
    {
        return AstProgram::analyze($source, $name, $options);
    }

    public function parse(string $source, string $name, array $options): array
    {
        return AstProgram::parse($source, $name, $options);
    }
}
