#!/usr/bin/env php
<?php

declare(strict_types=1);

// The conformance command line of docs/spec/conformance.md (CNF-4) on the native engine, with the commands of the PHP
// package:
//   parse [--root DIR] [--delimiters OC] FILE
//   render [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] FILE
//   tokens [--root DIR] [--delimiters OC] FILE
//   format [--indent none|tab|N] [--delimiters OC] FILE

use Polyspec\Template\Cli\CommandLine;
use Polyspec\Template\Native\NativeRuntime;

// Composer sets $_composer_autoload_path in the proxy of vendor/bin; run from the package, the autoloader is its own.
require $_composer_autoload_path ?? __DIR__ . '/../vendor/autoload.php';

if (!extension_loaded('polyspec_template')) {
    fwrite(STDERR, "the polyspec_template extension is not loaded\n");
    exit(1);
}

exit(CommandLine::application('template-ext', new NativeRuntime())->run());
