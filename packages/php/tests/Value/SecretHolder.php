<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests\Value;

use Polyspec\Template\AstProgram;

final class SecretHolder
{
    public string $name = 'n';
    private string $secret = 's';

    public function renderInside(AstProgram $program, string $template): string
    {
        return $program->render($template, ['o' => $this]) . ($this->secret === '' ? $this->hidden() : '');
    }

    private function hidden(): string
    {
        return 'h';
    }
}
