<?php

declare(strict_types=1);

namespace Polyspec\Template;

use Polyspec\Template\Loader\ArrayLoader;
use Polyspec\Template\Loader\LoaderInterface;
use Polyspec\Template\Loader\Path;
use Polyspec\Template\Parser\Parser;
use Polyspec\Template\Parser\Scanner;
use Polyspec\Template\Render\Context;
use Polyspec\Template\Render\Frame;
use Polyspec\Template\Render\Renderer;
use Polyspec\Template\Render\RuntimeEnvironment;
use Polyspec\Template\Render\RuntimeServices;
use Polyspec\Template\Render\Scope;
use Polyspec\Template\Value\Bind;
use Polyspec\Template\Value\BindError;
use Polyspec\Template\Value\MapValue;

/** Prepared AST interpreter execution. */
final class AstPreparedExecution implements PreparedExecution
{
    /** Creates an AST execution from normalized request state. */
    public function __construct(
        private readonly AstProgram $engine,
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
        (new Renderer($context, $this->engine))->renderNodes($this->template['ast']['body'], new Frame($this->template['ast']['name'], $this->template['lines'], $this->rootData), new Scope());

        return $context->output();
    }
}

/** AstProgram: template loading, caching, function registration and rendering. */
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
     * @param array{functions?: array<string, callable>, limits?: array<string, int>, delimiters?: string, artifact_refresh?: 'dev'|'true'|'false'} $options
     */
    public function __construct(?LoaderInterface $loader = null, array $options = [])
    {
        $this->loader = $loader ?? new ArrayLoader();
        $this->runtime = new RuntimeEnvironment($options['limits'] ?? [], $options['functions'] ?? []);
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
        $this->runtime->register($name, $fn);
    }

    /**
     * Returns the function registered under a name, or null when no host registered it.
     */
    public function hostFunction(string $name): ?callable
    {
        return $this->runtime->hostFunction($name);
    }

    /** @return array{iterations: int, depth: int, outputBytes: int, expressionDepth: int} */
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
