#!/usr/bin/env php
<?php

// Runs the PHP adapter of the showcase on one scenario directory and prints its JSON report, or with
// SHOWCASE_BENCH_ITERATIONS the measurements of its renders. The adapter classes are PSR-4 classes: the generated
// declarations of the contract in generated/php-adapter and the adapter in php, which the class loader of the PHP
// package loads.

declare(strict_types=1);

use Composer\Autoload\ClassLoader;
use Polyspec\Showcase\Adapter\Php\Adapter;
use Polyspec\Showcase\Adapter\Php\Output;
use Polyspec\Showcase\Adapter\RenderRequest;
use Polyspec\Template\PreparedRender;

$loader = require dirname(__DIR__, 3) . '/packages/php/vendor/autoload.php';
if (!$loader instanceof ClassLoader) {
    throw new RuntimeException('packages/php/vendor/autoload.php returned no class loader');
}
$loader->addPsr4('Polyspec\\Showcase\\Adapter\\', __DIR__ . '/generated/php-adapter');
$loader->addPsr4('Polyspec\\Showcase\\Adapter\\Php\\', __DIR__ . '/php');

$scenarioRoot = $argv[1] ?? null;
if ($scenarioRoot === null) {
    throw new RuntimeException('usage: php php.php SCENARIO_DIR');
}
$adapter = new Adapter($scenarioRoot);
$request = $adapter->buildRequest($adapter->loadScenario());
$json = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE;
$benchmarkIterations = (int) (getenv('SHOWCASE_BENCH_ITERATIONS') ?: 0);
if ($benchmarkIterations > 0) {
    $warmup = (int) (getenv('SHOWCASE_BENCH_WARMUP') ?: 0);
    for ($index = 0; $index < $warmup; $index++) {
        $adapter->render($request);
    }
    $measured = '';
    $started = hrtime(true);
    for ($index = 0; $index < $benchmarkIterations; $index++) {
        $measured = $adapter->render($request);
    }
    $renderSeconds = (hrtime(true) - $started) / 1e9;
    $output = Output::digest($measured);
    $repeat = Output::digest($adapter->render($request));
    $prepare = Closure::bind(
        static fn (Adapter $adapter, RenderRequest $request): PreparedRender => $adapter->prepare($request),
        null,
        Adapter::class,
    );
    $prepared = $prepare($adapter, $request);
    $preparedOutput = '';
    $preparedStarted = hrtime(true);
    for ($index = 0; $index < $benchmarkIterations; $index++) {
        $preparedOutput = $prepared->render();
    }
    $preparedRenderSeconds = (hrtime(true) - $preparedStarted) / 1e9;
    echo json_encode([
        'language' => 'php', 'iterations' => $benchmarkIterations, 'renderSeconds' => $renderSeconds,
        'preparedRenderSeconds' => $preparedRenderSeconds,
        'bytes' => $output['bytes'], 'outputSha256' => $output['sha256'],
        'repeatSha256' => $repeat['sha256'], 'preparedSha256' => Output::digest($preparedOutput)['sha256'],
    ], JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit(0);
}
$repeated = $adapter->renderTwice($request);
$invalid = new RenderRequest('__contract_missing_target__', $request->assign, $request->define, $request->env);
$beforeFailure = json_encode(Output::requestJson($request), $json);
$failureObserved = false;
try {
    $adapter->render($invalid);
} catch (Throwable) {
    $failureObserved = true;
}
$afterFailure = json_encode(Output::requestJson($request), $json);
$first = Output::digest($repeated->first);
$second = Output::digest($repeated->second);
$recovered = Output::digest($adapter->render($request));

echo json_encode([
    'language' => 'php',
    'type' => 'Adapter',
    'operations' => ['loadScenario', 'buildRequest', 'render', 'renderTwice'],
    'request' => Output::requestJson($request),
    'bytes' => $first['bytes'],
    'firstSha256' => $first['sha256'],
    'secondSha256' => $second['sha256'],
    'failureObserved' => $failureObserved,
    'requestUnchanged' => $beforeFailure === $afterFailure,
    'recoveredSha256' => $recovered['sha256'],
], $json) . PHP_EOL;
