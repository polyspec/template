#!/usr/bin/env php
<?php

declare(strict_types=1);

// Benchmark driver for the native PHP extension.
// Usage: php -dextension=... bench-ext.php FIXTURE_DIR ITERS WARMUP [TARGET] [LEGACY_WRAPPERS]
// Parses the templates once, renders WARMUP times, then measures ITERS renders.

use Polyspec\Template\Native\Engine;

if (!extension_loaded('polyspec_template')) {
    fwrite(STDERR, "the polyspec_template extension is not loaded\n");
    exit(1);
}

$fixture = realpath($argv[1] ?? '');
$iters = (int) ($argv[2] ?? 0);
$warmup = (int) ($argv[3] ?? 0);
$target = $argv[4] ?? 'input.tpl';
$legacyWrappers = ($argv[5] ?? 'false') === 'true';
if ($fixture === false || $iters <= 0 || $warmup < 0) {
    fwrite(STDERR, "usage: bench-ext.php FIXTURE_DIR ITERS WARMUP\n");
    exit(1);
}

$read = static function (string $name, string $fallback) use ($fixture): string {
    $path = $fixture . '/' . $name;
    if (!is_file($path)) return $fallback;
    $value = file_get_contents($path);
    if ($value === false) {
        fwrite(STDERR, "cannot read {$path}\n");
        exit(1);
    }

    return $value;
};

$engine = new Engine($fixture, ['legacy_wrappers' => $legacyWrappers]);
$assign = json_decode($read('data.json', '{}'), true, 512, JSON_THROW_ON_ERROR);
$options = [];
if (is_file($fixture . '/define.json')) {
    $options['define'] = json_decode($read('define.json', '{}'), true, 512, JSON_THROW_ON_ERROR);
}
if (is_file($fixture . '/env.json')) {
    $options['env'] = json_decode($read('env.json', '{}'), true, 512, JSON_THROW_ON_ERROR);
}

// The first render parses every template and fills the native engine cache.
$output = $engine->render($target, $assign, $options);
for ($i = 0; $i < $warmup; $i++) {
    $engine->render($target, $assign, $options);
}

$start = hrtime(true);
for ($i = 0; $i < $iters; $i++) {
    $engine->render($target, $assign, $options);
}
$seconds = (hrtime(true) - $start) / 1e9;
$repeated = $engine->render($target, $assign, $options);

fwrite(STDOUT, json_encode([
    'lang' => 'php-ext',
    'fixture' => basename($fixture),
    'iters' => $iters,
    'seconds' => $seconds,
    'output_sha256' => hash('sha256', $output),
    'repeat_sha256' => hash('sha256', $repeated),
], JSON_UNESCAPED_SLASHES) . "\n");
