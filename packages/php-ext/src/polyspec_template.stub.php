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

/**
 * Template name resolution (RT-7, RT-8).
 */
final class Path
{
    /**
     * Resolves a path written in a tag against the directory of the current template.
     * Returns null when the path leaves the loader root.
     */
    public static function resolve(string $current, string $path): ?string {}
}

namespace Polyspec\Template\Render;

/**
 * Runtime state required by both AST and generated programs.
 */
interface RuntimeServices
{
    /**
     * The limits of a render (RT-33).
     *
     * @return array
     * @phpstan-return array{iterations: int, depth: int, outputBytes: int, expressionDepth: int}
     */
    public function limits(): array;

    /** Returns the host function registered under a name. */
    public function hostFunction(string $name): ?callable;

    /** Returns one registered logical class function. */
    public function classFunction(string $className, string $method): ?callable;
}

/**
 * Host functions and resource limits shared by AST and generated programs.
 */
final class RuntimeEnvironment implements RuntimeServices
{
    /**
     * The fields of the library class, declared so that the shape of the class matches it. The state is held by the
     * runtime object of the extension: these properties are never set.
     *
     * @var array
     * @phpstan-var array{iterations: int, depth: int, outputBytes: int, expressionDepth: int}
     */
    private readonly array $limits;

    /**
     * @var array
     * @phpstan-var array<string, callable>
     */
    private array $hostFunctions;

    /**
     * @var array
     * @phpstan-var array<string, callable>
     */
    private array $classFunctions;

    /**
     * @param array $limits
     * @phpstan-param array<string, int> $limits
     * @param array $hostFunctions
     * @phpstan-param array<string, callable> $hostFunctions
     */
    public function __construct(array $limits = [], array $hostFunctions = []) {}

    /** Registers one host function after validating its name. */
    public function register(string $name, callable $function): void {}

    /**
     * The limits of the environment: the defaults of RT-33 with the overrides of the options (RT-6).
     *
     * @return array
     * @phpstan-return array{iterations: int, depth: int, outputBytes: int, expressionDepth: int}
     */
    public function limits(): array {}

    /** Returns one registered host function. */
    public function hostFunction(string $name): ?callable {}

    /** Registers one logical class function used by `Class::method(...)`. */
    public function registerClass(string $className, string $method, callable $function): void {}

    /** Returns the class function registered under `Class::method`, or null. */
    public function classFunction(string $className, string $method): ?callable {}
}

/** One rendered template location and its context data. */
final class Frame
{
    public readonly string $name;
    /** @var list<int>|null */
    public readonly ?array $lines;
    public readonly \Polyspec\Template\Value\MapValue $context;

    /**
     * @param array|null $lines
     * @phpstan-param list<int>|null $lines
     */
    public function __construct(string $name, ?array $lines, \Polyspec\Template\Value\MapValue $context) {}
}

/** Local variables and loop stacks shared by includes and isolated by blocks. */
final class Scope
{
    public readonly \Polyspec\Template\Value\MapValue $locals;
    /** @var \ArrayObject<string, list<array<string, mixed>>> */
    public readonly \ArrayObject $loops;

    public function __construct(?\Polyspec\Template\Value\MapValue $locals = null) {}

    public function lookup(Frame $frame, string $name): mixed {}

    /** @return array<string, mixed>|null */
    public function loopMeta(string $name): ?array {}
}

/**
 * Render state: output, template definition registry, chain, limits and error creation (docs/spec/runtime.md).
 */
final class Context
{
    /** @var array<string, array{template: string, data: \Polyspec\Template\Value\MapValue|null}|array{html: string}> */
    public array $registry = [];
    /** @var list<string> */
    public array $chain = [];
    public int $iterations = 0;
    private string $output = '';
    private int $outputBytes = 0;
    private ?Frame $currentFrame = null;
    /** @var array{0: int, 1: int} */
    private array $currentSpan;
    public readonly RuntimeServices $services;
    public readonly \Polyspec\Template\Value\MapValue $rootData;
    /** @var array{timezone: string, now: float} */
    public readonly array $env;
    public readonly string $entryName;

