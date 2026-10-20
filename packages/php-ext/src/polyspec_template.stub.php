<?php

/**
 * Signatures of the classes the polyspec_template extension registers.
 *
 * The file documents the extension for static analysis and is never loaded at runtime; gen_stub.php
 * generates polyspec_template_arginfo.h from it.
 *
 * @generate-class-entries
 * @generate-legacy-arginfo 80200
 */

namespace Polyspec\Template\Native;

/**
 * The template engine backed by the native implementation.
 */
final class Engine
{
    /**
     * The root is the loader root directory; without it no template name resolves. The option delimiters holds a
     * two-character string; the option limits holds an array with the integer keys iterations, depth, outputBytes and
     * expressionDepth.
     *
     * @param array $options
     * @phpstan-param array<string, mixed> $options
     */
    public function __construct(?string $root = null, array $options = []) {}

    /**
     * Parses one template source and returns the AST as nested arrays.
     *
     * @param array $options
     * @phpstan-param array{delimiters?: string} $options
     * @return array<string, mixed>
     */
    public static function parse(string $source, string $name, array $options = []): array {}

    /**
     * Parses one template source once and returns its AST, the accepted tags and the EDT-8 tokens of every part of a
     * tag. Offsets are UTF-8 byte offsets after a leading byte order mark.
     *
     * @param array $options
     * @phpstan-param array{delimiters?: string} $options
     * @return array{ast: array<string, mixed>, tags: list<array{start: int, end: int, echo: bool, kind: string, bodyStart: int, bodyEnd: int}>, tokens: list<array{start: int, end: int, kind: string}>}
     */
    public static function analyze(string $source, string $name, array $options = []): array {}

    /**
     * Parses one template source and returns the AST as JSON text.
     *
     * @param array $options
     * @phpstan-param array{delimiters?: string} $options
     */
    public static function parseToJson(string $source, string $name, array $options = []): string {}

    /**
     * Registers a host function fn(array $args, array $env): mixed.
     */
    public function register(string $name, callable $function): void {}

    /**
     * Registers the logical class function Class::method as fn(array $args, array $env): mixed.
     */
    public function registerClass(string $className, string $method, callable $function): void {}

    /**
     * Renders a template with assign data given as a PHP value or as a BoundMap, which is not bound
     * again (VAL-22).
     *
     * The option define maps a definition id to a template path or to an array with the keys template, data and html;
     * the option env holds an array with the keys timezone (a string) and now (a number).
     *
     * @param array $options
     * @phpstan-param array<string, mixed> $options
     */
    public function render(string $name, mixed $assign = [], array $options = []): string {}

    /**
     * Renders a template with assign data, template definitions and environment given as JSON text.
     */
    public function renderJson(string $name, string $assign, ?string $define = null, ?string $env = null): string {}
}

/**
 * A map that host binding checked once (VAL-22). PHP code cannot instantiate, clone or unserialize
 * the class; `bind` and `merge` create it.
 *
 * @not-serializable
 */
final class BoundMap
{
    /**
     * Applies host binding to a value and returns a bound map; null and `[]` give the empty bound map and a
     * bound map of the extension is returned unchanged. Errors have no template and no position
     * (ERR-14).
     */
    public static function bind(mixed $value): BoundMap {}

    /**
     * Returns a bound map with the entries of $first and $second: an entry of $second replaces the
     * entry of $first with the same key in its position (RT-26).
     */
    public static function merge(mixed $first, mixed $second): BoundMap {}
}

namespace Polyspec\Template\Loader;

/**
 * Template loader (RT-9, RT-10).
 */
interface LoaderInterface
{
    /**
     * Returns `['source' => bytes, 'version' => string]` or `['ast' => array, 'version' => string]`, or null when the
     * name does not exist. An exception reports a failure, which the engine reports as E_LOAD_FAILED (RT-9).
     *
     * @return array|null
     * @phpstan-return array{source?: string, ast?: array<string, mixed>, version: string}|null
     */
    public function load(string $name): ?array;
}

/**
 * In-memory loader keyed by template name.
 */
