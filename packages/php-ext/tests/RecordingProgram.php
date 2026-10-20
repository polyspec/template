<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use Polyspec\Template\PreparedExecution;
use Polyspec\Template\PreparedRender;
use Polyspec\Template\Program;

/** A program that records its calls and fails with its failure when it has one. */
final class RecordingProgram implements Program
{
    /** @var list<array{0: string, 1: string|array<string, mixed>, 2: mixed, 3: array<string, mixed>}> */
    public array $calls = [];

    public function __construct(private readonly ?\Throwable $failure = null)
    {
    }

    public function prepare(string|array $target, mixed $assign = [], array $options = []): PreparedRender
    {
        $this->calls[] = ['prepare', $target, $assign, $options];
        if ($this->failure !== null) {
            throw $this->failure;
        }

        return new PreparedRender('page.tpl', new class implements PreparedExecution {
            public function render(): string
            {
                return 'prepared';
            }
        });
    }

    public function render(string|array $target, mixed $assign = [], array $options = []): string
    {
        $this->calls[] = ['render', $target, $assign, $options];
        if ($this->failure !== null) {
            throw $this->failure;
        }

        return 'rendered';
    }
}
