#!/usr/bin/env php
<?php

declare(strict_types=1);

// The conformance command line of docs/spec/conformance.md (CNF-4) on this package:
//   parse [--root DIR] [--delimiters OC] FILE
//   render [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] FILE
//   tokens [--root DIR] [--delimiters OC] FILE
//   format [--indent none|tab|N] [--delimiters OC] FILE

use Polyspec\Template\Cli\CommandLine;
use Polyspec\Template\Cli\PackageRuntime;

// Composer sets $_composer_autoload_path in the proxy of vendor/bin; run from the package, the autoloader is its own.
require $_composer_autoload_path ?? __DIR__ . '/../vendor/autoload.php';

exit(CommandLine::application('template', new PackageRuntime())->run());
