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
 * The failure of an artifact that is missing or stale (RT-56): its manifest or one of its files is absent, or a file does
 * not match its digest. It is the one failure that a build fixes, so AstProgram::loadOrRefresh rebuilds on it under "true"
 * and on nothing else.
 */
final class ArtifactStaleException extends \RuntimeException
{
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

/**
 * Shared runtime value, function and error semantics for AST and generated programs (docs/spec/runtime.md). Each
 * failure is a TemplateError located at the node.
 */
final class RuntimeBindings
{
    public function __construct(Context $context) {}

    public function truthy(mixed $value): bool {}

    /** @phpstan-param array{0: int, 1: int} $span */
    public function unary(string $operator, mixed $operand, Frame $frame, array $span): mixed {}

    /** @phpstan-param array{0: int, 1: int} $span */
    public function binary(string $operator, mixed $left, mixed $right, Frame $frame, array $span): mixed {}

    /** @phpstan-param array{0: int, 1: int} $span */
    public function stringify(mixed $value, Frame $frame, array $span): string {}

    /** @phpstan-param array{0: int, 1: int} $span */
    public function escape(mixed $value, Frame $frame, array $span): string {}

    /** @phpstan-param array{0: int, 1: int} $span */
    public function number(mixed $value, Frame $frame, array $span): float {}

    /** @phpstan-param array{0: int, 1: int} $span */
    public function finite(float $value, Frame $frame, array $span): float {}

    public function equal(mixed $left, mixed $right, bool $strict): bool {}

    /** @phpstan-param array{0: int, 1: int} $span */
    public function compare(mixed $left, mixed $right, Frame $frame, array $span): int {}

    /** @phpstan-param array{0: int, 1: int} $span */
    public function member(mixed $container, string $key, Frame $frame, array $span): mixed {}

    /**
     * @phpstan-param list<mixed> $args
     * @phpstan-param array{0: int, 1: int} $span
     */
    public function memberCall(mixed $container, string $method, array $args, Frame $frame, array $span): mixed {}

    /**
     * @phpstan-param list<mixed> $args
     * @phpstan-param array{0: int, 1: int} $span
     */
    public function classCall(string $className, string $method, array $args, Frame $frame, array $span): mixed {}

    /** @phpstan-param array{0: int, 1: int} $span */
    public function index(mixed $container, mixed $key, Frame $frame, array $span): mixed {}

    /** @phpstan-param array{0: int, 1: int} $span */
    public function depth(mixed $value, Frame $frame, array $span): mixed {}

    /** @phpstan-param array{0: int, 1: int} $span */
    public function entries(mixed $value, Frame $frame, array $span): array {}

    /** @phpstan-param array{0: int, 1: int} $span */
    public function listSpread(mixed $value, Frame $frame, array $span): array {}

    /** @phpstan-param array{0: int, 1: int} $span */
    public function mapSpread(mixed $value, Frame $frame, array $span): \Polyspec\Template\Value\MapValue {}

    /**
     * @phpstan-param list<mixed> $args
     * @phpstan-param array{0: int, 1: int} $span
     */
    public function call(string $name, array $args, Frame $frame, array $span): mixed {}

    /** @phpstan-param array{0: int, 1: int} $span */
    public function limit(string $kind, int $count, Frame $frame, array $span): void {}

    /** @phpstan-param array{0: int, 1: int} $span */
    public function error(Frame $frame, array $span, string $code, string $message): \Polyspec\Template\TemplateError {}
}

/**
 * Expression evaluation (docs/spec/expressions.md).
 * @internal
 */
final class Evaluator
{
    public readonly RuntimeBindings $runtime;

    public function __construct(Context $context) {}

    /** @phpstan-param array<string, mixed> $expr */
    public function evaluate(array $expr, Frame $frame, ?Scope $scope = null): mixed {}
}

/**
 * Statement rendering: text, echo, if, loop, assignment, include, block (RT-11 to RT-32).
 * @internal
 */
final class Renderer
{
    public function __construct(Context $context, \Polyspec\Template\AstProgram $program) {}

