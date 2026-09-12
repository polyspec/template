<?php

declare(strict_types=1);

namespace Polyspec\Template;

use Polyspec\Template\Functions\Registry;
use Polyspec\Template\Loader\ArrayLoader;
use Polyspec\Template\Loader\LoaderInterface;
use Polyspec\Template\Loader\Path;
use Polyspec\Template\Parser\Parser;
use Polyspec\Template\Parser\Scanner;
use Polyspec\Template\Render\Context;
use Polyspec\Template\Render\Frame;
use Polyspec\Template\Render\Renderer;
use Polyspec\Template\Value\Bind;
use Polyspec\Template\Value\BindError;
use Polyspec\Template\Value\MapValue;

/** Prepared request produced by generated host-language code. */
final class GeneratedPreparedRender
{
    /** Creates a generated prepared request. */
    public function __construct(private readonly \Closure $renderer)
    {
    }

    /** Renders the prepared generated request. */
    public function render(): string
    {
        return ($this->renderer)();
    }
}

/** Normalized request shared by AST and generated renderers. */
final class GeneratedRequest
{
    /** Creates the normalized input passed to a generated renderer. */
    public function __construct(
        public readonly string $targetName,
        public readonly MapValue $rootData,
        /** @var array<string, array{template: string, data: MapValue|null}|array{html: string}> */
        public readonly array $registry,
        /** @var array{timezone: string, now: float} */
        public readonly array $env,
    ) {
    }
}

/** One executable state held by a prepared render. */
interface PreparedExecution
{
    /** Renders this prepared execution. */
    public function render(): string;
}

/** Prepared generated-code execution. */
final class GeneratedPreparedExecution implements PreparedExecution
{
    /** Creates a generated execution. */
    public function __construct(private readonly GeneratedPreparedRender $generated)
    {
    }

    /** Renders generated host-language code. */
    public function render(): string
    {
        return $this->generated->render();
    }
}

/** Prepared AST interpreter execution. */
final class AstPreparedExecution implements PreparedExecution
{
    /** Creates an AST execution from normalized request state. */
    public function __construct(
        private readonly Engine $engine,
        private readonly MapValue $rootData,
        /** @var array<string, array{template: string, data: MapValue|null}|array{html: string}> */
        private readonly array $registry,
        /** @var array{timezone: string, now: float} */
        private readonly array $env,
        private readonly string $targetName,
        /** @var array{ast: array<string, mixed>, lines: list<int>|null} */
        private readonly array $template,
    ) {
    }

    /** Interprets the prepared AST with fresh execution state. */
    public function render(): string
    {
        $context = new Context($this->engine, $this->rootData, $this->env, $this->targetName);
        $context->registry = $this->registry;
        $context->enter($this->targetName, null, null);
        (new Renderer($context))->renderNodes($this->template['ast']['body'], new Frame($this->template, $this->rootData));

        return $context->output();
    }
}

/** A request prepared as exactly one AST or generated execution. */
final class PreparedRender
{
    /** Creates a prepared request from one explicit execution variant. */
    public function __construct(private readonly PreparedExecution $execution)
    {
    }

    /** Renders the prepared request. */
    public function render(): string
    {
        return $this->execution->render();
    }
}

/** Engine: template loading, caching, function registration and rendering. */
final class Engine
{
    public const DEFAULT_LIMITS = [
        'iterations' => 1000000,
        'depth' => 32,
        'outputBytes' => 16 * 1024 * 1024,
        'expressionDepth' => 64,
    ];

    public readonly LoaderInterface $loader;
    /** @var array{iterations: int, depth: int, outputBytes: int, expressionDepth: int} */
    public readonly array $limits;
    /** @var array{0: string, 1: string} */
    public readonly array $delimiters;
    /** @var 'dev'|'true'|'false' */
    public readonly string $artifactRefresh;
    /** @var 'ast'|'gen' */
    public readonly string $compileMode;
    /** @var callable|null */
    private $generatedRenderer;
    /** @var array<string, callable> */
    private array $functions = [];
    /** @var array<string, array{version: string, template: array{ast: array<string, mixed>, lines: list<int>|null}}> */
    private array $cache = [];

    /**
     * @param array{functions?: array<string, callable>, limits?: array<string, int>, delimiters?: string, artifact_refresh?: 'dev'|'true'|'false', compile?: array{mode?: 'ast'|'gen', generated_renderer?: callable}} $options
     */
    public function __construct(?LoaderInterface $loader = null, array $options = [])
    {
        $this->loader = $loader ?? new ArrayLoader();
        $this->limits = array_merge(self::DEFAULT_LIMITS, $options['limits'] ?? []);
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
        $compile = $options['compile'] ?? [];
        $this->compileMode = (string) ($compile['mode'] ?? 'ast');
        if (!in_array($this->compileMode, ['ast', 'gen'], true)) {
            throw new \InvalidArgumentException($this->compileMode . ' is not a compile mode');
        }
        $this->generatedRenderer = $compile['generated_renderer'] ?? null;
        foreach ($options['functions'] ?? [] as $name => $fn) {
            $this->register((string) $name, $fn);
        }
    }

    /**
     * RT-2: parses one template source without loading other templates.
     *
     * @param array{delimiters?: string} $options
     * @return array<string, mixed>
     */
    public static function parse(string $source, string $name, array $options = []): array
    {
        $delimiters = ['{', '}'];
        if (isset($options['delimiters'])) {
            $delimiters = Scanner::parseDelimiters($options['delimiters']);
            if ($delimiters === null) {
                throw new \InvalidArgumentException(json_encode($options['delimiters']) . ' is not a delimiter pair');
            }
        }

        return Parser::parse(Source::fromBytes($name, $source), $delimiters[0], $delimiters[1]);
    }

