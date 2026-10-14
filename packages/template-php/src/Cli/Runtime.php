<?php

declare(strict_types=1);

namespace Polyspec\Template\Cli;

use Polyspec\Template\Format\Analyzer;
use Polyspec\Template\TemplateError;

/**
 * The implementation behind the conformance command line: this package or the PHP extension. The commands of
 * Application parse the arguments and read the files; a runtime parses, analyzes and renders, and reports a template
 * error as TemplateError.
 */
interface Runtime
{
    /**
     * The AST JSON of a template (CNF-4 `parse`).
     *
     * @param array{delimiters?: string} $options
     * @throws TemplateError
     */
    public function parseJson(string $source, string $name, array $options): string;

    /**
     * Renders the template `name` under `root` with the bytes of the data, define and env JSON files (CNF-4 `render`).
     *
     * @param array{delimiters?: string} $options
     * @throws TemplateError
     */
    public function render(
        string $root,
        string $name,
        array $options,
        ?string $data,
        ?string $define,
        ?string $env,
    ): string;

    /**
     * The parser that `tokens` and the formatter of `format` run.
     */
    public function analyzer(): Analyzer;
}