    /** @phpstan-param list<array<string, mixed>> $nodes */
    public function renderNodes(array $nodes, Frame $frame, Scope $scope): void {}
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

    /** A list, a map or a native object (VAL-19) is converted to a string. */
    public const string E_RUNTIME_STRINGIFY = 'E_RUNTIME_STRINGIFY';

    /** A call names a function that is neither built in nor registered. */
    public const string E_RUNTIME_UNKNOWN_FUNCTION = 'E_RUNTIME_UNKNOWN_FUNCTION';

    /** A call has an argument count outside the function's range. */
    public const string E_RUNTIME_ARITY = 'E_RUNTIME_ARITY';

    /** Host code that the engine called reported an error (FUN-46, VAL-19): a registered function, a logical class function, an instance method, a member accessor, or `jsonSerialize()`. */
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
 * Decoding of the AST JSON (AST-10): the canonical JSON of a template AST, validated against
 * contracts/schema/ast.schema.json, read as the AST arrays that the parser returns.
 *
 * @internal AstProgram::decodeTemplate is the public entry.
 */
final class AstDecoder
{
    /**
     * @return array<string, mixed>
     * @throws \JsonException when the text is not JSON
     * @throws AstDecodeError when the JSON is not a template AST
     */
    public static function decode(string $json): array {}
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
    /** Creates an AST execution from normalized request state. */
    public function __construct(
        AstProgram $engine,
        \Polyspec\Template\Value\MapValue $rootData,
        array $registry,
        array $env,
        string $targetName,
        array $template,
    ) {}

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

    /** RT-56: loads the AST artifact that the build compiler wrote in a directory. */
    public static function loadArtifact(string $directory): AstProgram {}

    /** ArtifactStore.loadOrRefresh: builds or reuses the artifact by its refresh policy (RT-76). */
    public static function loadOrRefresh(string $directory, string $refresh, callable $build): AstProgram {}

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
     * RT-9, RT-40: loads a template by name and caches it by version.
     *
     * @param array|null $span
     * @phpstan-param array{0: int, 1: int}|null $span
     * @return array
     * @phpstan-return array{ast: array<string, mixed>, lines: list<int>|null}
     */
    public function loadTemplate(string $name, ?\Polyspec\Template\Render\Frame $from, ?array $span): array {}

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
 * Stores final HTML pages independently from compiled template artifacts.
 */
final class PageCache
{
    /**
     * @param \Closure|null $clock returns the current time in seconds; microtime(true) when null
     */
    public function __construct(?\Closure $clock = null) {}

    /**
     * Returns the HTML of a key that has not expired, or null.
     */
    public function get(string $key): ?string {}

    /**
     * Stores the HTML of a key. A time to live of null or zero keeps the entry; a negative or non-finite one is refused.
     *
     * @throws \InvalidArgumentException when the time to live is negative or not finite
     */
    public function set(string $key, string $html, ?float $ttl): void {}

    /** Returns a cached page or renders and stores it on a miss. */
    public function getOrSet(string $key, ?float $ttl, \Closure $render): string {}

    /** Removes one key. */
    public function delete(string $key): void {}

    /** Removes every key. */
    public function clear(): void {}
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

    /** Captures text through the UTF-8 byte constructor (LEX-24). */
    public static function fromText(string $name, string $text): Source {}

    /** Returns normalized UTF-8 bytes. */
    public function bytes(): string {}

    /** Maps a native byte index to a byte offset. */
    public function byteAt(int $index): int {}

    /** @phpstan-return array{0: int, 1: int} */
    public function span(int $start, int $end): array {}

