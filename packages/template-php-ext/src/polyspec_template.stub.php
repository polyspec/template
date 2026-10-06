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
     * @param string|null $root Loader root directory; without it no template name resolves.
     * @param array<string, mixed> $options The key delimiters holds a two-character string; the key limits holds an
     *        array with the integer keys iterations, depth, outputBytes and expressionDepth.
     */
    public function __construct(?string $root = null, array $options = []) {}

    /**
     * Parses one template source and returns the AST as nested arrays.
     *
     * @param array{delimiters?: string} $options
     * @return array<string, mixed>
     */
    public static function parse(string $source, string $name, array $options = []): array {}

    /**
     * Parses one template source and returns the AST as JSON text.
     *
     * @param array{delimiters?: string} $options
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
     * @param array<string, mixed> $options The key define maps a definition id to a template path or to an array with
     *        the keys template, data and html; the key env holds an array with the keys timezone (a string) and now
     *        (a number).
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
