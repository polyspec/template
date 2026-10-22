<?php

declare(strict_types=1);

namespace Polyspec\Template;

use Polyspec\Template\Loader\ArrayLoader;
use Polyspec\Template\Loader\ArtifactLoader;
use Polyspec\Template\Loader\ArtifactStaleException;
use Polyspec\Template\Loader\LoaderInterface;
use Polyspec\Template\Loader\Path;
use Polyspec\Template\Parser\Parser;
use Polyspec\Template\Parser\Scanner;
use Polyspec\Template\Render\Frame;
use Polyspec\Template\Render\RuntimeEnvironment;
use Polyspec\Template\Render\RuntimeServices;
use Polyspec\Template\Value\Bind;
use Polyspec\Template\Value\BindError;
use Polyspec\Template\Value\MapValue;

/**
 * AstProgram: template loading, caching, function registration and rendering.
 *
 * @phpstan-import-type RenderOptions from Program
 * @phpstan-import-type Analysis from Parser
 * @phpstan-import-type Limits from RuntimeServices
 */
final class AstProgram implements Program, RuntimeServices
{
    public readonly LoaderInterface $loader;
    public readonly RuntimeEnvironment $runtime;
    /** @var array{0: string, 1: string} */
    public readonly array $delimiters;
    /** @var 'dev'|'true'|'false' */
    public readonly string $artifactRefresh;
    /** @var array<string, array{version: string, template: array{ast: array<string, mixed>, lines: list<int>|null}}> */
    private array $cache = [];

    /**
     * @param array{
     *     functions?: array<string, callable>,
     *     limits?: array<string, int>,
     *     delimiters?: string,
     *     artifact_refresh?: 'dev'|'true'|'false',
     * } $options
     */
    public function __construct(?LoaderInterface $loader = null, array $options = [])
    {
        $this->loader = $loader ?? new ArrayLoader();
        $limits = $options['limits'] ?? [];
        $functions = $options['functions'] ?? [];
        // RT-5, RT-6: a limits or a functions that is not a map fails the creation of the program.
        if (!self::isMap($limits)) {
            throw new \InvalidArgumentException('limits is not an object');
        }
        if (!self::isMap($functions)) {
            throw new \InvalidArgumentException('functions is not an object');
        }
        $this->runtime = new RuntimeEnvironment($limits, $functions);
        if (isset($options['delimiters'])) {
            $delimiters = Scanner::parseDelimiters($options['delimiters']);
            if ($delimiters === null) {
                throw new \InvalidArgumentException(json_encode($options['delimiters']) . ' is not a delimiter pair');
            }
            $this->delimiters = $delimiters;
        } else {
            $this->delimiters = ['{', '}'];
        }
        $this->artifactRefresh = (string) ($options['artifact_refresh'] ?? 'true');
        if (!in_array($this->artifactRefresh, ['dev', 'true', 'false'], true)) {
            throw new \InvalidArgumentException($this->artifactRefresh . ' is not an artifact refresh policy');
        }
    }

    /**
     * Decodes the canonical JSON text of a template AST (AST-7) into the AST arrays that parse returns, so a program
     * renders it without parsing a source (RT-41). The JSON is validated against contracts/schema/ast.schema.json
     * (AST-10).
     *
     * @return array<string, mixed>
     * @throws \JsonException when the text is not JSON
     * @throws AstDecodeError naming the JSON Pointer of the invalid node when the JSON is not a template AST
     */
    public static function decodeTemplate(string $json): array
    {
        return AstDecoder::decode($json);
    }

    /**
     * Loads the AST artifact that the build compiler wrote in `$directory` and returns the program that renders it
     * (RT-56).
     *
     * @throws \RuntimeException when the artifact is missing, not an AST artifact, or a file does not match its digest
     */
    public static function loadArtifact(string $directory): AstProgram
    {
        return new self(ArtifactLoader::fromDirectory($directory));
    }

    /**
     * ArtifactStore.loadOrRefresh (docs/spec/runtime.md): returns the program of the artifact in `$directory`, building
     * it first when the policy asks. `$build` writes the AST artifact of the sources; the build compiler is passed in
     * by the host. "dev" builds on every call, "true" reuses an artifact that loads and rebuilds only a missing or
     * stale one (ArtifactStaleException), letting every other exception through, and "false" loads the artifact that
     * exists and never builds.
     *
     * @param callable(string): void $build
     * @throws \InvalidArgumentException when `$refresh` is not a refresh policy
     * @throws \RuntimeException when the artifact cannot be loaded
     */
    public static function loadOrRefresh(string $directory, string $refresh, callable $build): AstProgram
    {
        if ($refresh === 'false') {
            return self::loadArtifact($directory);
        }
        if ($refresh === 'dev') {
            $build($directory);
            return self::loadArtifact($directory);
        }
        if ($refresh !== 'true') {
            throw new \InvalidArgumentException($refresh . ' is not an artifact refresh policy');
        }
        try {
            return self::loadArtifact($directory);
        } catch (ArtifactStaleException) {
            $build($directory);
            return self::loadArtifact($directory);
        }
    }

