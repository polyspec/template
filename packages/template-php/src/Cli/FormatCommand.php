<?php

declare(strict_types=1);

namespace Polyspec\Template\Cli;

use Polyspec\Template\Format\Formatter;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Exception\InvalidArgumentException;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

/**
 * `format [--indent none|tab|N] [--delimiters OC] FILE` (CNF-4): prints the formatted text without adding a newline and
 * returns 0, and prints a format error as the JSON {"reason","code","line","col","message"} on standard error and
 * returns 2. The formatter runs over the parser of the runtime, so the formatting is defined once.
 */
#[AsCommand(name: 'format', description: 'Print FILE formatted')]
final class FormatCommand extends Command
{
    public function __construct(private readonly Runtime $runtime)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addOption('indent', null, InputOption::VALUE_REQUIRED, 'none, tab or a number of spaces from 1 to 8', '2')
            ->addOption('delimiters', null, InputOption::VALUE_REQUIRED, 'the two delimiter characters')
            ->addArgument('file', InputArgument::REQUIRED, 'the template file');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $file = $input->getArgument('file');
        $indent = $input->getOption('indent');
        $delimiters = $input->getOption('delimiters');
        if (!is_string($file) || !is_string($indent)) {
            throw new \LogicException('FILE and --indent hold one value');
        }
        $options = ['name' => $file];
        if ($indent === 'none') {
            $options['indent'] = null;
        } elseif ($indent === 'tab') {
            $options['indent'] = "\t";
        } elseif (preg_match('/^[1-8]$/D', $indent) === 1) {
            $options['indent'] = str_repeat(' ', (int) $indent);
        } else {
            throw new InvalidArgumentException('--indent requires a number from 1 to 8, tab or none');
        }
        if ($delimiters !== null) {
            if (!is_string($delimiters) || mb_strlen($delimiters, 'UTF-8') !== 2) {
                throw new InvalidArgumentException('--delimiters requires two characters');
            }
            $options['delimiters'] = $delimiters;
        }
        $source = is_file($file) ? file_get_contents($file) : false;
        if ($source === false) {
            throw new InvalidArgumentException("cannot read {$file}");
        }
        $result = Formatter::format($source, $options, $this->runtime->analyzer());
        if ($result->error !== null) {
            $flags = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR;
            $json = json_encode($result->error->toArray(), $flags);
            TemplateCommand::errorOutput($output)->write($json, false, OutputInterface::OUTPUT_RAW);

            return 2;
        }
        $output->write((string) $result->text, false, OutputInterface::OUTPUT_RAW);

        return 0;
    }
}
