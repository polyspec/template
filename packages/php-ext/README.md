<!-- doc-id: packages-template-php-ext-readme -->
# polyspec_template PHP extension

[한국어](README.ko.md).

PHP extension that renders templates with an independent implementation in C. It registers the classes of the library under their names (S10), so the API of those classes is documented by the README of `packages/php`. The behaviour is the behaviour of the specification in `docs/spec/`; the PHP implementation `packages/php` and the conformance cases in `tests/cases` define it.

## Build

The sources, `config.m4` and the stub `polyspec_template.stub.php` are in `src/`. The build needs a C compiler and phpize and php-config of the PHP that will load the extension, PHP 8.4 or later.

```sh
make ext
```

`make ext` runs `scripts/build-php-extension.mts`, which builds the extension with phpize, configure and make in a temporary directory, with every compiler warning as an error, and publishes the shared library to `var/build/polyspec_template.so` of the repository. It builds nothing when the sources and the PHP build are unchanged, and it fails when php-config and php of `PATH` are not one PHP. Load the library with the `extension` setting of `php.ini` or with `-d extension=<path>` on the command line.

```sh
php -d extension=var/build/polyspec_template.so -r 'var_dump(extension_loaded("polyspec_template"));'
```

The package has the Composer type `php-ext` with the build path `src`, so PIE builds and installs it into the PHP that runs PIE. A build by hand runs the same steps in `src`:

```sh
cd src && phpize && ./configure && make
```

gen_stub.php of the PHP build generates `src/polyspec_template_arginfo.h` from the stub; the header is committed. After a change of the stub, `make ext-arginfo` generates it again, and the build fails while the header does not match the stub.

`src/polyspec_template.stub.php` holds the signatures for static analysis and is never loaded at runtime.

## Command line

```sh
php -d extension=var/build/polyspec_template.so vendor/bin/template.php parse [--root DIR] [--delimiters OC] FILE
php -d extension=var/build/polyspec_template.so vendor/bin/template.php render [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] FILE
php -d extension=var/build/polyspec_template.so vendor/bin/template.php tokens [--root DIR] [--delimiters OC] FILE
php -d extension=var/build/polyspec_template.so vendor/bin/template.php format [--indent none|tab|N] [--delimiters OC] FILE
```

`parse` prints the AST JSON. `render` prints the output. `tokens` prints the EDT-8 tokens as `[start, end, type]` JSON. A template error prints the error JSON on stderr and exits with status 2. The command is `bin/template.php` of the PHP package `polyspec/template`, whose Composer proxy is `vendor/bin/template.php`: when PHP loads the extension with `-d extension=`, its commands (`Polyspec\Template\Cli\CommandLine`) run on the classes of the extension, which registers them under the names of the library. `format` runs the formatter of the PHP package over the analysis of the extension and prints the formatted text; a format error prints `{"reason","code","line","col","message"}` on stderr and exits with status 2.

The package is the C extension only: Composer installs no package of the type `php-ext`, and PIE builds and installs only the extension, so the package holds no PHP classes and no command. A project that requires `polyspec/template` with Composer and installs the extension with PIE has both. The package has no lock of its own; in this repository the root `composer.json`, which is not published, maps the tests of `tests/`, and `composer install` at the root installs `polyspec/template` into the root `vendor/`.

## Test

```sh
make template-test-ext
```

`make template-test-ext` installs the root `vendor/` with `make build-php`, runs the conformance cases through the command line interface and the suite in `tests/` with PHPUnit through `node_modules/@polyspec/kit/dist/run-tests.mjs phpunit --php-extension`, which loads the built library and prints each test with its elapsed time. The templates of the unit tests are in `tests/templates`.