    /**
     * Runs a parser entry of Parser on one template source with the delimiters of the options.
     *
     * @param callable(Source, string, string): array<string, mixed> $parse
     * @param array{delimiters?: string} $options
     * @return array<string, mixed>
     */
    private static function parsedWith(callable $parse, string $source, string $name, array $options): array
    {
        $delimiters = self::delimitersOf($options);

        return InternalBoundary::run(
            $name,
            static fn (): array => $parse(Source::fromBytes($name, $source), $delimiters[0], $delimiters[1]),
        );
    }

    /**
     * RT-2: parses one template source without loading other templates.
     *
     * @param array{delimiters?: string} $options
     * @return array<string, mixed>
     */
    public static function parse(string $source, string $name, array $options = []): array
    {
        return self::parsedWith(Parser::parse(...), $source, $name, $options);
    }

    /**
     * Parses one template source once and returns its AST with the accepted tags and the EDT-8 tokens of their
     * parts. Offsets are UTF-8 byte offsets after a leading byte order mark (LEX-2, EDT-8).
     *
     * @param array{delimiters?: string} $options
     * @return Analysis
     */
    public static function analyze(string $source, string $name, array $options = []): array
    {
        return self::parsedWith(Parser::analyze(...), $source, $name, $options);
    }

    /**
     * @param array{delimiters?: string} $options
     * @return array{0: string, 1: string}
     */
    private static function delimitersOf(array $options): array
    {
        if (!isset($options['delimiters'])) {
            return ['{', '}'];
        }
        $delimiters = Scanner::parseDelimiters($options['delimiters']);
        if ($delimiters === null) {
            throw new \InvalidArgumentException(json_encode($options['delimiters']) . ' is not a delimiter pair');
        }

        return $delimiters;
    }

    /**
     * FUN-43, FUN-44.
     */
    public function register(string $name, callable $fn): void
    {
        $this->runtime->register($name, $fn);
    }

    /** Registers one logical class function used by `Class::method(...)`. */
    public function registerClass(string $className, string $method, callable $fn): void
    {
        $this->runtime->registerClass($className, $method, $fn);
    }

    /**
     * Returns the function registered under a name, or null when no host registered it.
     */
    public function hostFunction(string $name): ?callable
    {
        return $this->runtime->hostFunction($name);
    }

    /** Returns one logical class function that the runtime of this program holds. */
    public function classFunction(string $className, string $method): ?callable
    {
        return $this->runtime->classFunction($className, $method);
    }

    /**
     * The limits of a render of this program (RT-33).
     *
     * @return Limits
     */
    public function limits(): array
    {
        return $this->runtime->limits();
    }

    /**
     * RT-9, RT-40: loads a template by name and caches it by version.
     *
     * @param array{0: int, 1: int}|null $span
     * @return array{ast: array<string, mixed>, lines: list<int>|null}
     */
    public function loadTemplate(string $name, ?Frame $from, ?array $span): array
    {
        $fail = static fn (string $code, string $message): TemplateError => $from !== null && $span !== null
            ? TemplateError::at($code, $from->name, $from->lines, $span[0], $span[1], $message)
            : TemplateError::withoutPosition($code, $name, $message);
        try {
            $loaded = $this->loader->load($name);
        } catch (\Throwable $error) {
            // RT-9: every exception of the loader is a load failure of the requested name.
            throw $fail(ErrorCode::E_LOAD_FAILED, "template {$name} cannot be loaded: " . $error->getMessage());
        }
        if ($loaded === null) {
            throw $fail(ErrorCode::E_LOAD_NOT_FOUND, "template {$name} does not exist");
        }
        // RT-9: a result holds a source text or an AST, and a non-empty version; an empty source is an empty template.
        $ast = $loaded['ast'] ?? null;
        $text = $loaded['source'] ?? null;
        if ($ast === null && !is_string($text)) {
            throw $fail(
                ErrorCode::E_LOAD_FAILED,
                "template {$name} cannot be loaded: the loader returned no source text and no AST",
            );
        }
        if (!is_string($loaded['version'] ?? null) || $loaded['version'] === '') {
            throw $fail(ErrorCode::E_LOAD_FAILED, "template {$name} cannot be loaded: the loader returned no version");
        }
        $cached = $this->cache[$name] ?? null;
        $fresh = $this->artifactRefresh === 'false'
            || ($this->artifactRefresh === 'true' && $cached !== null && $cached['version'] === $loaded['version']);
        if ($cached !== null && $fresh) {
            return $cached['template'];
        }
        if ($ast !== null) {
            $template = ['ast' => $ast, 'lines' => null];
        } else {
            $source = Source::fromBytes($name, $text);
            $template = [
                'ast' => Parser::parse($source, $this->delimiters[0], $this->delimiters[1]),
                'lines' => $source->lines,
            ];
        }
        $this->cache[$name] = ['version' => $loaded['version'], 'template' => $template];

        return $template;
    }

