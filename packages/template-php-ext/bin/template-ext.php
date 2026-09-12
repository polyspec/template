#!/usr/bin/env php
<?php

declare(strict_types=1);

// Command line interface as defined in docs/spec/conformance.md (CNF-4), on the native engine.
//   parse FILE [--root DIR] [--delimiters OC]
//   render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC]

use Polyspec\Template\Native\Engine;
use Polyspec\Template\Native\TemplateError;

if (!extension_loaded('polyspec_template')) {
    fwrite(STDERR, "the polyspec_template extension is not loaded\n");
    exit(1);
}

function usage(string $message): never
{
    fwrite(STDERR, $message . "\nusage: template-ext parse FILE [--root DIR] [--delimiters OC]\n       template-ext render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC]\n");
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
if ($command === null || $file === null || !in_array($command, ['parse', 'render'], true)) {
    usage('command and FILE are required');
}
$options = ['data' => null, 'define' => null, 'env' => null, 'root' => null, 'delimiters' => null];
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
    if ($command === 'parse' || $options['root'] === null || str_contains($file, '..')) {
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
    if ($command === 'parse') {
        if ($filePath === false) {
            usage("cannot read {$file}");
        }
        $source = file_get_contents($filePath);
        if ($source === false) {
            usage("cannot read {$file}");
        }
        fwrite(STDOUT, Engine::parseToJson($source, $name, $engineOptions));
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
