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
 * The error codes of docs/spec/errors.md, each with the condition of its table row in ERR-7 to ERR-12.
 */
final class ErrorCode
{
    // BEGIN GENERATED ERROR CODES
    /** The source is not valid UTF-8. */
    public const string E_LEX_INVALID_UTF8 = 'E_LEX_INVALID_UTF8';

    /** A tag has no closing `}` before the end of the file. */
    public const string E_PARSE_UNTERMINATED_TAG = 'E_PARSE_UNTERMINATED_TAG';

    /** A comment has no `*}` before the end of the file. */
    public const string E_PARSE_UNTERMINATED_COMMENT = 'E_PARSE_UNTERMINATED_COMMENT';

    /** A string literal has no closing quote before the end of the tag. */
    public const string E_PARSE_UNTERMINATED_STRING = 'E_PARSE_UNTERMINATED_STRING';

    /** A token is not allowed by the grammar at its position, including an empty expression. */
    public const string E_PARSE_UNEXPECTED_TOKEN = 'E_PARSE_UNEXPECTED_TOKEN';

    /** A number literal does not match the number token. */
    public const string E_PARSE_INVALID_NUMBER = 'E_PARSE_INVALID_NUMBER';

    /** A backslash in a string literal is followed by a character outside the escape set. */
    public const string E_PARSE_INVALID_ESCAPE = 'E_PARSE_INVALID_ESCAPE';

    /** `{/}` appears with no open block. */
    public const string E_PARSE_UNEXPECTED_CLOSE = 'E_PARSE_UNEXPECTED_CLOSE';

    /** The file ends while a block is open. */
    public const string E_PARSE_UNCLOSED_BLOCK = 'E_PARSE_UNCLOSED_BLOCK';

    /** `{:}` or `{:? ...}` appears with no open block. */
    public const string E_PARSE_ELSE_OUTSIDE_BLOCK = 'E_PARSE_ELSE_OUTSIDE_BLOCK';

    /** A second `{:}` appears in the same block. */
    public const string E_PARSE_DUPLICATE_ELSE = 'E_PARSE_DUPLICATE_ELSE';

    /** `{:? ...}` appears after `{:}` in the same block. */
    public const string E_PARSE_ELSEIF_AFTER_ELSE = 'E_PARSE_ELSEIF_AFTER_ELSE';

    /** `{:? ...}` appears directly inside a loop block or an if-block. */
    public const string E_PARSE_ELSEIF_NOT_IN_IF = 'E_PARSE_ELSEIF_NOT_IN_IF';

    /** An assignment target or loop variable is a reserved word. */
    public const string E_PARSE_RESERVED_NAME = 'E_PARSE_RESERVED_NAME';

    /** An include or block path is not a path token. */
    public const string E_PARSE_INVALID_PATH = 'E_PARSE_INVALID_PATH';

    /** The tokens of a block tag do not match the block tag grammar. */
    public const string E_PARSE_INVALID_BLOCK_TAG = 'E_PARSE_INVALID_BLOCK_TAG';

    /** The `}}` of a wrapped tag is not followed by the wrapper closer that matches the wrapper opener. */
    public const string E_PARSE_INVALID_WRAPPER = 'E_PARSE_INVALID_WRAPPER';

    /** A delimiter directive is not the first tag of the file, names a character that is not a delimiter, or has another form. */
    public const string E_PARSE_INVALID_DIRECTIVE = 'E_PARSE_INVALID_DIRECTIVE';

    /** The loader has no template for the resolved name. */
    public const string E_LOAD_NOT_FOUND = 'E_LOAD_NOT_FOUND';

    /** An include or block renders a template that is already being rendered in the same chain. */
    public const string E_LOAD_CYCLE = 'E_LOAD_CYCLE';

    /** A resolved path leaves the loader root. */
    public const string E_LOAD_OUTSIDE_ROOT = 'E_LOAD_OUTSIDE_ROOT';

    /** The loader reports a failure for the resolved name (RT-9): a TypeScript or PHP loader throws an exception, a Go or Rust loader returns an error, or a filesystem loader cannot read an existing regular file (RT-10), or a loader result lacks a source text and an AST, or a version (RT-9). */
    public const string E_LOAD_FAILED = 'E_LOAD_FAILED';

    /** A finite number has a magnitude greater than 2^53 − 1 (VAL-2). */
    public const string E_DATA_NUMBER_RANGE = 'E_DATA_NUMBER_RANGE';

    /** A number is NaN or infinite. */
    public const string E_DATA_NUMBER_NOT_FINITE = 'E_DATA_NUMBER_NOT_FINITE';

    /** A string or a map key is not valid Unicode text (VAL-12 to VAL-17). */
    public const string E_DATA_INVALID_UTF8 = 'E_DATA_INVALID_UTF8';

    /** A value has a type that has no binding. */
    public const string E_DATA_UNSUPPORTED_TYPE = 'E_DATA_UNSUPPORTED_TYPE';

