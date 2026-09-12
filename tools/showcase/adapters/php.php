#!/usr/bin/env php
<?php

declare(strict_types=1);

use Polyspec\Template\Engine;
use Polyspec\Template\Loader\ArrayLoader;
use Polyspec\Template\Value\Json;
use Polyspec\Template\Value\MapValue;

$root = dirname(__DIR__, 3);
require $root . '/packages/template-php/vendor/autoload.php';
require __DIR__ . '/generated/render_adapter.php';
require __DIR__ . '/generated/native_templates.php';

function readJson(string $root, string $name): mixed
{
    $bytes = file_get_contents($root . '/' . $name);
    if ($bytes === false) {
        throw new RuntimeException($name . ' cannot be read');
    }

    return Json::parse($bytes);
}

function objectValue(mixed $value, string $name): MapValue
{
    if (!$value instanceof MapValue) {
        throw new RuntimeException($name . ' must be an object');
    }

    return $value;
}

function stringField(MapValue $object, string $name): string
{
    $value = $object->get($name);
    if (!is_string($value)) {
        throw new RuntimeException($name . ' must be a string');
    }

    return $value;
}

function numberField(MapValue $object, string $name): float
{
    $value = $object->get($name);
    if (!is_int($value) && !is_float($value)) {
        throw new RuntimeException($name . ' must be a number');
    }

    return (float) $value;
}

function defineValue(mixed $value): MapValue
{
    $object = objectValue($value, 'define.json');
    $define = new MapValue();
    foreach ($object->entries() as $id => $raw) {
        if (is_string($raw)) {
            $define->set($id, new DefineEntry($raw, null, null));
            continue;
        }
        $entry = objectValue($raw, 'define.' . $id);
        foreach ($entry->keys() as $key) {
            if (!in_array($key, ['template', 'data', 'html'], true)) {
                throw new RuntimeException('define.' . $id . ' has an unknown field');
            }
        }
        $template = $entry->get('template');
        $html = $entry->get('html');
        $data = $entry->get('data');
        $hasTemplate = is_string($template);
        $hasHtml = is_string($html);
        if ($hasTemplate === $hasHtml) {
            throw new RuntimeException('define.' . $id . ' needs one variant');
        }
        if ($data !== null && !$data instanceof MapValue) {
            throw new RuntimeException('define.' . $id . '.data must be an object');
        }
        if ($hasHtml && $data !== null) {
            throw new RuntimeException('define.' . $id . '.html cannot have data');
        }
        $define->set($id, new DefineEntry(
            $hasTemplate ? $template : null,
            $data,
            $hasHtml ? $html : null,
        ));
    }

    return $define;
}

function environmentValue(mixed $value): Environment
{
    $object = objectValue($value, 'env.json');
    foreach ($object->keys() as $key) {
        if ($key !== 'timezone' && $key !== 'now') throw new RuntimeException('env.json has an unknown field: ' . $key);
    }
    $timezone = $object->has('timezone') ? stringField($object, 'timezone') : null;
    $now = $object->has('now') ? numberField($object, 'now') : null;

    return new Environment($timezone, $now);
}

final class Adapter implements RenderAdapter
{
    private Engine $engine;

    public function __construct(private readonly string $root)
    {
        $metadata = objectValue(readJson($root, 'scenario.json'), 'scenario.json');
        $legacyWrappers = false;
        if ($metadata->has('legacyWrappers')) {
            $value = $metadata->get('legacyWrappers');
            if (!is_bool($value)) throw new RuntimeException('scenario.legacyWrappers must be a boolean');
            $legacyWrappers = $value;
        }
        $loader = getenv('SHOWCASE_EXECUTION_MODE') === 'generated' ? generatedArtifactLoader($root) : artifactLoader($root, 'php');
        $this->engine = new Engine($loader, ['legacy_wrappers' => $legacyWrappers]);
    }

    public function loadScenario(): Scenario
    {
        $metadata = objectValue(readJson($this->root, 'scenario.json'), 'scenario.json');
        $scenario = new Scenario(
            stringField($metadata, 'target'),
            objectValue(readJson($this->root, 'data.json'), 'data.json'),
            defineValue(readJson($this->root, 'define.json')),
            null,
        );
        if (is_file($this->root . '/env.json')) {
            $scenario = new Scenario($scenario->target, $scenario->assign, $scenario->define, environmentValue(readJson($this->root, 'env.json')));
        }

        return $scenario;
    }

