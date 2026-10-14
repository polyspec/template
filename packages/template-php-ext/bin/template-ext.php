#!/usr/bin/env php
<?php

declare(strict_types=1);

// Command line interface as defined in docs/spec/conformance.md (CNF-4), on the native engine.
//   parse FILE [--root DIR] [--delimiters OC]
//   render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC]
//   tokens FILE [--root DIR] [--delimiters OC]
//   format FILE [--indent none|tab|N] [--delimiters OC]
// `format` runs the formatter of the PHP package over the native analysis, which defines the formatting once.

use Polyspec\Template\Format\FormatCommand;
use Polyspec\Template\Native\Engine;
use Polyspec\Template\Native\NativeAnalyzer;
use Polyspec\Template\Native\TemplateError;

foreach ([__DIR__ . '/../vendor/autoload.php', __DIR__ . '/../../../autoload.php'] as $autoload) {
    if (is_file($autoload)) {
        require $autoload;
        break;
    }
}

if (!extension_loaded('polyspec_template')) {
    fwrite(STDERR, "the polyspec_template extension is not loaded\n");
    exit(1);
}

function usage(string $message): never
{
    fwrite(STDERR, $message . "\nusage: template-ext parse FILE [--root DIR] [--delimiters OC]\n       template-ext render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC]\n       template-ext tokens FILE [--root DIR] [--delimiters OC]\n       template-ext " . FormatCommand::USAGE . "\n");
    exit(1);
}

/**
 * Writes the error JSON and exits with the status of a template error.
 *
 * @param array{code: string, template: string, line: int, col: int, offset: int, end: int, message: string} $error
 */
function fail(array $error): never
{
    fwrite(STDERR, json_encode($error, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n");
    exit(2);
}

$arguments = array_slice($argv, 1);
$command = $arguments[0] ?? null;
$file = $arguments[1] ?? null;
if ($command === 'format') {
    exit(FormatCommand::run('template-ext', array_slice($arguments, 1), new NativeAnalyzer(), STDOUT, STDERR));
}
if ($command === null || $file === null || !in_array($command, ['parse', 'render', 'tokens'], true)) {
    usage('command and FILE are required');
}
$options = $command === 'render'
    ? ['data' => null, 'define' => null, 'env' => null, 'root' => null, 'delimiters' => null]
    : ['root' => null, 'delimiters' => null];
$rest = array_slice($arguments, 2);
for ($i = 0; $i < count($rest); $i += 2) {
    $flag = $rest[$i];
    $value = $rest[$i + 1] ?? null;
    if (!str_starts_with($flag, '--') || $value === null) {
        usage("invalid option {$flag}");
    }
    $key = substr($flag, 2);
    if (!array_key_exists($key, $options)) {
        usage("unknown option {$flag}");
    }
    $options[$key] = $value;
}

$filePath = realpath($file);
$root = $options['root'] === null
    ? ($filePath === false ? getcwd() : dirname($filePath))
    : realpath($options['root']);
if ($root === false) {
    usage('invalid --root');
}
if ($filePath !== false) {
    if (!str_starts_with($filePath, $root . DIRECTORY_SEPARATOR)) {
        usage('FILE is outside of --root');
    }
    $name = str_replace(DIRECTORY_SEPARATOR, '/', substr($filePath, strlen($root) + 1));
} else {
    if ($command !== 'render' || $options['root'] === null || str_contains($file, '..')) {
        usage("cannot read {$file}");
    }
    $name = str_replace(DIRECTORY_SEPARATOR, '/', ltrim($file, DIRECTORY_SEPARATOR));
}

/**
 * Reads a JSON file and reports invalid UTF-8 as a data error.
 */
$readJson = static function (string $path) use ($root, $name): string {
    $full = str_starts_with($path, '/') ? $path : $root . '/' . $path;
    $bytes = file_get_contents($full);
    if ($bytes === false) {
        usage("cannot read {$path}");
    }
    if (preg_match('//u', $bytes) !== 1) {
        fail(['code' => 'E_DATA_INVALID_UTF8', 'template' => $name, 'line' => 0, 'col' => 0, 'offset' => 0, 'end' => 0, 'message' => 'input is not valid UTF-8']);
    }

    return $bytes;
};

$engineOptions = [];
if ($options['delimiters'] !== null) {
    $engineOptions['delimiters'] = $options['delimiters'];
}
try {
    if ($command === 'parse' || $command === 'tokens') {
        if ($filePath === false) {
            usage("cannot read {$file}");
        }
        $source = file_get_contents($filePath);
        if ($source === false) {
            usage("cannot read {$file}");
        }
        if ($command === 'parse') {
            fwrite(STDOUT, Engine::parseToJson($source, $name, $engineOptions));
        } else {
            // EDT-8 tokens as [start, end, type] with UTF-8 byte offsets after the byte order mark, as AST spans count them.
            $tokens = array_map(static fn (array $token): array => [$token['start'], $token['end'], $token['kind']], Engine::analyze($source, $name, $engineOptions)['tokens']);
            fwrite(STDOUT, json_encode($tokens, JSON_THROW_ON_ERROR));
        }
    } else {
        $engine = new Engine($root, $engineOptions);
        $assign = $options['data'] === null ? '{}' : $readJson($options['data']);
        $define = $options['define'] === null ? null : $readJson($options['define']);
        $env = $options['env'] === null ? null : $readJson($options['env']);
        fwrite(STDOUT, $engine->renderJson($name, $assign, $define, $env));
    }
} catch (TemplateError $error) {
    fail($error->toArray());
}