    /**
     * @param array $env
     * @phpstan-param array{timezone: string, now: float} $env
     */
    public function __construct(RuntimeServices $services, \Polyspec\Template\Value\MapValue $rootData, array $env, string $entryName) {}

    public function write(string $text): void {}

    public function output(): string {}

    /**
     * @param array $span
     * @phpstan-param array{0: int, 1: int} $span
     */
    public function at(Frame $frame, array $span): void {}

    /**
     * @param array|null $span
     * @phpstan-param array{0: int, 1: int}|null $span
     */
    public function fail(string $code, ?Frame $frame, ?array $span, string $message): \Polyspec\Template\TemplateError {}

    /**
     * @param array|null $span
     * @phpstan-param array{0: int, 1: int}|null $span
     */
    public function enter(string $name, ?Frame $frame, ?array $span): void {}

    public function leave(): void {}
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
final class AstProgram implements Program, \Polyspec\Template\Render\RuntimeServices
{
    public readonly \Polyspec\Template\Loader\LoaderInterface $loader;

    /**
     * The runtime of the program: its limits and its host functions (RT-33, FUN-43).
     *
     * @var \Polyspec\Template\Render\RuntimeEnvironment
     */
    public readonly \Polyspec\Template\Render\RuntimeEnvironment $runtime;

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

/**
 * A map that host binding checked once (VAL-22). `bind` and `merge` create it; `render` and
 * `prepare` take it as assign and as definition data without binding it again. Its entries are
 * private, and the class cannot be instantiated, cloned or unserialized.
 */
final class BoundMap
{
    private function __construct() {}

    private function __clone(): void {}

    /**
     * PHP calls this method for `unserialize`; a bound map holds only checked values, so it cannot
     * be restored from text.
     *
     * @param array $data
     * @phpstan-param array<mixed> $data
     */
    public function __unserialize(array $data): void {}

    /**
     * Applies host binding to a value and returns a bound map (VAL-22). Null and the empty array give
     * the empty bound map (RT-4); a bound map is returned unchanged. Errors have no template and no
     * position (ERR-14).
     */
    public static function bind(mixed $value): BoundMap {}

    /**
     * Returns a bound map with the entries of `$first` and `$second`: an entry of `$second` replaces
     * the entry of `$first` with the same key in its position, and the other entries of `$second`
     * follow (RT-26). It reads no value again.
     */
    public static function merge(mixed $first, mixed $second): BoundMap {}
}

/**
 * Template source: UTF-8 validation, BOM removal and the line index (LEX-1, LEX-2, LEX-16).
 */
final class Source
{
    /** @var list<int> byte offsets of line starts */
    public readonly array $lines;

    public readonly string $name;

    public readonly string $text;

    private function __construct(string $name, string $text) {}

    /**
     * Checks the bytes as UTF-8 and removes the byte order mark; an invalid byte is E_LEX_INVALID_UTF8 at its offset.
     */
    public static function fromBytes(string $name, string $bytes): Source {}

    /**
     * @return list<int>
     */
    public static function lineIndex(string $text): array {}

    /**
     * @param array $lines
     * @phpstan-param list<int> $lines
     * @return array
     * @phpstan-return array{0: int, 1: int} 1-based line and byte column
     */
    public static function position(array $lines, int $offset): array {}

    public function length(): int {}
}

/**
 * UTF-8 helpers shared by the source reader, the data binder and the functions.
 */
final class Utf8
{
    /**
     * Returns whether the bytes are valid UTF-8, with the same result as `firstInvalid() < 0`. Binding uses it
     * because it checks in native code and reports no position.
     */
    public static function isValid(string $bytes): bool {}

    /**
     * Returns the index of the first invalid byte, or -1 when the bytes are valid UTF-8.
     */
    public static function firstInvalid(string $bytes): int {}

