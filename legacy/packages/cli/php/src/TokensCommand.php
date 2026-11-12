<?php

declare(strict_types=1);

namespace Polyspec\Template\Cli;

use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Input\InputInterface;

/**
 * `tokens [--root DIR] [--delimiters OC] FILE`: prints the EDT-8 tokens as [start, end, type] JSON, with UTF-8 byte
 * offsets after the byte order mark, as AST spans count them (CNF-4).
 */
#[AsCommand(name: 'tokens', description: 'Print the EDT-8 tokens of FILE')]
final class TokensCommand extends TemplateCommand
{
    protected function result(InputInterface $input, string $file, string $name, string $root, array $options): string
    {
        $tokens = $this->runtime->analyzer()->analyze(self::read($file), $name, $options)['tokens'];
        $triples = array_map(
            static fn (array $token): array => [$token['start'], $token['end'], $token['kind']],
            $tokens,
        );

        return json_encode($triples, JSON_THROW_ON_ERROR);
    }
}
