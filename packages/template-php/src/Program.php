<?php

declare(strict_types=1);

namespace Polyspec\Template;

/** A complete AST or generated template program. */
interface Program
{
    /**
     * @param string|array<string, mixed> $target
     * @param array{define?: array<string, string|array{template?: string, data?: mixed, html?: string}>, env?: array{timezone?: string, now?: float|int}} $options
     */
    public function prepare(string|array $target, mixed $assign = [], array $options = []): PreparedRender;

    /**
     * @param string|array<string, mixed> $target
     * @param array{define?: array<string, string|array{template?: string, data?: mixed, html?: string}>, env?: array{timezone?: string, now?: float|int}} $options
     */
    public function render(string|array $target, mixed $assign = [], array $options = []): string;
}