final class ArrayLoader implements LoaderInterface
{
    /** @var array<string, array{source?: string, ast?: array<string, mixed>, version: string}> */
    private array $entries = [];

    /**
     * @param array $sources template sources or parsed templates by name
     * @phpstan-param array<string, string|array<string, mixed>> $sources
     */
    public function __construct(array $sources = []) {}

    /**
     * @param string|array $value
     * @phpstan-param string|array<string, mixed> $value
     */
    public function set(string $name, string|array $value): void {}

    /**
     * Returns the template for a name, or null when the name does not exist.
     *
     * @return array|null
     * @phpstan-return array{source?: string, ast?: array<string, mixed>, version: string}|null
     */
    public function load(string $name): ?array {}
}

/**
 * Filesystem loader (RT-10): reads root/name and reports modification time and size as the version.
 */
final class FilesystemLoader implements LoaderInterface
{
    public readonly string $root;

    /**
     * The name of each file that the loader read, by device and inode number.
     *
     * @var array<string, string>
     */
    private array $files = [];

    /**
     * Creates a loader for a directory. Every template name resolves inside it.
     */
    public function __construct(string $root) {}

    /**
     * Returns the file of a name, or null when no regular file exists for the name. A symbolic link at any component
     * of the name, a regular file that cannot be read and a file that the loader read under another name are failures
     * (RT-10).
     *
     * @return array|null
     * @phpstan-return array{source: string, version: string}|null
     */
    public function load(string $name): ?array {}
}

namespace Polyspec\Template;

/**
 * Error object as defined in docs/spec/errors.md.
 */
final class TemplateError extends \RuntimeException
{
    public readonly string $errorCode;

    public readonly string $template;

    public readonly int $errorLine;

    public readonly int $errorCol;

    public readonly int $offset;

    public readonly int $end;

    /**
     * Creates an error from its fields. The names avoid the properties of the base exception.
     */
    public function __construct(
        string $errorCode,
        string $template,
        int $errorLine,
        int $errorCol,
        int $offset,
        int $end,
        string $message,
    ) {}

    /**
     * Creates an error located at a byte span of a template whose line index is known.
     *
     * @param array|null $lines
     * @phpstan-param list<int>|null $lines
     */
    public static function at(string $code, string $template, ?array $lines, int $start, int $end, string $message): TemplateError {}

    /**
     * Creates an error with no source position.
     */
    public static function withoutPosition(string $code, string $template, string $message): TemplateError {}

    /**
     * @return array
     * @phpstan-return array{code: string, template: string, line: int, col: int, offset: int, end: int, message: string}
     */
    public function toArray(): array {}
}

/**
 * A complete AST or generated template program.
 *
 * @phpstan-type RenderOptions array{
 *     define?: array<string, string|array{template?: string, data?: mixed, html?: string}>,
 *     env?: array{timezone?: string, now?: float|int},
 * }
 */
interface Program
{
    /**
     * @param string|array $target
     * @phpstan-param string|array<string, mixed> $target
     * @param array $options
     * @phpstan-param RenderOptions $options
     */
    public function prepare(string|array $target, mixed $assign = [], array $options = []): PreparedRender;

    /**
     * @param string|array $target
     * @phpstan-param string|array<string, mixed> $target
     * @param array $options
     * @phpstan-param RenderOptions $options
     */
    public function render(string|array $target, mixed $assign = [], array $options = []): string;
}

/** A normalized request prepared for repeatable rendering. */
final class PreparedRender
{
    private readonly string $name;

    private readonly PreparedExecution $execution;

    /** Creates a prepared request for the entry template `$name` from one program execution. */
    public function __construct(string $name, PreparedExecution $execution) {}

    /** Renders the prepared request. An error of the PHP `Error` hierarchy is E_INTERNAL (ERR-13). */
    public function render(): string {}
}

/** Delegates requests to one complete AST or generated program. */
final class Engine implements Program
{
    private readonly Program $program;

    /** Creates an engine from one program. */
    public function __construct(Program $program) {}

