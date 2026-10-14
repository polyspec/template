<?php

declare(strict_types=1);

namespace Polyspec\Template\Cli;

use Polyspec\Template\Ast;
use Polyspec\Template\AstProgram;
use Polyspec\Template\Engine;
use Polyspec\Template\Format\Analyzer;
use Polyspec\Template\Format\PackageAnalyzer;
use Polyspec\Template\Loader\FilesystemLoader;
use Polyspec\Template\TemplateError;
use Polyspec\Template\Value\BindError;
use Polyspec\Template\Value\Json;
use Polyspec\Template\Value\MapValue;

/**
 * This package as the runtime of the command line.
 */
final class PackageRuntime implements Runtime
{
    public function parseJson(string $source, string $name, array $options): string
    {
        return Ast::toJson(AstProgram::parse($source, $name, $options));
    }

    public function render(
        string $root,
        string $name,
        array $options,
        ?string $data,
        ?string $define,
        ?string $env,
    ): string {
        $engine = new Engine(new AstProgram(new FilesystemLoader($root), $options));
        $renderOptions = [];
        try {
            $assign = $data === null ? [] : Json::parse($data);
            if ($define !== null) {
                $renderOptions['define'] = self::plain(Json::parse($define));
            }
            if ($env !== null) {
                $renderOptions['env'] = self::plain(Json::parse($env));
            }
        } catch (BindError $error) {
            throw TemplateError::withoutPosition($error->errorCode, $name, $error->getMessage());
        }

        return $engine->render($name, $assign, $renderOptions);
    }

    public function analyzer(): Analyzer
    {
        return new PackageAnalyzer();
    }

    /**
     * Converts template values into plain PHP arrays for the render options.
     */
    private static function plain(mixed $value): mixed
    {
        if ($value instanceof MapValue) {
            $result = [];
            foreach ($value->entries() as $key => $item) {
                $result[$key] = self::plain($item);
            }

            return $result;
        }
        if (is_array($value)) {
            return array_map(self::plain(...), $value);
        }

        return $value;
    }
}
