# polyspec_template PHP extension

[한국어](README.ko.md).

PHP extension that renders templates with the native implementation. It registers the classes `Polyspec\Template\Native\Engine` and `Polyspec\Template\Native\TemplateError`. The behaviour is the behaviour of the specification in `docs/spec/`.

## Build

The build needs Rust 1.98.1 and the PHP development headers of the PHP that will load the extension.

```sh
make ext
```

The shared library is written to `target/release/libpolyspec_template.dylib` on macOS and `target/release/libpolyspec_template.so` on Linux. Load it with the `extension` setting of `php.ini` or with `-d extension=<path>` on the command line.

```sh
php -d extension=packages/template-php-ext/target/release/libpolyspec_template.dylib -r 'var_dump(extension_loaded("polyspec_template"));'
```

## Render

```php
use Polyspec\Template\Native\Engine;
use Polyspec\Template\Native\TemplateError;

$engine = new Engine('templates');
$engine->register('greet', fn (array $args, array $env) => 'Hello, ' . $args[0]);

try {
    $assign = ['title' => 'Home'];
    echo $engine->render('layout', $assign, [
        'define' => ['layout' => 'layout.tpl', 'content' => ['template' => 'pages/home.tpl']],
        'env' => ['timezone' => '+09:00', 'now' => time()],
    ]);
} catch (TemplateError $error) {
    error_log($error->getErrorCode() . ' at ' . $error->getErrorLine() . ':' . $error->getErrorCol());
}
```

## API

| Member | Description |
| --- | --- |
| `new Engine(?string $root, array $options)` | Creates an engine. `$root` is the loader root directory. `$options` accepts `delimiters` and `limits`. |
| `Engine::parse(string $source, string $name, array $options): array` | Parses one template and returns the AST as nested arrays. |
| `Engine::parseToJson(string $source, string $name, array $options): string` | Parses one template and returns the AST as JSON text. |
| `$engine->register(string $name, callable $function): void` | Registers a host function `fn(array $args, array $env): mixed`. |
| `$engine->registerClass(string $class, string $method, callable $function): void` | Registers the logical class function `Class::method` as `fn(array $args, array $env): mixed`. |
| `$engine->render(string $name, mixed $assign, array $options): string` | Renders a template with PHP assign data. Arrays, `stdClass` and `JsonSerializable` values become template values, and other objects keep their instance with public properties and methods visible (VAL-14, RT-60). `$options` accepts `define` and `env`. |
| `BoundMap::bind(mixed $value)`, `BoundMap::merge(mixed $first, mixed $second)` | `bind` checks data once and returns a `Polyspec\Template\Native\BoundMap`; null and `[]` give the empty bound map. `merge` combines two bound maps, and an entry of `$second` replaces the entry of `$first` with the same key. `render` takes a bound map as `$assign` and as definition `data` without binding it again; `renderJson` does not take one. At another position, and a bound map of the PHP package at every position, it fails with `E_DATA_UNSUPPORTED_TYPE` (VAL-22). The class is final and cannot be instantiated, cloned or unserialized. Errors have no template and no position (ERR-14). |
| `$engine->renderJson(string $name, string $assign, ?string $define, ?string $env): string` | Renders a template with assign data, template definitions and environment given as JSON text. |
| `TemplateError` | Extends `\Exception`. `getErrorCode()`, `getTemplate()`, `getErrorLine()`, `getErrorCol()`, `getOffset()`, `getEnd()`, `toArray()`. |

The accessors avoid `getCode()`, `getLine()` and `getFile()`, which `\Exception` declares final. `getMessage()` returns the message of the specification.

`render` and `renderJson` apply the binding rules of the specification: a number whose magnitude is greater than 2^53 − 1 is `E_DATA_NUMBER_RANGE` whether it is an integer or a float (VAL-2), an array key or property name that is not valid UTF-8 is `E_DATA_INVALID_UTF8`, a closure or a resource is `E_DATA_UNSUPPORTED_TYPE`, and lists and maps nested deeper than 64 levels, including a cyclic structure, are `E_DATA_DEPTH` (VAL-20). Host functions, class functions and methods receive the same arguments as in the PHP AST runtime (VAL-21): a number is a `float`, a safe string is a `string`, a list is a list array, a map is an array in entry order whose decimal integer keys are integer keys, and a native object is the original PHP object (VAL-18). Two native objects are equal when they are the same PHP object (EXP-39). JSON text that is not one JSON document is `E_DATA_INVALID_JSON`, and a template file that exists but cannot be read is `E_LOAD_FAILED`. Only public properties and methods are visible, whatever the class scope of the caller (VAL-19), and `__get` and `__call` are not consulted. Every method of the extension reports a Rust panic as `E_INTERNAL` instead of aborting the PHP process (ERR-13).

`stubs/polyspec_template.stub.php` holds the signatures for static analysis and is never loaded at runtime.

## Command line

```sh
php -d extension=target/release/libpolyspec_template.dylib bin/template-ext.php parse FILE [--root DIR] [--delimiters OC]
php -d extension=target/release/libpolyspec_template.dylib bin/template-ext.php render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC]
```

`parse` prints the AST JSON. `render` prints the output. A template error prints the error JSON on stderr and exits with status 2.
## Test

```sh
composer install
make test-ext
```

`make test-ext` runs the conformance cases through the command line interface and then `run-tests.sh`, which loads the built library and runs the suite in `tests/`. The templates of the unit tests are in `tests/templates`.