    /** Creates a template error at a supplied byte span, including an EOF span. */
    public function error(string $code, int $start, int $end, string $message): TemplateError {}

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
 * @internal
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
 * @internal
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
 * Host binding of PHP values (VAL-2, VAL-17, VAL-20).
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
     * not mangled. The function ignores the class scope of the caller (VAL-19).
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
 * @internal
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
 * @internal
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
 * @internal
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
 * @internal
 *
 * Failure raised by a built-in function; the evaluator attaches the call position.
 */
final class FunctionError extends \RuntimeException
{
    public readonly string $errorCode;

    public function __construct(string $errorCode, string $message) {}
}

/**
 * @internal
 *
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
 * @internal
 *
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
 * @internal
 *
 * upper, lower, trim, replace, split, truncate, contains, starts_with, ends_with, length (FUN-12, FUN-13).
 */
final class Strings implements FunctionGroup
{
    public static function table(): array {}
}

/**
 * @internal
 *
 * number, round, floor, ceil, abs, min, max, num (FUN-16, FUN-17, FUN-20 to FUN-25).
 */
final class Numbers implements FunctionGroup
{
    public static function table(): array {}
}

/**
 * @internal
 *
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
 * @internal
 *
 * keys, values, first, last, reverse, slice, sort, join, range, default (FUN-14, FUN-15, FUN-31 to FUN-36).
 */
final class Collection implements FunctionGroup
{
    public const int RANGE_LIMIT = 1000000;

    public static function table(): array {}
}

/**
 * @internal
 *
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
 * @internal
 *
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

namespace Polyspec\Template\Format;

/**
 * Why the formatter returned no text.
 */
final class FormatError
{
    /** Kind of failure: parse, invariant or html. */
    public readonly string $reason;

    /** Error code of the parser, or null. */
    public readonly ?string $code;

    /** 1-based line of the error position */
    public readonly int $line;

    /** 1-based byte column of the error position, as in parser errors (ERR-1) */
    public readonly int $col;

    public readonly string $message;

    /**
     * `parse`: the source does not parse. `invariant`: the formatted text does not parse to the same AST. `html`:
     * the HTML structure is not balanced, so the lines cannot be indented. The column is a 1-based byte column, as in
     * parser errors (ERR-1).
     */
        public function __construct(string $reason, ?string $code, int $line, int $col, string $message) {}

    /**
     * @return array
     * @phpstan-return array{reason: string, code: string|null, line: int, col: int, message: string}
     */
    public function toArray(): array {}
}

/**
 * The result of the formatter: the formatted text and whether it differs from the source, or the reason why the
 * source is kept.
 */
final class FormatResult
{
    public readonly ?string $text;

    public readonly bool $changed;

    public readonly ?FormatError $error;

    public function __construct(?string $text, bool $changed, ?FormatError $error) {}

    public static function text(string $text, bool $changed): FormatResult {}

    public static function error(FormatError $error): FormatResult {}
}

/**
 * Expression spacing: joins the expression tokens of one tag with the separators of the formatting style.
 *
 * A token is its text and the EDT-8 class that the parser gives it.
 * @internal
 */
final class Expression
{
    /**
     * Joins expression tokens with the separators of the formatting style: one space around binary and ternary
     * operators, `|`, `=>` and `in`; one space after `,`; no space after `(`, `[`, `...` and unary `!` and `-`; no
     * space before `,`, `)`, `]` and accessors; no space between a function or method name and `(`, between an
     * operand and an index `[`, and around the `::` token of `Class::name`.
     *
     * @param array $tokens
     * @phpstan-param list<array{text: string, kind: string}> $tokens
     */
    public static function join(array $tokens): string {}
}

/**
 * Safety invariant: two templates are equivalent when their ASTs are equal after every `span` field is removed (AST-2,
 * AST-7), and, for indented lines, after the spaces and tabs at the start of every line of text are removed.
 * @internal
 */
final class Invariant
{
    /**
     * Returns a copy of an AST value without `span` fields.
     */
    public static function withoutSpans(mixed $value): mixed {}

