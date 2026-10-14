<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use Polyspec\Template\Native\Engine;

final class SecretHolder
{
    public string $name = 'n';
    private string $secret = 's';

    public function renderInside(Engine $engine, string $template): string
    {
        return $engine->render($template, ['o' => $this]) . ($this->secret === '' ? $this->hidden() : '');
    }

    private function hidden(): string
    {
        return 'h';
    }
}