    /** Lists and maps are nested deeper than the binding depth limit, including a cyclic host structure (VAL-20). */
    public const string E_DATA_DEPTH = 'E_DATA_DEPTH';

    /** JSON text of assign data, template definitions or the environment is not one JSON document (VAL-12). */
    public const string E_DATA_INVALID_JSON = 'E_DATA_INVALID_JSON';

    /** An operand or argument has a type the operation does not accept. */
    public const string E_RUNTIME_TYPE = 'E_RUNTIME_TYPE';

    /** An ordering comparison has operands without an order. */
    public const string E_RUNTIME_COMPARE = 'E_RUNTIME_COMPARE';

    /** The right operand of `/` or `%` is zero. */
    public const string E_RUNTIME_DIV_ZERO = 'E_RUNTIME_DIV_ZERO';

    /** A list or map is converted to a string. */
    public const string E_RUNTIME_STRINGIFY = 'E_RUNTIME_STRINGIFY';

    /** A call names a function that is neither built in nor registered. */
    public const string E_RUNTIME_UNKNOWN_FUNCTION = 'E_RUNTIME_UNKNOWN_FUNCTION';

    /** A call has an argument count outside the function's range. */
    public const string E_RUNTIME_ARITY = 'E_RUNTIME_ARITY';

    /** Host code that the engine called reported an error (FUN-46, VAL-14, VAL-19): a registered function, a logical class function, an instance method, a member accessor, or `jsonSerialize()`. */
    public const string E_RUNTIME_HOST_FUNCTION = 'E_RUNTIME_HOST_FUNCTION';

    /** A loop meta names a loop that is not enclosing the expression. */
    public const string E_RUNTIME_UNKNOWN_LOOP = 'E_RUNTIME_UNKNOWN_LOOP';

    /** `{# id}` names an id that the template definition registry does not contain. */
    public const string E_RUNTIME_BLOCK_UNDEFINED = 'E_RUNTIME_BLOCK_UNDEFINED';

    /** `{# id path}` names an id that is registered with a different path. */
    public const string E_RUNTIME_BLOCK_REDEFINED = 'E_RUNTIME_BLOCK_REDEFINED';

    /** The nesting depth of includes and blocks exceeds the limit. */
    public const string E_RUNTIME_DEPTH = 'E_RUNTIME_DEPTH';

    /** The iteration count, the output size, the expression depth, a range size or the depth of a value that a list or map literal builds (VAL-20) exceeds its limit. */
    public const string E_RUNTIME_LIMIT = 'E_RUNTIME_LIMIT';

    /** The implementation failed in a way this specification does not define: a panic in Rust or Go code that the engine runs, or, in TypeScript and PHP, an error that the language runtime raises for a programming defect. */
    public const string E_INTERNAL = 'E_INTERNAL';
    // END GENERATED ERROR CODES
}

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
 * The failure of AstProgram::decodeTemplate: the JSON is not a template AST of contracts/schema/ast.schema.json.
 */
final class AstDecodeError extends \InvalidArgumentException
{
    /**
     * The JSON Pointer (RFC 6901) of the invalid node, empty for the root (AST-10).
     */
    public readonly string $path;

    /**
     * @param string $path The JSON Pointer (RFC 6901) of the invalid node, empty for the root (AST-10).
     * @param string $reason The rule of the schema that the node breaks.
     */
    public function __construct(string $path, string $reason) {}
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

/**
 * Value types, stringification, truthiness, equality and ordering
 * (docs/spec/data-model.md, docs/spec/expressions.md).
 *
 * A value is null, bool, float, string, SafeString, a PHP list or a MapValue.
 */
final class Value
{
    public static function typeOf(mixed $value): string {}

    public static function isString(mixed $value): bool {}

    public static function textOf(string|SafeString $value): string {}

    public static function isNumber(mixed $value): bool {}

    /**
     * EXP-33: falsy values.
     */
    public static function isTruthy(mixed $value): bool {}

    /**
     * VAL-8: conversion to text. Returns null for a list or map.
     */
    public static function stringify(mixed $value): ?string {}

    /**
     * Returns the numeric value of a string under EXP-23, or null.
     */
    public static function parseNumericString(string $text): ?float {}

    /**
     * Compares two strings by code point sequence.
     */
    public static function compareCodePoints(string $a, string $b): int {}

    /**
     * EXP-34, EXP-35.
     */
    public static function looseEquals(mixed $a, mixed $b): bool {}

    /**
     * EXP-37.
     */
    public static function strictEquals(mixed $a, mixed $b): bool {}

    /**
     * EXP-38: returns -1, 0 or 1, or null when the pair has no order.
     */
    public static function compare(mixed $a, mixed $b): ?int {}

    public static function isCollection(mixed $value): bool {}
}

/**
 * Number conversion and formatting (VAL-9, VAL-10, FUN-20 to FUN-25).
 */
final class Number
{
    /** @var int */
    public const MAX_SAFE = 9007199254740991;

