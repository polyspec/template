#!/usr/bin/env php
<?php

declare(strict_types=1);

// Benchmark driver for the PHP implementation.
// Usage: php bench-php.php FIXTURE_DIR ITERS WARMUP [TARGET] [LEGACY_WRAPPERS]
// Parses the templates once, renders WARMUP times, then measures ITERS renders.

use Polyspec\Template\Engine;
use Polyspec\Template\Loader\ArrayLoader;
use Polyspec\Template\Value\Json;
use Polyspec\Template\Value\MapValue;

require dirname(__DIR__, 3) . '/packages/template-php/vendor/autoload.php';

/**
 * Reads every template file under a directory into a name to source map.
 *
 * @param array<string, string> $into
 *
 * @return array<string, string>
 */
function collectTemplates(string $dir, string $prefix, array $into): array
{
    foreach (scandir($dir) ?: [] as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }
        $path = $dir . '/' . $entry;
        if (is_dir($path)) {
            $into = collectTemplates($path, $prefix . $entry . '/', $into);
        } elseif (str_ends_with($entry, '.tpl')) {
            $into[$prefix . $entry] = (string) file_get_contents($path);
        }
    }

    return $into;
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

$fixture = realpath($argv[1] ?? '');
$iters = (int) ($argv[2] ?? 0);
$warmup = (int) ($argv[3] ?? 0);
$target = $argv[4] ?? 'input.tpl';
$legacyWrappers = ($argv[5] ?? 'false') === 'true';
if ($fixture === false || $iters <= 0) {
    fwrite(STDERR, "usage: bench-php.php FIXTURE_DIR ITERS WARMUP\n");
    exit(1);
}

$engine = new Engine(new ArrayLoader(collectTemplates($fixture, '', [])), ['legacy_wrappers' => $legacyWrappers]);
$readJson = static function (string $name) use ($fixture): mixed {
    $path = $fixture . '/' . $name;

    return is_file($path) ? Json::parse((string) file_get_contents($path)) : null;
};

$assign = $readJson('data.json') ?? [];
$options = [];
$define = $readJson('define.json');
$env = $readJson('env.json');
if ($define !== null) {
    $options['define'] = plain($define);
}
if ($env !== null) {
    $options['env'] = plain($env);
}

// Preparation parses templates and binds the request once.
$prepared = $engine->prepare($target, $assign, $options);
$output = $prepared->render();
for ($i = 0; $i < $warmup; $i++) {
    $prepared->render();
}

$start = hrtime(true);
for ($i = 0; $i < $iters; $i++) {
    $prepared->render();
}
$seconds = (hrtime(true) - $start) / 1e9;
$repeated = $prepared->render();

fwrite(STDOUT, json_encode([
    'lang' => 'php',
    'fixture' => basename($fixture),
    'iters' => $iters,
    'seconds' => $seconds,
    'output_sha256' => hash('sha256', $output),
    'repeat_sha256' => hash('sha256', $repeated),
], JSON_UNESCAPED_SLASHES) . "\n");
