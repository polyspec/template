<?php

declare(strict_types=1);

namespace Polyspec\Template\Render;

use Polyspec\Template\AstProgram;
use Polyspec\Template\Loader\Path;

/**
 * Statement rendering: text, echo, if, loop, assignment, include, block (RT-11 to RT-32).
 */
final class Renderer
{
    private readonly Evaluator $evaluator;

    public function __construct(private readonly Context $context, private readonly AstProgram $program)
    {
        $this->evaluator = new Evaluator($context);
    }

    /**
     * @param list<array<string, mixed>> $nodes
     */
    public function renderNodes(array $nodes, Frame $frame, Scope $scope): void
    {
        foreach ($nodes as $node) {
            $this->renderNode($node, $frame, $scope);
        }
    }

    /**
     * @param array<string, mixed> $node
     */
    private function renderNode(array $node, Frame $frame, Scope $scope): void
    {
        $this->context->at($frame, $node['span']);
        switch ($node['type']) {
            case 'Text':
                $this->context->write($node['value']);

                return;
            case 'Echo':
                $value = $this->evaluator->evaluate($node['expr'], $frame, $scope);
                $this->context->write($this->evaluator->runtime->escape($value, $frame, $node['expr']['span']));

                return;
            case 'If':
                foreach ($node['branches'] as $branch) {
                    if ($this->evaluator->runtime->truthy($this->evaluator->evaluate($branch['test'], $frame, $scope))) {
                        $this->renderNodes($branch['body'], $frame, $scope);

                        return;
                    }
                }
                if ($node['else'] !== null) {
                    $this->renderNodes($node['else'], $frame, $scope);
                }

                return;
            case 'For':
                $this->renderFor($node, $frame, $scope);

                return;
            case 'Set':
                $scope->locals->set($node['name'], $this->evaluator->evaluate($node['expr'], $frame, $scope));

                return;
            case 'Include':
                $this->renderInclude($node['path'], $node['span'], $frame, $scope);

                return;
            case 'Block':
                $this->renderBlock($node, $frame, $scope);

                return;
            case 'IfBlock':
                if (isset($this->context->registry[$node['id']])) {
                    $this->renderNodes($node['body'], $frame, $scope);
                } elseif ($node['else'] !== null) {
                    $this->renderNodes($node['else'], $frame, $scope);
                }

                return;
        }
    }

    /**
     * @param array<string, mixed> $node
     */
    private function renderFor(array $node, Frame $frame, Scope $scope): void
    {
        $iterable = $this->evaluator->evaluate($node['iter'], $frame, $scope);
        $entries = $this->evaluator->runtime->entries($iterable, $frame, $node['span']);
        if ($entries === []) {
            if ($node['empty'] !== null) {
                $this->renderNodes($node['empty'], $frame, $scope);
            }

            return;
        }
        $name = $node['name'];
        $hadLocal = $scope->locals->has($name);
        $previous = $scope->locals->get($name);
        $stackBefore = $scope->loops[$name] ?? [];
        $size = count($entries);
        try {
            foreach ($entries as $index => [$key, $value]) {
                $this->context->iterations++;
                $this->evaluator->runtime->limit('iteration', $this->context->iterations, $frame, $node['span']);
                $meta = ['index' => $index, 'key' => $key, 'value' => $value, 'first' => $index === 0, 'last' => $index === $size - 1, 'size' => $size];
                $scope->loops[$name] = [...$stackBefore, $meta];
                $scope->locals->set($name, $value);
                $this->renderNodes($node['body'], $frame, $scope);
            }
        } finally {
            $scope->loops[$name] = $stackBefore;
            if ($hadLocal) {
                $scope->locals->set($name, $previous);
            } else {
                $scope->locals->remove($name);
            }
        }
    }

    /**
     * @param array{0: int, 1: int} $span
     */
    private function resolve(string $path, Frame $frame, array $span): string
    {
        $name = Path::resolve($frame->name, $path);
        if ($name === null) {
            throw $this->context->fail('E_LOAD_OUTSIDE_ROOT', $frame, $span, json_encode($path) . ' leaves the loader root');
        }

        return $name;
    }

    /**
     * @param array{0: int, 1: int} $span
     */
    private function renderInclude(string $path, array $span, Frame $frame, Scope $scope): void
    {
        $name = $this->resolve($path, $frame, $span);
        $template = $this->program->loadTemplate($name, $frame, $span);
        $this->context->enter($name, $frame, $span);
        try {
            $included = new Frame($template['ast']['name'], $template['lines'], $frame->context);
            $this->renderNodes($template['ast']['body'], $included, $scope);
        } finally {
            $this->context->leave();
        }
    }

    /**
     * @param array<string, mixed> $node
     */
    private function renderBlock(array $node, Frame $frame, Scope $scope): void
    {
        if ($node['id'] !== null && $node['path'] === null) {
            $entry = $this->context->registry[$node['id']] ?? null;
            if ($entry === null) {
                throw $this->context->fail('E_RUNTIME_BLOCK_UNDEFINED', $frame, $node['span'], 'define ' . $node['id'] . ' is not registered');
            }
        } else {
            $name = $this->resolve((string) $node['path'], $frame, $node['span']);
            if ($node['id'] !== null) {
                $registered = $this->context->registry[$node['id']] ?? null;
                if ($registered !== null) {
                    if (isset($registered['html']) || $registered['template'] !== $name) {
                        throw $this->context->fail('E_RUNTIME_BLOCK_REDEFINED', $frame, $node['span'], 'define ' . $node['id'] . ' is registered with a different template');
                    }
                    $entry = $registered;
                } else {
                    $entry = ['template' => $name, 'data' => null];
                    $this->context->registry[$node['id']] = $entry;
                }
            } else {
                $entry = ['template' => $name, 'data' => null];
            }
        }
        if (isset($entry['html'])) {
            $this->context->write($entry['html']);

            return;
        }
        $data = $this->context->rootData->copy();
        if ($entry['data'] !== null) {
            foreach ($entry['data']->entries() as $key => $value) {
                $data->set($key, $value);
            }
        }
        foreach ($node['scope'] as $item) {
            $data->set($item['name'], $this->evaluator->evaluate($item['expr'], $frame, $scope));
        }
        $template = $this->program->loadTemplate($entry['template'], $frame, $node['span']);
        $this->context->enter($entry['template'], $frame, $node['span']);
        try {
            $this->renderNodes($template['ast']['body'], new Frame($template['ast']['name'], $template['lines'], $data), new Scope());
        } finally {
            $this->context->leave();
        }
    }
}