    public function buildRequest(Scenario $scenario): RenderRequest
    {
        return new RenderRequest($scenario->target, $scenario->assign, $scenario->define, $scenario->env);
    }

    public function render(RenderRequest $request): string
    {
        $define = [];
        foreach ($request->define->entries() as $id => $entry) {
            if (!$entry instanceof DefineEntry) {
                throw new RuntimeException('define.' . $id . ' has an invalid entry');
            }
            if ($entry->template !== null) {
                $define[$id] = ['template' => $entry->template];
                if ($entry->data !== null) $define[$id]['data'] = $entry->data;
            } else {
                $define[$id] = ['html' => $entry->html];
            }
        }
        $options = ['define' => $define];
        if ($request->env !== null) {
            $options['env'] = [];
            if ($request->env->timezone !== null) $options['env']['timezone'] = $request->env->timezone;
            if ($request->env->now !== null) $options['env']['now'] = $request->env->now;
        }

        return $this->engine->render($request->target, $request->assign, $options);
    }

    public function renderTwice(RenderRequest $request): RepeatResult
    {
        return new RepeatResult($this->render($request), $this->render($request));
    }
}

function artifactLoader(string $root, string $language): ArrayLoader
{
    $base = $root . '/compiled/' . $language;
    $manifest = json_decode((string) file_get_contents($base . '/manifest.json'), true, 512, JSON_THROW_ON_ERROR);
    $templates = [];
    foreach ($manifest['templates'] as $name => $entry) {
        $templates[$name] = json_decode((string) file_get_contents($base . '/' . $entry['artifact']), true, 512, JSON_THROW_ON_ERROR);
    }
    return new ArrayLoader($templates);
}

function plain(mixed $value): mixed
{
    if ($value instanceof MapValue) {
        $result = [];
        foreach ($value->entries() as $key => $item) $result[$key] = plain($item);

        return $result;
    }
    if (is_array($value)) return array_map('plain', $value);

    return $value;
}

function requestJson(RenderRequest $request): array
{
    $define = [];
    foreach ($request->define->entries() as $id => $entry) {
        if (!$entry instanceof DefineEntry) throw new RuntimeException('invalid define entry');
        if ($entry->template !== null) {
            $define[$id] = $entry->data === null ? $entry->template : ['template' => $entry->template];
            if ($entry->data !== null) $define[$id]['data'] = plain($entry->data);
        } else {
            $define[$id] = ['html' => $entry->html];
        }
    }
    $result = [
        'target' => $request->target,
        'assign' => plain($request->assign),
        'define' => $define,
    ];
    if ($request->env !== null) {
        $result['env'] = [];
        if ($request->env->timezone !== null) $result['env']['timezone'] = $request->env->timezone;
        if ($request->env->now !== null) $result['env']['now'] = $request->env->now;
    }

    return $result;
}

function digest(string $value): array
{
    return ['bytes' => strlen($value), 'sha256' => hash('sha256', $value)];
}

if (PHP_SAPI === 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    if (($argv[1] ?? null) === null) {
        throw new RuntimeException('usage: php php.php SCENARIO_DIR');
    }
    $adapter = new Adapter($argv[1]);
    $request = $adapter->buildRequest($adapter->loadScenario());
    $repeated = $adapter->renderTwice($request);
    $invalid = new RenderRequest('__contract_missing_target__', $request->assign, $request->define, $request->env);
    $beforeFailure = json_encode(requestJson($request), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $failureObserved = false;
    try {
        $adapter->render($invalid);
    } catch (Throwable) {
        $failureObserved = true;
    }
    $afterFailure = json_encode(requestJson($request), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $first = digest($repeated->first);
    $second = digest($repeated->second);
    $recovered = digest($adapter->render($request));

    echo json_encode([
        'language' => 'php',
        'type' => 'Adapter',
        'operations' => ['loadScenario', 'buildRequest', 'render', 'renderTwice'],
        'request' => requestJson($request),
        'bytes' => $first['bytes'],
        'firstSha256' => $first['sha256'],
        'secondSha256' => $second['sha256'],
        'failureObserved' => $failureObserved,
        'requestUnchanged' => $beforeFailure === $afterFailure,
        'recoveredSha256' => $recovered['sha256'],
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL;
}