    /** Delegates request preparation to the program. */
    public function prepare(string|array $target, mixed $assign = [], array $options = []): PreparedRender {}

    /** Delegates rendering to the program. */
    public function render(string|array $target, mixed $assign = [], array $options = []): string {}
}

/** One reusable prepared render operation. */
interface PreparedExecution
{
    /** Renders the prepared request. */
    public function render(): string;
}

/** Prepared AST interpreter execution. */
final class AstPreparedExecution implements PreparedExecution
{
    /** Renders the prepared template with fresh execution state. */
    public function render(): string {}
}

/**
 * AstProgram: template loading, caching, function registration and rendering.
 *
 * @phpstan-import-type RenderOptions from Program
 */
final class AstProgram implements Program
{
    public readonly \Polyspec\Template\Loader\LoaderInterface $loader;

    /**
     * @var array
     * @phpstan-var array{0: string, 1: string}
     */
    public readonly array $delimiters;

    /**
     * @var string
     * @phpstan-var 'dev'|'true'|'false'
     */
    public readonly string $artifactRefresh;

    /**
     * @param \Polyspec\Template\Loader\LoaderInterface|null $loader
     * @param array $options
     * @phpstan-param array{
     *     functions?: array<string, callable>,
     *     limits?: array<string, int>,
     *     delimiters?: string,
     *     artifact_refresh?: 'dev'|'true'|'false',
     * } $options
     */
    public function __construct(?\Polyspec\Template\Loader\LoaderInterface $loader = null, array $options = []) {}

    /**
     * Decodes the canonical JSON text of a template AST (AST-7) into the AST arrays that parse returns, so a program
     * renders it without parsing a source (RT-41). The JSON is validated against contracts/schema/ast.schema.json
     * (AST-10).
     *
     * @return array
     * @phpstan-return array<string, mixed>
     * @throws \JsonException when the text is not JSON
     * @throws AstDecodeError naming the JSON Pointer of the invalid node when the JSON is not a template AST
     */
    public static function decodeTemplate(string $json): array {}

    /**
     * RT-2: parses one template source without loading other templates.
     *
     * @param array $options
     * @phpstan-param array{delimiters?: string} $options
     * @return array
     * @phpstan-return array<string, mixed>
     */
    public static function parse(string $source, string $name, array $options = []): array {}

    /**
     * Parses one template source once and returns its AST with the accepted tags and the EDT-8 tokens of their parts.
     * Offsets are UTF-8 byte offsets after a leading byte order mark (LEX-2, EDT-8).
     *
     * @param array $options
     * @phpstan-param array{delimiters?: string} $options
     * @return array
     */
    public static function analyze(string $source, string $name, array $options = []): array {}

    /**
     * FUN-43, FUN-44.
     *
     * @param callable $fn
     */
    public function register(string $name, callable $fn): void {}

    /**
     * Registers one logical class function used by `Class::method(...)`.
     *
     * @param callable $fn
     */
    public function registerClass(string $className, string $method, callable $fn): void {}

    /**
     * Returns the function registered under a name, or null when no host registered it.
     */
    public function hostFunction(string $name): ?callable {}

    /** Returns one logical class function that the runtime of this program holds. */
    public function classFunction(string $className, string $method): ?callable {}

    /**
     * The limits of a render of this program (RT-33).
     *
     * @return array
     * @phpstan-return array{iterations: int, depth: int, outputBytes: int, expressionDepth: int}
     */
    public function limits(): array {}

    /**
     * Prepares a template name or a parsed template: binds the assign, the definitions and the environment once, for
     * any number of renders (RT-61).
     *
     * @param string|array $target
     * @phpstan-param string|array<string, mixed> $target
     * @param array $options
     * @phpstan-param RenderOptions $options
     */
    public function prepare(string|array $target, mixed $assign = [], array $options = []): PreparedRender {}

    /**
     * Renders a template name or a parsed template.
     *
     * @param string|array $target
     * @phpstan-param string|array<string, mixed> $target
     * @param array $options
     * @phpstan-param RenderOptions $options
     */
    public function render(string|array $target, mixed $assign = [], array $options = []): string {}
}
