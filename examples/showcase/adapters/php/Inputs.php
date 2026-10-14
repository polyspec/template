<?php

declare(strict_types=1);

namespace Polyspec\Showcase\Adapter\Php;

use Composer\Autoload\ClassLoader;
use Polyspec\Showcase\Adapter\DefineEntry;
use Polyspec\Showcase\Adapter\Environment;
use Polyspec\Template\Loader\ArrayLoader;
use Polyspec\Template\Program;
use Polyspec\Template\Value\Json;
use Polyspec\Template\Value\MapValue;
use RuntimeException;

/**
 * The inputs of a showcase scenario: its JSON files, its template definitions and environment, the AST artifacts of
 * the AST mode and the generated program of the generated mode.
 */
final class Inputs
{
    private const SCENARIOS = ['compiler-coverage', 'empty-state', 'html-slot', 'react-boundary', 'scope-precedence'];

    /**
     * The generated program of the scenario. The rules of examples/showcase/php-namespace.mts: compiler-coverage
     * becomes the namespace CompilerCoverage, whose classes are the PSR-4 files of generated/php/compiler-coverage,
     * which the autoload of Composer loads.
     */
    public static function generatedProgram(string $scenarioRoot): Program
    {
        $scenario = basename($scenarioRoot);
        if (!in_array($scenario, self::SCENARIOS, true)) {
            throw new RuntimeException('generated program is missing for scenario ' . $scenario);
        }
        $words = ucwords(str_replace('-', ' ', $scenario));
        $namespace = 'Polyspec\\Showcase\\Generated\\' . str_replace(' ', '', $words);
        self::classLoader()->addPsr4($namespace . '\\', dirname(__DIR__) . '/generated/php/' . $scenario);
        $class = $namespace . '\\GeneratedProgram';
        $program = new $class();
        if (!$program instanceof Program) {
            throw new RuntimeException($class . ' is no Program');
        }

        return $program;
    }

    /** The class loader of the PHP package, which vendor/autoload.php returns once it is loaded. */
    private static function classLoader(): ClassLoader
    {
        $loader = require dirname(__DIR__, 4) . '/packages/php/vendor/autoload.php';
        if (!$loader instanceof ClassLoader) {
            throw new RuntimeException('packages/php/vendor/autoload.php returned no class loader');
        }

        return $loader;
    }

    /** The AST artifacts of the scenario, read from compiled/ast by its manifest. */
    public static function artifactLoader(string $root): ArrayLoader
    {
        $base = $root . '/compiled/ast';
        $manifest = json_decode(self::read($base . '/manifest.json'), true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($manifest) || !is_array($manifest['files'] ?? null)) {
            throw new RuntimeException($base . '/manifest.json has no files');
        }
        $templates = [];
        foreach ($manifest['files'] as $name => $entry) {
            if (!is_array($entry) || !is_string($entry['path'] ?? null)) {
                throw new RuntimeException($base . '/manifest.json names no path of ' . $name);
            }
            $templates[$name] = json_decode(self::read($base . '/' . $entry['path']), true, 512, JSON_THROW_ON_ERROR);
        }

        return new ArrayLoader($templates);
    }

    public static function readJson(string $root, string $name): mixed
    {
        return Json::parse(self::read($root . '/' . $name));
    }

    private static function read(string $path): string
    {
        $bytes = file_get_contents($path);
        if ($bytes === false) {
            throw new RuntimeException($path . ' cannot be read');
        }

        return $bytes;
    }

    public static function objectValue(mixed $value, string $name): MapValue
    {
        if (!$value instanceof MapValue) {
            throw new RuntimeException($name . ' must be an object');
        }

        return $value;
    }

    public static function stringField(MapValue $object, string $name): string
    {
        $value = $object->get($name);
        if (!is_string($value)) {
            throw new RuntimeException($name . ' must be a string');
        }

        return $value;
    }

    public static function numberField(MapValue $object, string $name): float
    {
        $value = $object->get($name);
        if (!is_int($value) && !is_float($value)) {
            throw new RuntimeException($name . ' must be a number');
        }

        return (float) $value;
    }

    public static function defineValue(mixed $value): MapValue
    {
        $object = self::objectValue($value, 'define.json');
        $define = new MapValue();
        foreach ($object->entries() as $id => $raw) {
            if (is_string($raw)) {
                $define->set($id, new DefineEntry($raw, null, null));
                continue;
            }
            $entry = self::objectValue($raw, 'define.' . $id);
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

    public static function environmentValue(mixed $value): Environment
    {
        $object = self::objectValue($value, 'env.json');
        foreach ($object->keys() as $key) {
            if ($key !== 'timezone' && $key !== 'now') {
                throw new RuntimeException('env.json has an unknown field: ' . $key);
            }
        }
        $timezone = $object->has('timezone') ? self::stringField($object, 'timezone') : null;
        $now = $object->has('now') ? self::numberField($object, 'now') : null;

        return new Environment($timezone, $now);
    }
}