    /**
     * Returns a copy of an AST value whose `Text` nodes have no spaces or tabs at the start of a line. A `Text` node
     * that becomes empty is removed: indentation after a line that the renderer removes is a `Text` node of its own.
     */
    public static function withoutLineIndentation(mixed $value): mixed {}

    /**
     * Compares two AST values structurally, ignoring the key order of maps and every `span` field.
     */
    public static function sameTree(mixed $left, mixed $right): bool {}
}

/**
 * Indentation: the spaces and tabs at the start of each line, set by the nesting of HTML elements and template blocks.
 *
 * Offsets are byte offsets into the text.
 * @internal
 */
final class Indent
{
    private function __construct(string $text, array $tags, bool $counted) {}

    /**
     * Returns the edits that set the indentation of every line, or the reason why the HTML structure cannot be
     * indented: the byte offset of the tag where the structure fails and a message.
     *
     * @param array $tags
     * @phpstan-param list<array{kind: string, start: int, end: int}> $tags
     * @param array|null $range only lines that start inside it are indented
     * @phpstan-param array{start: int, end: int}|null $range
     * @return array
     * @phpstan-return array{edits: list<array{start: int, end: int, text: string}>}|array{error: array{index: int, message: string}}
     */
    public static function edits(string $text, array $tags, string $unit, string $templateBlocks, ?array $range): array {}
}

/**
 * The parser that the formatter reads: one implementation of the specification, such as the parser of this package
 * or the native parser of the PHP extension.
 */
interface Analyzer
{
    /**
     * Parses a template source and returns its AST, the accepted tags and the EDT-8 tokens of their parts, with UTF-8
     * byte offsets after a leading byte order mark.
     *
     * @param array $options
     * @return array
     * @phpstan-param array{delimiters?: string} $options
     * @phpstan-return array{ast: array<string, mixed>, tags: list<array{start: int, end: int, kind: string, bodyStart: int, bodyEnd: int}>, tokens: list<array{start: int, end: int, kind: string}>}
     * @throws TemplateError when the source does not parse
     * @throws \InvalidArgumentException when the delimiters option is not a delimiter pair
     */
    public function analyze(string $source, string $name, array $options): array;

    /**
     * Parses a template source and returns its AST.
     *
     * @param array $options
     * @return array
     * @phpstan-param array{delimiters?: string} $options
     * @phpstan-return array<string, mixed>
     * @throws TemplateError when the source does not parse
     */
    public function parse(string $source, string $name, array $options): array;
}

/**
 * The parser of this package as the analyzer of the formatter.
 */
final class PackageAnalyzer implements Analyzer
{
    public function analyze(string $source, string $name, array $options): array {}

    public function parse(string $source, string $name, array $options): array {}
}

/**
 * Tag body formatting: writes the body of each tag kind in the formatting style (GRM-2).
 * @internal
 */
final class Body
{
    /**
     * Returns the formatted body of a tag, or null when the tag is kept as written: comments, directives, bodies that
     * contain a line terminator and bodies whose expression tokens do not cover every non-whitespace character.
     *
     * @param array $tokens the tokens inside the body, its sigil first
     * @phpstan-param list<array{start: int, end: int, kind: string}> $tokens
     */
    public static function format(string $kind, string $source, int $bodyStart, int $bodyEnd, array $tokens): ?string {}
}

/**
 * Formatter entry: formats every tag and the indentation of every line, and refuses a result whose AST differs from
 * the source AST.
 */
final class Formatter
{
    /**
     * Formats the whitespace inside the tags of a template and the indentation of its lines. Other text outside tags,
     * comments and directives are never changed. The source and the result are parsed, and the result is returned
     * only when both ASTs are equal without their `span` fields and, when lines are indented, without the spaces and
     * tabs at the start of lines of text.
     *
     * Options: `name` (the template name of error results, `template.tpl` by default); `delimiters` (two characters,
     * LEX-22); `range` (byte offsets `start` and `end`: only tags that lie completely inside it and lines that start
     * inside it are formatted); `indent` (the indent unit, a run of spaces or one tab, two spaces by default, or null
     * to keep the indentation of every line); `templateBlocks` (`indent` by default: template blocks add a level like
     * HTML elements; `flat`: they add none).
     *
     * @param array $options
     * @phpstan-param array{
     *     name?: string,
     *     delimiters?: string,
     *     range?: array{start: int, end: int},
     *     indent?: string|null,
     *     templateBlocks?: 'indent'|'flat',
     * } $options
     */
    public static function format(
        string $source,
        array $options = [],
        \Polyspec\Template\Format\Analyzer $analyzer = new \Polyspec\Template\Format\PackageAnalyzer(),
    ): FormatResult {}
}

namespace Polyspec\Template\Expr;

/**
 * Expression token (EXP-1, CNF-13). Offsets are byte indexes into the source.
 * @internal
 */
final class Token
{
    public readonly string $type;