    /**
     * Prepares a template name or a parsed template: binds the assign, the definitions and the environment once, for
     * any number of renders (RT-61).
     *
     * @param string|array<string, mixed> $target
     * @param RenderOptions $options
     */
    public function prepare(string|array $target, mixed $assign = [], array $options = []): PreparedRender
    {
        $name = is_string($target) ? $target : (string) $target['name'];

        return InternalBoundary::run(
            $name,
            fn (): PreparedRender => $this->prepareBound($name, $target, $assign, $options),
        );
    }

    /**
     * @param string|array<string, mixed> $target
     * @param RenderOptions $options
     */
    private function prepareBound(string $name, string|array $target, mixed $assign, array $options): PreparedRender
    {
        try {
            $rootData = Bind::map($assign);
            // RT-4: a define or an env that is not a map fails with E_DATA_UNSUPPORTED_TYPE.
            $define = $options['define'] ?? [];
            if (!self::isMap($define)) {
                throw new BindError(ErrorCode::E_DATA_UNSUPPORTED_TYPE, 'define is not an object');
            }
            $registry = $this->bindDefines($define);
            $envOption = $options['env'] ?? [];
            if (!self::isMap($envOption)) {
                throw new BindError(ErrorCode::E_DATA_UNSUPPORTED_TYPE, 'env is not an object');
            }
            $env = $this->bindEnv($envOption);
        } catch (BindError $error) {
            throw TemplateError::withoutPosition($error->errorCode, $name, $error->getMessage());
        }
        $targetEntry = is_string($target) ? ($registry[$target] ?? null) : null;
        $targetName = is_array($targetEntry) && isset($targetEntry['template']) ? $targetEntry['template'] : $name;
        $template = is_string($target) ? $this->loadTemplate(
            $targetName,
            null,
            null,
        ) : ['ast' => $target, 'lines' => null];

        return new PreparedRender(
            $name,
            new AstPreparedExecution($this, $rootData, $registry, $env, $targetName, $template),
        );
    }

    /**
     * Renders a template name or a parsed template.
     *
     * @param string|array<string, mixed> $target
     * @param RenderOptions $options
     */
    public function render(string|array $target, mixed $assign = [], array $options = []): string
    {
        return $this->prepare($target, $assign, $options)->render();
    }

    /** A PHP map is an array that is empty or not a list (RT-4, RT-5, RT-6). */
    private static function isMap(mixed $value): bool
    {
        return is_array($value) && ($value === [] || !array_is_list($value));
    }

    /**
     * @param array<string, string|array{template?: string, data?: mixed, html?: string}> $defines
     * @return array<string, array{template: string, data: MapValue|null}|array{html: string}>
     */
    private function bindDefines(array $defines): array
    {
        $registry = [];
        foreach ($defines as $id => $input) {
            $id = (string) $id;
            if (!Utf8::isValid($id)) {
                throw new BindError(ErrorCode::E_DATA_INVALID_UTF8, 'a define id is not valid UTF-8');
            }
            if (is_array($input) && isset($input['html']) && is_string($input['html'])) {
                $registry[$id] = ['html' => $input['html']];
            } elseif (
                is_string($input)
                || (is_array($input) && isset($input['template']) && is_string($input['template']))
            ) {
                $template = is_string($input) ? $input : $input['template'];
                $name = Path::resolve('', $template);
                if ($name === null) {
                    throw new BindError(
                        ErrorCode::E_DATA_UNSUPPORTED_TYPE,
                        "define {$id}: template path leaves the loader root",
                    );
                }
                $data = null;
                if (is_array($input) && array_key_exists('data', $input)) {
                    $data = Bind::data($input['data']);
                    if (!$data instanceof MapValue) {
                        throw new BindError(ErrorCode::E_DATA_UNSUPPORTED_TYPE, "define {$id}: data is not a map");
                    }
                }
                $registry[$id] = ['template' => $name, 'data' => $data];
            } else {
                throw new BindError(
                    ErrorCode::E_DATA_UNSUPPORTED_TYPE,
                    "define {$id}: entry needs \"template\" or \"html\"",
                );
            }
        }

        return $registry;
    }

    /**
     * @param array{timezone?: mixed, now?: mixed} $env
     * @return array{timezone: string, now: float}
     */
    private function bindEnv(array $env): array
    {
        $timezone = $env['timezone'] ?? 'Z';
        $now = $env['now'] ?? (float) time();
        if (!is_string($timezone)) {
            throw new BindError(ErrorCode::E_DATA_UNSUPPORTED_TYPE, 'env.timezone is not a string');
        }
        if (!is_int($now) && !is_float($now)) {
            throw new BindError(ErrorCode::E_DATA_UNSUPPORTED_TYPE, 'env.now is not a number');
        }

        return ['timezone' => $timezone, 'now' => (float) $now];
    }
}