    /**
     * Encodes a code point as UTF-8.
     */
    public static function chr(int $code): string {}

    /**
     * @return list<string> code points of a valid UTF-8 string
     */
    public static function codePoints(string $text): array {}

    public static function length(string $text): int {}
}

/**
 * HTML escaping (RT-32, FUN-10).
 */
final class Escape
{
    public static function html(string $text): string {}
}

/**
 * The boundary of the public parse, prepare and render operations (ERR-12, ERR-13).
 */
final class InternalBoundary
{
    /**
     * Runs one operation and reports an error of the PHP `Error` hierarchy as E_INTERNAL for
     * `$template`. A template error and every exception pass unchanged.
     *
     * @template T
     * @param \Closure $operation
     * @phpstan-param \Closure(): T $operation
     * @return mixed
     * @phpstan-return T
     */
    public static function run(string $template, \Closure $operation): mixed {}
}

namespace Polyspec\Template\Value;

/** A string that the echo tag writes without escaping (VAL-6). */
final class SafeString
{
    public readonly string $text;

    /** Wraps text that the echo tag writes as it is. */
    public function __construct(string $text) {}
}

/** Data binding failure (E_DATA_* codes). */
final class BindError extends \RuntimeException
{
    public readonly string $errorCode;

    public function __construct(string $errorCode, string $message) {}
}

/**
 * Insertion-ordered map with string keys (VAL-1, VAL-4, VAL-17).
 *
 * PHP arrays convert numeric string keys to integers; every key is cast back to a string on read.
 */
final class MapValue
{
    private array $items = [];

    public function set(string $key, mixed $value): void {}

    public function has(string $key): bool {}

    public function get(string $key): mixed {}

    public function remove(string $key): void {}

    public function count(): int {}

    /**
     * @return list<string>
     */
    public function keys(): array {}

    /**
     * @return list<mixed>
     */
    public function values(): array {}

    /**
     * @return list<array{0: string, 1: mixed}>
     */
    public function entries(): array {}

    public function copy(): MapValue {}
}

/**
 * Host binding of PHP values (VAL-2, VAL-14, VAL-17, VAL-20).
 */
final class Bind
{
    /**
     * The nesting depth limit of lists and maps (VAL-20).
     *
     * @var int
     */
    public const MAX_DEPTH = 64;

    public static function value(mixed $input): mixed {}

    /**
     * VAL-2, VAL-3: a float is accepted when it is finite and its magnitude is at most 2^53 - 1.
     */
    public static function checkFloat(float $value): float {}

    /**
     * VAL-20: fails when a list or map would be entered at a level greater than the limit; the level
     * counts the enclosing lists and maps, including the one being entered.
     */
    public static function checkLevel(int $level): void {}

    /**
     * VAL-20: whether the depth of a template value is at most `$limit`; the walk stops below the limit.
     */
    public static function depthWithin(mixed $value, int $limit): bool {}

    /**
     * The public properties of an object: the entries of get_mangled_object_vars() whose names are
     * not mangled. The function ignores the class scope of the caller (VAL-14, VAL-19).
     *
     * @return array<int|string, mixed>
     */
    public static function publicProperties(object $object): array {}

    /**
     * Binds assign data (RT-4): null and the empty array are the empty map, a bound map gives its
     * entries without binding them again (VAL-22), and every other value must bind to a map.
     */
    public static function map(mixed $input): MapValue {}

    /**
     * Binds the data of a template definition (RT-24): a bound map gives its entries without binding
     * them again (VAL-22); every other value is bound like any host value, and the empty array is the
     * empty map.
     */
    public static function data(mixed $input): mixed {}
}

/**
 * JSON text parser that preserves document order and applies the number rules of VAL-12.
 */
final class Json
{
    /**
     * Parses JSON bytes into a template value.
     */
    public static function parse(string $bytes): mixed {}
}