    /**
     * FUN-43, FUN-44.
     */
    public function register(string $name, callable $fn): void
    {
        if (preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $name) !== 1) {
            throw new \InvalidArgumentException(json_encode($name) . ' is not an identifier');
        }
        if (Registry::isBuiltin($name)) {
            throw new \InvalidArgumentException("{$name} is a built-in function");
        }
        $this->functions[$name] = $fn;
    }

    /**
     * Returns the function registered under a name, or null when no host registered it.
     */
    public function hostFunction(string $name): ?callable
    {
        return $this->functions[$name] ?? null;
    }

    /**
     * RT-9, RT-40: loads a template by name and caches it by version.
     *
     * @param array{0: int, 1: int}|null $span
     * @return array{ast: array<string, mixed>, lines: list<int>|null}
     */
    public function loadTemplate(string $name, ?Frame $from, ?array $span): array
    {
        $loaded = $this->loader->load($name);
        if ($loaded === null) {
            $message = "template {$name} does not exist";
            if ($from !== null && $span !== null) {
                throw TemplateError::at('E_LOAD_NOT_FOUND', $from->name, $from->lines, $span[0], $span[1], $message);
            }

            throw TemplateError::withoutPosition('E_LOAD_NOT_FOUND', $name, $message);
        }
        $cached = $this->cache[$name] ?? null;
        if ($cached !== null && ($this->artifactRefresh === 'false' || ($this->artifactRefresh === 'true' && $cached['version'] === $loaded['version']))) {
            return $cached['template'];
        }
        if (isset($loaded['ast'])) {
            $template = ['ast' => $loaded['ast'], 'lines' => null];
        } else {
            $source = Source::fromBytes($name, $loaded['source'] ?? '');
            $template = ['ast' => Parser::parse($source, $this->delimiters[0], $this->delimiters[1]), 'lines' => $source->lines];
        }
        $this->cache[$name] = ['version' => $loaded['version'], 'template' => $template];

        return $template;
    }

    /**
     * Renders a template name or a parsed template.
     *
     * @param string|array<string, mixed> $target
     * @param array{define?: array<string, string|array{template?: string, data?: mixed, html?: string}>, env?: array{timezone?: string, now?: float|int}} $options
     */
    public function prepare(string|array $target, mixed $assign = [], array $options = []): PreparedRender
    {
        $name = is_string($target) ? $target : (string) $target['name'];
        try {
            $rootData = $assign === null ? new MapValue() : Bind::map($assign);
            $registry = $this->bindDefines($options['define'] ?? []);
            $env = $this->bindEnv($options['env'] ?? []);
        } catch (BindError $error) {
            throw TemplateError::withoutPosition($error->errorCode, $name, $error->getMessage());
        }
        $targetEntry = is_string($target) ? ($registry[$target] ?? null) : null;
        $targetName = is_array($targetEntry) && isset($targetEntry['template']) ? $targetEntry['template'] : $name;
        if ($this->compileMode === 'gen') {
            if ($this->generatedRenderer === null) {
                throw new \LogicException('generated compile mode requires generated_renderer');
            }
            $generated = ($this->generatedRenderer)(new GeneratedRequest($targetName, $rootData, $registry, $env));
            if (!$generated instanceof GeneratedPreparedRender) {
                throw new \LogicException('generated_renderer must return GeneratedPreparedRender');
            }
            return new PreparedRender(new GeneratedPreparedExecution($generated));
        }

        $template = is_string($target) ? $this->loadTemplate($targetName, null, null) : ['ast' => $target, 'lines' => null];

        return new PreparedRender(new AstPreparedExecution($this, $rootData, $registry, $env, $targetName, $template));
    }

    /**
     * Renders a template name or a parsed template.
     *
     * @param string|array<string, mixed> $target
     * @param array{define?: array<string, string|array{template?: string, data?: mixed, html?: string}>, env?: array{timezone?: string, now?: float|int}} $options
     */
    public function render(string|array $target, mixed $assign = [], array $options = []): string
    {
        return $this->prepare($target, $assign, $options)->render();
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
            if (is_array($input) && isset($input['html']) && is_string($input['html'])) {
                $registry[$id] = ['html' => $input['html']];
            } elseif (is_string($input) || (is_array($input) && isset($input['template']) && is_string($input['template']))) {
                $template = is_string($input) ? $input : $input['template'];
                $name = Path::resolve('', $template);
                if ($name === null) {
                    throw new BindError('E_DATA_UNSUPPORTED_TYPE', "define {$id}: template path leaves the loader root");
                }
                $data = null;
                if (is_array($input) && array_key_exists('data', $input)) {
                    $data = Bind::value($input['data']);
                    if ($data === []) {
                        $data = new MapValue();
                    }
                    if (!$data instanceof MapValue) {
                        throw new BindError('E_DATA_UNSUPPORTED_TYPE', "define {$id}: data is not a map");
                    }
                }
                $registry[$id] = ['template' => $name, 'data' => $data];
            } else {
                throw new BindError('E_DATA_UNSUPPORTED_TYPE', "define {$id}: entry needs \"template\" or \"html\"");
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
            throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'env.timezone is not a string');
        }
        if (!is_int($now) && !is_float($now)) {
            throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'env.now is not a number');
        }

        return ['timezone' => $timezone, 'now' => (float) $now];
    }
}
