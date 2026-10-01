# polyspec/template

[한국어](README.ko.md).

PHP implementation of the template language: lexer, parser, renderer, built-in functions and a command line interface. PHP 8.2 or later with the `mbstring` extension is required.

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
| `new AstProgram(?LoaderInterface $loader = null, array $options = [])` | Creates an AST program. Options: `functions`, `limits`, `delimiters`. |
| `new Engine(Program $program)` | Creates an engine that delegates to one AST or generated program. |
| `$engine->render(string|array $target, mixed $assign = [], array $options = [])` | Renders a template name or a parsed template. `$assign` contains variables; options are `define` and `env`. Binding follows VAL-14: a closure or a resource is `E_DATA_UNSUPPORTED_TYPE`, a key that is not valid UTF-8 is `E_DATA_INVALID_UTF8`, and lists and maps nested deeper than 64 levels are `E_DATA_DEPTH`. Only public properties and methods of an object are visible, whatever the class scope of the caller. |
| generated PHP program | The compiler declares a generated program in the namespace given by `--php-namespace` or the `phpNamespace` option of `compileSource`; instantiate it as `new \\Your\\Namespace\\GeneratedProgram($runtime)`. |
| `$astProgram->register(string $name, callable $fn)` | Registers a host function `fn(array $args, array $env): mixed`. Arguments have the form of VAL-21: a number is a `float`, a safe string is a `string`, a list is a list array, a map is an array in entry order and a native object is the original PHP object. |
| `ArrayLoader`, `FilesystemLoader` | In-memory and filesystem loaders. An exception that a loader throws fails the render with `E_LOAD_FAILED`; `FilesystemLoader` throws one for a regular file that cannot be read. |
| `Json::parse(string $bytes)` | Order-preserving JSON parser for assign data. Text that is not one JSON document is a `BindError` with `E_DATA_INVALID_JSON`. |
| `TemplateError` | Exception with `errorCode`, `template`, `errorLine`, `errorCol`, `offset`, `end` and `toArray()`. |
| `SafeString` | A string that the echo tag writes without escaping. |

## Command line

```sh
php bin/template.php parse FILE [--root DIR] [--delimiters OC]
php bin/template.php render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC]
```

`parse` prints the AST JSON. `render` prints the output. A template error prints the error JSON on stderr and exits with status 2.
## Development

```sh
composer install
vendor/bin/pint --test
vendor/bin/phpunit
```

Tests are in `tests/`. The conformance cases and the expression fixtures of the repository run in-process.
