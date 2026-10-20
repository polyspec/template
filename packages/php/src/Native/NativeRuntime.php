<?php

declare(strict_types=1);

namespace Polyspec\Template\Native;

use Polyspec\Template\Cli\Runtime;
use Polyspec\Template\ErrorCode;
use Polyspec\Template\Format\Analyzer;
use Polyspec\Template\TemplateError;

/**
 * The native engine of the extension as the runtime of the command line of the PHP package.
 */
final class NativeRuntime implements Runtime
{
    /** @throws ExtensionNotLoaded when the extension is not loaded */
    public function __construct()
    {
        ExtensionNotLoaded::check();
    }

    public function parseJson(string $source, string $name, array $options): string
    {
        return Engine::parseToJson($source, $name, $options);
    }

    public function render(
        string $root,
        string $name,
        array $options,
        ?string $data,
        ?string $define,
        ?string $env,
    ): string {
        foreach ([$data, $define, $env] as $json) {
            // The command line reports invalid UTF-8 in a JSON file itself, as the parser of JSON in the package does.
            if ($json !== null && preg_match('//u', $json) !== 1) {
                throw TemplateError::withoutPosition(
                    ErrorCode::E_DATA_INVALID_UTF8,
                    $name,
                    'input is not valid UTF-8',
                );
            }
        }
        return (new Engine($root, $options))->renderJson($name, $data ?? '{}', $define, $env);
    }

    public function analyzer(): Analyzer
    {
        return new NativeAnalyzer();
    }
}
