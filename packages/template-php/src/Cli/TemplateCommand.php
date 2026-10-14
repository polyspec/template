<?php

declare(strict_types=1);

namespace Polyspec\Template\Cli;

use Polyspec\Template\TemplateError;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Exception\InvalidArgumentException;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\ConsoleOutputInterface;
use Symfony\Component\Console\Output\OutputInterface;

/**
 * A command that reads a template FILE under --root (CNF-4 `parse`, `tokens` and `render`): it prints its result on
 * standard output and returns 0, and prints a template error as its JSON on standard error and returns 2. A usage
 * error is an InvalidArgumentException, which Application prints with the usage and turns into status 1.
 */
abstract class TemplateCommand extends Command
{
    public function __construct(protected readonly Runtime $runtime)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addOption('root', null, InputOption::VALUE_REQUIRED, 'the template directory, that of FILE by default')
            ->addOption('delimiters', null, InputOption::VALUE_REQUIRED, 'the two delimiter characters')
            ->addArgument('file', InputArgument::REQUIRED, 'the template file');
    }

    /**
     * The result of the command for FILE, its name under the root, the root and the parser options.
     *
     * @param array{delimiters?: string} $options
     * @throws TemplateError
     */
    abstract protected function result(
        InputInterface $input,
        string $file,
        string $name,
        string $root,
        array $options,
    ): string;

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $file = self::string($input->getArgument('file'));
        $rootOption = $input->getOption('root');
        $filePath = realpath($file);
        $root = $rootOption === null
            ? ($filePath === false ? getcwd() : dirname($filePath))
            : realpath(self::string($rootOption));
        if ($root === false) {
            throw new InvalidArgumentException('invalid --root');
        }
        if ($filePath !== false) {
            if (!str_starts_with($filePath, $root . DIRECTORY_SEPARATOR)) {
                throw new InvalidArgumentException('FILE is outside of --root');
            }
            $name = str_replace(DIRECTORY_SEPARATOR, '/', substr($filePath, strlen($root) + 1));
        } elseif ($this->getName() === 'render' && $rootOption !== null && !str_contains($file, '..')) {
            // render names a template that the loader of --root resolves, which need not be a file.
            $name = str_replace(DIRECTORY_SEPARATOR, '/', ltrim($file, DIRECTORY_SEPARATOR));
        } else {
            throw new InvalidArgumentException("cannot read {$file}");
        }
        $delimiters = $input->getOption('delimiters');
        $options = $delimiters === null ? [] : ['delimiters' => self::string($delimiters)];
        try {
            $output->write($this->result($input, $file, $name, $root, $options), false, OutputInterface::OUTPUT_RAW);
        } catch (TemplateError $error) {
            $flags = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR;
            $json = json_encode($error->toArray(), $flags);
            self::errorOutput($output)->writeln($json, OutputInterface::OUTPUT_RAW);

            return 2;
        }

        return 0;
    }

    /**
     * The bytes of a file the command was given; a file that cannot be read is a usage error.
     */
    protected static function read(string $path): string
    {
        $bytes = is_file($path) ? file_get_contents($path) : false;
        if ($bytes === false) {
            throw new InvalidArgumentException("cannot read {$path}");
        }

        return $bytes;
    }

    /**
     * The value of an argument or an option that the command declares as a single value.
     */
    protected static function string(mixed $value): string
    {
        if (!is_string($value)) {
            throw new \LogicException('a single-valued argument or option holds ' . get_debug_type($value));
        }

        return $value;
    }

    public static function errorOutput(OutputInterface $output): OutputInterface
    {
        return $output instanceof ConsoleOutputInterface ? $output->getErrorOutput() : $output;
    }
}