    /**
     * VAL-9: ECMAScript Number::toString.
     */
    public static function toText(float $value): string {}

    /**
     * Shortest round-trip digits and the exponent n such that value = 0.digits × 10^n.
     *
     * @return array{0: bool, 1: string, 2: int}
     */
    public static function shortestDigits(float $value): array {}

    /**
     * Positional decimal expansion without exponent.
     *
     * @return array{0: bool, 1: string, 2: string} negative, integer digits, fraction digits
     */
    public static function positional(float $value): array {}

    /**
     * FUN-22: rounds the positional digits half away from zero.
     *
     * @return array{0: bool, 1: string, 2: string}
     */
    public static function roundDecimal(float $value, int $decimals): array {}

    /**
     * FUN-20 to FUN-24.
     */
    public static function format(float $value, int $decimals, string $dec, string $thousands): string {}

    /**
     * FUN-25: the rounded value as a number.
     */
    public static function round(float $value, int $decimals): float {}

    public static function isInteger(float $value): bool {}
}

/**
 * The host form of a template value that a template passes to host code (VAL-18, VAL-21).
 */
final class HostArgument
{
    /**
     * A number becomes a float, a safe string its text, a list a list array and a map an array with
     * its entries in entry order, at every depth; a native object stays the original object.
     */
    public static function of(mixed $value): mixed {}

    /**
     * The host form of each element of a list, with the keys of the list kept.
     */
    public static function list(array $args): array {}
}

namespace Polyspec\Template\Functions;

/**
 * Failure raised by a built-in function; the evaluator attaches the call position.
 */
final class FunctionError extends \RuntimeException
{
    public readonly string $errorCode;

    public function __construct(string $errorCode, string $message) {}
}

/**
 * A group of built-in functions: Registry joins the tables of the groups.
 */
interface FunctionGroup
{
    /**
     * The functions of the group by name, with their argument counts and the callable that runs them.
     *
     * @return array
     * @phpstan-return array<string, array{min: int, max: int, call: callable}>
     */
    public static function table(): array;
}

/**
 * Argument helpers shared by the function groups.
 */
final class Helpers
{
    public static function typeError(string $message): FunctionError {}

    public static function string(mixed $value, string $name): string {}

    /**
     * @return array
     * @phpstan-return list<mixed>
     */
    public static function list(mixed $value, string $name): array {}

    /**
     * EXP-23 to_number.
     */
    public static function toNumber(mixed $value): float {}

    public static function number(mixed $value): float {}

    public static function integer(mixed $value): int {}

    public static function stringify(mixed $value): string {}

    public static function safe(string $text): \Polyspec\Template\Value\SafeString {}
}

/**
 * upper, lower, trim, replace, split, truncate, contains, starts_with, ends_with, length (FUN-12, FUN-13).
 */
final class Strings implements FunctionGroup
{
    public static function table(): array {}
}

/**
 * number, round, floor, ceil, abs, min, max, num (FUN-16, FUN-17, FUN-20 to FUN-25).
 */
final class Numbers implements FunctionGroup
{
    public static function table(): array {}
}

/**
 * escape, raw, json, url, nl2br, str, type (FUN-10, FUN-11, FUN-18, FUN-19, FUN-26 to FUN-30).
 */
final class Encoding implements FunctionGroup
{
    /**
     * FUN-26 to FUN-28.
     */
    public static function toJson(mixed $value): string {}

    /**
     * FUN-29.
     */
    public static function percentEncode(string $text): string {}

    public static function table(): array {}
}

/**
 * keys, values, first, last, reverse, slice, sort, join, range, default (FUN-14, FUN-15, FUN-31 to FUN-36).
 */
final class Collection implements FunctionGroup
{
    public const int RANGE_LIMIT = 1000000;

    public static function table(): array {}
}

/**
 * date and now (FUN-37 to FUN-42).
 */
final class Dates implements FunctionGroup
{
    /**
     * Offset in seconds of `Z` or `±HH:MM`, or null.
     */
    public static function parseOffset(string $text): ?int {}

    /**
     * Days since 1970-01-01 of a proleptic Gregorian date.
     */
    public static function daysFromCivil(int $year, int $month, int $day): int {}

    /**
     * @return array{0: int, 1: int, 2: int} year, month, day
     */
    public static function civilFromDays(int $days): array {}

    public static function toUnixSeconds(mixed $value, int $envOffset): int {}

    public static function format(int $seconds, string $format, int $offset): string {}

    public static function table(): array {}
}

/**
 * The built-in functions of the library (docs/spec/functions.md): builtins joins the tables of the groups in the order
 * of the library, and isBuiltin tells whether a name is a built-in function.
 */
final class Registry
{
    /**
     * @return array
     * @phpstan-return array<string, array{min: int, max: int, call: callable}>
     */
    public static function builtins(): array {}

    public static function isBuiltin(string $name): bool {}
}
