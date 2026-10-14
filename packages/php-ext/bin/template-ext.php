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

// Composer installs no package of type php-ext (PIE builds it), so no proxy of vendor/bin runs this command: it runs
// from the checkout with the autoloader of the development root composer.json of the repository.
require dirname(__DIR__, 3) . '/vendor/autoload.php';

if (!extension_loaded('polyspec_template')) {
    fwrite(STDERR, "the polyspec_template extension is not loaded\n");
    exit(1);
}

exit(CommandLine::application('template-ext', new NativeRuntime())->run());
