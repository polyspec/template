<?php

declare(strict_types=1);

namespace Polyspec\Template\Render;

use Polyspec\Template\AstProgram;
use Polyspec\Template\TemplateError;
use Polyspec\Template\Value\MapValue;

/**
 * Render state: output, template definition registry, chain, limits and error creation (docs/spec/runtime.md).
 */
final class Context
{
    /** @var array<string, array{template: string, data: MapValue|null}|array{html: string}> */
    public array $registry = [];
    /** @var list<string> */
    public array $chain = [];
    public int $iterations = 0;
    private string $output = '';
    private int $outputBytes = 0;
    private ?Frame $currentFrame = null;
    /** @var array{0: int, 1: int} */
    private array $currentSpan = [0, 0];

    /**
     * @param array{timezone: string, now: float} $env
     */
    public function __construct(
        public readonly AstProgram $engine,
        public readonly MapValue $rootData,
        public readonly array $env,
        public readonly string $entryName,
    ) {
    }

    public function write(string $text): void
    {
        if ($text === '') {
            return;
        }
        $this->outputBytes += strlen($text);
        if ($this->outputBytes > $this->engine->limits['outputBytes']) {
            throw $this->fail('E_RUNTIME_LIMIT', $this->currentFrame, $this->currentSpan, 'output exceeds ' . $this->engine->limits['outputBytes'] . ' bytes');
        }
        $this->output .= $text;
    }

    public function output(): string
    {
        return $this->output;
    }

    /**
     * @param array{0: int, 1: int} $span
     */
    public function at(Frame $frame, array $span): void
    {
        $this->currentFrame = $frame;
        $this->currentSpan = $span;
    }

    /**
     * @param array{0: int, 1: int}|null $span
     */
    public function fail(string $code, ?Frame $frame, ?array $span, string $message): TemplateError
    {
        if ($frame === null || $span === null) {
            return TemplateError::withoutPosition($code, $frame !== null ? $frame->name : $this->entryName, $message);
        }

        return TemplateError::at($code, $frame->name, $frame->lines, $span[0], $span[1], $message);
    }

    /**
     * @param array{0: int, 1: int}|null $span
     */
    public function enter(string $name, ?Frame $frame, ?array $span): void
    {
        if (in_array($name, $this->chain, true)) {
            throw $this->fail('E_LOAD_CYCLE', $frame, $span, "{$name} is already being rendered");
        }
        if (count($this->chain) > $this->engine->limits['depth']) {
            throw $this->fail('E_RUNTIME_DEPTH', $frame, $span, 'nesting depth exceeds ' . $this->engine->limits['depth']);
        }
        $this->chain[] = $name;
    }

    public function leave(): void
    {
        array_pop($this->chain);
    }

}