    public readonly string $value;

    public readonly int $start;

    public readonly int $end;

    public readonly ?string $decoded;

    public function __construct(string $type, string $value, int $start, int $end, ?string $decoded = null) {}
}

/**
 * Expression tokens as defined in EXP-1 to EXP-6 and CNF-13.
 * @internal
 */
final class Lexer
{
    /** @var string|null close delimiter character, or null for a bare expression */
    public readonly ?string $close;

    public readonly int $closeCount;

    /** @var int|null byte index of the tag start, or null for a bare expression */
    public readonly ?int $openIndex;

    /**
     * @param string|null $close close delimiter character, or null for a bare expression
     * @param int|null $openIndex byte index of the tag start, or null for a bare expression
     */
    public function __construct(
        \Polyspec\Template\Source $source,
        int $start,
        ?string $close,
        int $closeCount,
        ?int $openIndex,
        string $template,
    ) {}

    public function error(string $code, int $start, int $end, string $message): \Polyspec\Template\TemplateError {}

    public function peek(): Token {}

    public function next(): Token {}

    /**
     * Tokens consumed by the parser, including the closing delimiter.
     *
     * @return list<Token>
     */
    public function consumed(): array {}

    /**
     * Byte index after the last consumed token.
     */
    public function consumedEnd(): int {}

    public function text(): string {}

    /**
     * Reads a string literal starting at the quote at $start (EXP-3).
     *
     * @return array{0: string, 1: int} decoded text and the index after the closing quote
     */
    public static function stringLiteral(\Polyspec\Template\Source $source, int $start, string $template): array {}
}

/**
 * Expression parser as defined in EXP-7 to EXP-16 and AST-4, AST-5.
 * Nodes are nested arrays with the fields of docs/spec/ast.md.
 * @internal
 */
final class Parser
{
    public const int DEPTH_LIMIT = 64;

    public readonly Lexer $lexer;

    public function __construct(
        \Polyspec\Template\Source $source,
        int $start,
        ?string $close,
        int $closeCount,
        ?int $openIndex,
        string $template,
    ) {}

    public function peek(): Token {}

    public function next(): Token {}

    public function unexpected(Token $token): \Polyspec\Template\TemplateError {}

    public function expect(string $type): Token {}

    /**
     * Consumes the close delimiter of a tag (LEX-11) and returns the index after it.
     */
    public function expectClose(): int {}

    /**
     * @return array<string, mixed>
     */
    public function parseExpression(): array {}

    /**
     * @return array<string, mixed>
     */
    public function parsePostfix(bool $adjacentOnly): array {}
}

namespace Polyspec\Template;

/**
 * The AST helpers of docs/spec/ast.md: the node shape and the canonical JSON of an AST (AST-7, AST-10). The array
 * constant LOOP_META_FIELDS is declared at module start, since gen_stub does not take an array constant.
 */
final class Ast
{
    /** @internal */
    public static function isLoopMetaField(string $name): bool {}

