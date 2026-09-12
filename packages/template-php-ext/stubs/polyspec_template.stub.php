<?php

/**
 * Signatures of the classes the polyspec_template extension registers.
 *
 * The file documents the extension for static analysis and is never loaded at runtime.
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
     * @param array{delimiters?: string, limits?: array{iterations?: int, depth?: int, outputBytes?: int, expressionDepth?: int}} $options
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
     * Renders a template with assign data given as a PHP value.
     *
     * @param array{define?: array<string, string|array{template?: string, data?: mixed, html?: string}>, env?: array{timezone?: string, now?: float|int}} $options
     */
    public function render(string $name, mixed $assign = [], array $options = []): string {}

    /**
     * Renders a template with assign data, template definitions and environment given as JSON text.
     */
    public function renderJson(string $name, string $assign, ?string $define = null, ?string $env = null): string {}
}
