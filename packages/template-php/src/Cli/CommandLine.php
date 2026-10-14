<?php

declare(strict_types=1);

namespace Polyspec\Template\Cli;

use Symfony\Component\Console\Application;

/**
 * The conformance command line of docs/spec/conformance.md (CNF-4) as a Symfony Console application: the subcommands
 * parse, render, tokens and format, each `<subcommand> [options] FILE`, over a runtime. Status 0 is success, 1 a usage
 * error, which Symfony Console prints with the usage of the command, and 2 a template or format error.
 */
final class CommandLine
{
    public static function application(string $name, Runtime $runtime): Application
    {
        $application = new Application($name);
        $application->addCommands([
            new ParseCommand($runtime),
            new RenderCommand($runtime),
            new TokensCommand($runtime),
            new FormatCommand($runtime),
        ]);

        return $application;
    }
}
