#!/usr/bin/env php
<?php

declare(strict_types=1);

// Command line interface as defined in docs/spec/conformance.md (CNF-4).
//   parse FILE [--root DIR] [--delimiters OC] [--legacy-wrappers true]
//   render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] [--legacy-wrappers true]

use Polyspec\Template\Ast;
use Polyspec\Template\Engine;
use Polyspec\Template\Loader\FilesystemLoader;
use Polyspec\Template\TemplateError;
use Polyspec\Template\Value\BindError;
use Polyspec\Template\Value\Json;
use Polyspec\Template\Value\MapValue;

foreach ([__DIR__ . '/../vendor/autoload.php', __DIR__ . '/../../../autoload.php'] as $autoload) {
    if (is_file($autoload)) {
        require $autoload;
        break;
    }
}

function usage(string $message): never
{
    fwrite(STDERR, $message . "\nusage: template parse FILE [--root DIR] [--delimiters OC] [--legacy-wrappers true]\n       template render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] [--legacy-wrappers true]\n");
    exit(1);
}

/**
 * Converts template values into plain PHP arrays for the render options.
 */
function plain(mixed $value): mixed
{
    if ($value instanceof MapValue) {
        $result = [];
        foreach ($value->entries() as $key => $item) {
            $result[$key] = plain($item);
        }

        return $result;
    }
    if (is_array($value)) {
        return array_map('plain', $value);
    }

    return $value;
}

$arguments = array_slice($argv, 1);
$command = $arguments[0] ?? null;
$file = $arguments[1] ?? null;
if ($command === null || $file === null || !in_array($command, ['parse', 'render'], true)) {
    usage('command and FILE are required');
}
$options = ['data' => null, 'define' => null, 'env' => null, 'root' => null, 'delimiters' => null, 'legacy-wrappers' => null];
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

$readJson = static function (string $path) use ($root): mixed {
    $bytes = file_get_contents(str_starts_with($path, '/') ? $path : $root . '/' . $path);
    if ($bytes === false) {
        usage("cannot read {$path}");
    }

    return Json::parse($bytes);
};

try {
    $engineOptions = [];
    if ($options['delimiters'] !== null) {
        $engineOptions['delimiters'] = $options['delimiters'];
    }
    if ($options['legacy-wrappers'] === 'true') {
        $engineOptions['legacy_wrappers'] = true;
    }
    if ($command === 'parse') {
        if ($filePath === false) {
            usage("cannot read {$file}");
        }
        $source = file_get_contents($filePath);
        if ($source === false) {
            usage("cannot read {$file}");
        }
        fwrite(STDOUT, Ast::toJson(Engine::parse($source, $name, $engineOptions)));
    } else {
        $engine = new Engine(new FilesystemLoader($root), $engineOptions);
        $renderOptions = [];
        $assign = [];
        try {
            if ($options['data'] !== null) {
                $assign = $readJson($options['data']);
            }
            if ($options['define'] !== null) {
                $renderOptions['define'] = plain($readJson($options['define']));
            }
            if ($options['env'] !== null) {
                $renderOptions['env'] = plain($readJson($options['env']));
            }
        } catch (BindError $error) {
            throw TemplateError::withoutPosition($error->errorCode, $name, $error->getMessage());
        }
        fwrite(STDOUT, $engine->render($name, $assign, $renderOptions));
    }
} catch (TemplateError $error) {
    fwrite(STDERR, json_encode($error->toArray(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n");
    exit(2);
}
