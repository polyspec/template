<?php

declare(strict_types=1);

namespace Polyspec\Template\Cli;

use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Input\InputInterface;

/**
 * `parse [--root DIR] [--delimiters OC] FILE`: prints the AST JSON (CNF-4).
 */
#[AsCommand(name: 'parse', description: 'Print the AST JSON of FILE')]
final class ParseCommand extends TemplateCommand
{
    protected function result(InputInterface $input, string $file, string $name, string $root, array $options): string
    {
        return $this->runtime->parseJson(self::read($file), $name, $options);
    }
}
