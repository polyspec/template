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
 * Error object as defined in docs/spec/errors.md.
 *
 * The accessor names avoid getCode(), getLine() and getFile(), which \Exception declares final.
 */
final class TemplateError extends \Exception
{
    /** Error code of the specification, such as E_PARSE_UNCLOSED_BLOCK. */
    public function getErrorCode(): string {}

    /** Name of the template in which the error is located. */
    public function getTemplate(): string {}

    /** 1-based line, or 0 when the error has no position. */
    public function getErrorLine(): int {}

    /** 1-based byte column, or 0 when the error has no position. */
    public function getErrorCol(): int {}

    /** Start byte offset of the related token or node. */
    public function getOffset(): int {}

    /** End byte offset of the related token or node. */
    public function getEnd(): int {}

    /**
     * @return array{code: string, template: string, line: int, col: int, offset: int, end: int, message: string}
     */
    public function toArray(): array {}
}

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
