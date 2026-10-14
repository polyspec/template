<?php

declare(strict_types=1);

namespace Polyspec\Showcase\Generated\EmptyState;

use InvalidArgumentException;
use Polyspec\Template\InternalBoundary;
use Polyspec\Template\PreparedRender;
use Polyspec\Template\Program;
use Polyspec\Template\Render\RuntimeEnvironment;
use Polyspec\Template\TemplateError;
use Polyspec\Template\Value\BindError;

final class GeneratedProgram implements Program
{
    public readonly RuntimeEnvironment $runtime;

    public function __construct(?RuntimeEnvironment $runtime = null)
    {
        $this->runtime = $runtime ?? new RuntimeEnvironment();
    }

    public function prepare(string|array $target, mixed $assign = [], array $options = []): PreparedRender
    {
        if (!is_string($target)) {
            throw new InvalidArgumentException('generated target must be a template name');
        }

        return InternalBoundary::run($target, fn (): PreparedRender => $this->prepareBound($target, $assign, $options));
    }

    public function render(string|array $target, mixed $assign = [], array $options = []): string
    {
        return $this->prepare($target, $assign, $options)->render();
    }

    private function prepareBound(string $target, mixed $assign, array $options): PreparedRender
    {
        try {
            [$typedAssign, $rootData] = GeneratedRuntime::bindAssign($assign);
            [$definitions, $targets] = GeneratedRuntime::bindDefinitions($options['define'] ?? []);
            $env = GeneratedRuntime::env($options['env'] ?? []);
        } catch (BindError $error) {
            throw TemplateError::withoutPosition($error->errorCode, $target, $error->getMessage());
        }
        $resolved = $targets[$target] ?? null;
        $targetName = $resolved['target'] ?? $target;
        $html = $resolved['html'] ?? null;
        $execution = new GeneratedExecution($targetName, $typedAssign, $definitions, $rootData, $env, $this->runtime, $html);

        return new PreparedRender($target, $execution);
    }
}