    /**
     * @param array $fields
     * @phpstan-param array<string, mixed> $fields
     * @return array
     * @phpstan-return array<string, mixed>
     * @internal
     */
    public static function node(string $type, array $fields, int $start, int $end): array {}

    public static function toJson(mixed $node): string {}
}

namespace Polyspec\Template\Parser;

/**
 * Tag start detection (LEX-5, LEX-6, LEX-9, LEX-17, LEX-18) and delimiter validation (LEX-21). The array constants
 * SIGILS and WRAPPERS are declared at module start, since gen_stub does not take an array constant.
 * @internal
 */
final class Scanner
{
    public static function skipHorizontalSpace(string $text, int $index): int {}

    public static function isHorizontalSpace(string $char): bool {}

    /**
     * Returns the sigil after the open delimiter at $open, or null (LEX-5).
     */
    public static function sigilAfter(string $text, int $open): ?string {}

    /**
     * Whether the open delimiter at $open starts a tag (LEX-5 or LEX-6).
     */
    public static function startsTag(string $text, int $open, string $close): bool {}

    /**
     * @return array|null
     * @phpstan-return array{0: string, 1: string}|null
     */
    public static function wrappedTagAt(string $text, int $index, string $open, string $close): ?array {}

    /**
     * LEX-21.
     */
    public static function isDelimiterChar(string $char): bool {}

    /**
     * @return array|null
     * @phpstan-return array{0: string, 1: string}|null open and close
     */
    public static function parseDelimiters(string $value): ?array {}
}

/**
 * Standalone line groups (LEX-14, LEX-15).
 * @internal
 */
final class Standalone
{
    /**
     * Returns the byte ranges [start, end) that standalone line groups remove from the output.
     *
     * @param array $tags
     * @phpstan-param list<array{start: int, end: int, echo: bool, kind: string, bodyStart: int, bodyEnd: int}> $tags
     * @return array
     * @phpstan-return list<array{0: int, 1: int}>
     */
    public static function ranges(string $text, array $tags): array {}
}

/**
 * The template parser (EDT-8, GRM-*): the AST of a template, and the AST with the accepted tags and their tokens.
 * @internal
 */
final class Parser
{
    /**
     * A delimiter is exactly one byte; any other string is a ValueError.
     */
    public function __construct(\Polyspec\Template\Source $source, string $open = '{', string $close = '}') {}

    /**
     * @return array<string, mixed>
     */
    public static function parse(\Polyspec\Template\Source $source, string $open = '{', string $close = '}'): array {}

    /**
     * Parses a template once and returns its AST with the accepted tags and the EDT-8 tokens of their parts.
     *
     * @return array
     * @phpstan-return array{
     *     ast: array<string, mixed>,
     *     tags: list<array{start: int, end: int, echo: bool, kind: string, bodyStart: int, bodyEnd: int}>,
     *     tokens: list<array{start: int, end: int, kind: string}>,
     * }
     */
    public static function analyze(\Polyspec\Template\Source $source, string $open = '{', string $close = '}'): array {}
}

/**
 * Path tokens (GRM-3) and block tag bodies (GRM-13 to GRM-15).
 * @internal
 */
final class BlockTag
{
    public function __construct(\Polyspec\Template\Source $source, string $template, string $close, int $closeCount) {}

    /**
     * GRM-12: `+ path`.
     *
     * @return array
     * @phpstan-return array{path: string, start: int, end: int, quoted: bool}
     */
    public function readIncludePath(int $index): array {}

    /**
     * GRM-13 to GRM-15: `# [id] [path] {scope_item}`.
     *
     * @return array
     * @phpstan-return array{
     *     id: string|null,
     *     path: string|null,
     *     scope: list<array{name: string, expr: array<string, mixed>}>,
     *     words: list<array{start: int, end: int, quoted: bool}>,
     *     end: int,
     * }
     */
    public function readBlockBody(int $index): array {}
}
