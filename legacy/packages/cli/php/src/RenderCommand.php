<?php

declare(strict_types=1);

namespace Polyspec\Template\Cli;

use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;

/**
 * `render [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] FILE`: prints the output (CNF-4). A relative
 * data, define or env file is read from the root.
 */
#[AsCommand(name: 'render', description: 'Render FILE')]
final class RenderCommand extends TemplateCommand
{
    protected function configure(): void
    {
        $this
            ->addOption('data', null, InputOption::VALUE_REQUIRED, 'the JSON file of the data')
            ->addOption('define', null, InputOption::VALUE_REQUIRED, 'the JSON file of the defines')
            ->addOption('env', null, InputOption::VALUE_REQUIRED, 'the JSON file of the environment');
        parent::configure();
    }

    protected function result(
        InputInterface $input,
        string $file,
        string $name,
        string $root,
        array $options,
    ): string {
        $json = static function (mixed $path) use ($root): ?string {
            if ($path === null) {
                return null;
            }
            $path = self::string($path);

            return self::read(str_starts_with($path, '/') ? $path : $root . '/' . $path);
        };

        return $this->runtime->render(
            $root,
            $name,
            $options,
            $json($input->getOption('data')),
            $json($input->getOption('define')),
            $json($input->getOption('env')),
        );
    }
}
