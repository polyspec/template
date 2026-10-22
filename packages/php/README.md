<!-- doc-id: packages-template-php-readme -->
# polyspec/template

[한국어](README.ko.md).

PHP implementation of the template language: lexer, parser, renderer, built-in functions and a command line interface. PHP 8.4 or later with the `mbstring` extension is required.

## Install

```sh
composer require polyspec/template
```

## Render

```php
use Polyspec\Template\AstProgram;
use Polyspec\Template\Engine;
use Polyspec\Template\Loader\FilesystemLoader;

$program = new AstProgram(new FilesystemLoader('templates'));
$program->register('greet', fn (array $args): string => 'Hello, ' . $args[0]);
$engine = new Engine($program);
$assign = ['title' => 'Home'];
$html = $engine->render('layout', $assign, [
    'define' => ['layout' => ['template' => 'layout.tpl'], 'content' => ['template' => 'pages/home.tpl']],
    'env' => ['timezone' => '+09:00', 'now' => time()],
]);
```

Assign data is a PHP array or a value produced by `Polyspec\Template\Value\Json::parse()`. A PHP array is a list when `array_is_list()` is true and a map otherwise; integer keys become string keys.

## Parse

```php
use Polyspec\Template\Ast;
use Polyspec\Template\AstProgram;

$ast = AstProgram::parse(file_get_contents('layout.tpl'), 'layout.tpl');
$json = Ast::toJson($ast);
```

A parsed template can be passed to `render()` or stored in an `ArrayLoader`.

## API

| Member | Description |
| --- | --- |
| `AstProgram::parse(string $source, string $name, array $options = [])` | Parses one template into its AST (nested arrays). `$options['delimiters']` selects the delimiters. |
| `AstProgram::decodeTemplate(string $json)` | Reads the AST JSON text into the arrays that `parse` returns, validated with opis/json-schema against `contracts/schema/ast.schema.json`, which the package holds as `resources/ast.schema.json`. JSON that the schema rejects fails with an `AstDecodeError` whose `path` is the JSON Pointer of the invalid node, and text that is not JSON with a `JsonException` (AST-10). |
| `AstProgram::analyze(string $source, string $name, array $options = [])` | Parses one template once and returns `ast`, the accepted `tags` (`kind`, `start`, `end`, `bodyStart`, `bodyEnd`) and the EDT-8 `tokens` (`start`, `end`, `kind`) of every part of a tag. Offsets are UTF-8 byte offsets after a leading byte order mark. |
| `Formatter::format(string $source, array $options = [], Analyzer $analyzer = new PackageAnalyzer())` | `Polyspec\Template\Format`: formats the whitespace inside tags and the indentation of lines, and returns a `FormatResult` with the text, or a `FormatError` (`reason` `parse`, `invariant` or `html`, `code`, `line`, `col`, `message`). Options: `name`, `delimiters`, `range`, `indent` (a run of spaces or one tab, two spaces by default, null keeps every line's indentation) and `templateBlocks` (`indent` or `flat`). The result is returned only when it parses to the same AST without spans (and without line indentation when lines are indented); formatting it again changes nothing. An `Analyzer` supplies another parser, such as the one of the PHP extension. |
| `new AstProgram(?LoaderInterface $loader = null, array $options = [])` | Creates an AST program. Options: `functions`, `limits`, `delimiters`. |
| `new Engine(Program $program)` | Creates an engine that delegates to one AST or generated program. |
| `$engine->render(string|array $target, mixed $assign = [], array $options = [])` | Renders a template name or a parsed template. `$assign` contains variables; options are `define` and `env`. Binding follows VAL-13: a closure or a resource is `E_DATA_UNSUPPORTED_TYPE`, a key that is not valid UTF-8 is `E_DATA_INVALID_UTF8`, and lists and maps nested deeper than 64 levels are `E_DATA_DEPTH`. Only public properties and methods of an object are visible, whatever the class scope of the caller. |
| `BoundMap::bind(mixed $value)`, `BoundMap::merge(mixed $first, mixed $second)` | `bind` checks data once and returns a `BoundMap`; null and `[]` give the empty bound map. `merge` combines two bound maps, and an entry of `$second` replaces the entry of `$first` with the same key. `render` and `prepare` take a bound map as `$assign` and as definition `data` without binding it again; at another position, and a bound map of the PHP extension at every position, it fails with `E_DATA_UNSUPPORTED_TYPE` (VAL-22). The class is final and cannot be instantiated, cloned or unserialized. Errors have no template and no position (ERR-14). |
| generated PHP program | The compiler writes a generated program as one PSR-4 file per class in the namespace given by `--php-namespace` or the `phpNamespace` option of `compileFiles`; map the namespace to the output directory in `autoload.psr-4` of `composer.json` and instantiate it as `new \\Your\\Namespace\\GeneratedProgram($runtime)`. |
| `$astProgram->register(string $name, callable $fn)` | Registers a host function `fn(array $args, array $env): mixed`. Arguments have the form of VAL-21: a number is a `float`, a safe string is a `string`, a list is a list array, a map is an array in entry order and a native object is the original PHP object. |
| `ArrayLoader`, `FilesystemLoader` | In-memory and filesystem loaders. An exception that a loader throws fails the render with `E_LOAD_FAILED`; `FilesystemLoader` throws one for a regular file that cannot be read. |
| `Json::parse(string $bytes)` | Order-preserving JSON parser for assign data. Text that is not one JSON document is a `BindError` with `E_DATA_INVALID_JSON`. |
| `TemplateError` | Exception with `errorCode`, `template`, `errorLine`, `errorCol`, `offset`, `end` and `toArray()`. |
| `SafeString` | A string that the echo tag writes without escaping. |

## Command line

```sh
packages/cli/php/bin/template.php parse [--root DIR] [--delimiters OC] FILE
packages/cli/php/bin/template.php render [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] FILE
packages/cli/php/bin/template.php tokens [--root DIR] [--delimiters OC] FILE
packages/cli/php/bin/template.php format [--indent none|tab|N] [--delimiters OC] FILE
```

`parse` prints the AST JSON. `render` prints the output. `tokens` prints the EDT-8 tokens as `[start, end, type]` JSON. A template error prints the error JSON on stderr and exits with status 2. `format` prints the formatted text without adding a newline (indent unit `N` spaces from 1 to 8, `tab`, or `none` to keep every line's indentation; two spaces by default); a format error prints `{"reason","code","line","col","message"}` on stderr and exits with status 2.

The command is a Symfony Console application (`Polyspec\Template\Cli\CommandLine`, the runtime dependency `symfony/console`), so the options come before FILE, an option takes its value as `--name value` or `--name=value`, and a usage error prints the usage of the command and exits with status 1.

The same `packages/cli/php/bin/template.php` runs on the PHP extension `polyspec_template` when PHP loads it, with `-d extension=var/php-ext/polyspec_template.so` or as installed by PIE from the package `polyspec/template-php-ext` (`pie install polyspec/template-php-ext`): the classes of the library are then the classes of the extension, registered under their names. Without the extension the same command runs the PHP implementation of the library; no other command line exists for the extension.

## Development

```sh
make build-php
make test-php
make template-lint-php-format
```

The package has no lock of its own: in the repository, `composer install` at the root installs it with its dependencies into the root `vendor/` through the `path` repository of the root `composer.json`, and `make test-php` runs `vendor/bin/phpunit` of that directory with `phpunit.xml` of the package.

Tests are in `tests/`. The conformance cases and the expression fixtures of the repository run in-process.
