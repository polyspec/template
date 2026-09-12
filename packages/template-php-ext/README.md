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
| `new Engine(?string $root, array $options)` | Creates an engine. `$root` is the loader root directory. `$options` accepts `delimiters`, `limits` and `legacy_wrappers`. |
| `Engine::parse(string $source, string $name, array $options): array` | Parses one template and returns the AST as nested arrays. `$options['legacy_wrappers']` enables single-brace comment wrappers. |
| `Engine::parseToJson(string $source, string $name, array $options): string` | Parses one template and returns the AST as JSON text. |
| `$engine->register(string $name, callable $function): void` | Registers a host function `fn(array $args, array $env): mixed`. |
| `$engine->render(string $name, mixed $assign, array $options): string` | Renders a template with PHP assign data. `$options` accepts `define` and `env`. |
| `$engine->renderJson(string $name, string $assign, ?string $define, ?string $env): string` | Renders a template with assign data, template definitions and environment given as JSON text. |
| `TemplateError` | Extends `\Exception`. `getErrorCode()`, `getTemplate()`, `getErrorLine()`, `getErrorCol()`, `getOffset()`, `getEnd()`, `toArray()`. |

The accessors avoid `getCode()`, `getLine()` and `getFile()`, which `\Exception` declares final. `getMessage()` returns the message of the specification.

`renderJson` reads the numbers of the assign data as JSON literals, so an integer literal outside the safe range is reported and a float literal of the same magnitude is accepted. `render` applies the same rules to PHP integers and PHP floats.

`stubs/polyspec_template.stub.php` holds the signatures for static analysis and is never loaded at runtime.

## Command line

```sh
php -d extension=target/release/libpolyspec_template.dylib bin/template-ext.php parse FILE [--root DIR] [--delimiters OC] [--legacy-wrappers true]
php -d extension=target/release/libpolyspec_template.dylib bin/template-ext.php render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] [--legacy-wrappers true]
```

`parse` prints the AST JSON. `render` prints the output. A template error prints the error JSON on stderr and exits with status 2.
Set `legacy_wrappers` or `--legacy-wrappers true` only for consuming applications that use single-brace comment wrappers; the default parser accepts the specification's doubled wrappers.

## Test

```sh
composer install
make test-ext
```

`make test-ext` runs the conformance cases through the command line interface and then `run-tests.sh`, which loads the built library and runs the suite in `tests/`. The templates of the unit tests are in `tests/templates`.
