<?php

declare(strict_types=1);

namespace Polyspec\Template\Render;

use Polyspec\Template\Escape;
use Polyspec\Template\Loader\Path;
use Polyspec\Template\Value\MapValue;
use Polyspec\Template\Value\SafeString;
use Polyspec\Template\Value\Value;

/**
 * Statement rendering: text, echo, if, loop, assignment, include, block (RT-11 to RT-32).
 */
final class Renderer
{
    private readonly Evaluator $evaluator;

    public function __construct(private readonly Context $context)
    {
        $this->evaluator = new Evaluator($context);
    }

    /**
     * @param list<array<string, mixed>> $nodes
     */
    public function renderNodes(array $nodes, Frame $frame): void
    {
        foreach ($nodes as $node) {
            $this->renderNode($node, $frame);
        }
    }

    /**
     * @param array<string, mixed> $node
     */
    private function renderNode(array $node, Frame $frame): void
    {
        $this->context->at($frame, $node['span']);
        switch ($node['type']) {
            case 'Text':
                $this->context->write($node['value']);

                return;
            case 'Echo':
                $value = $this->evaluator->evaluate($node['expr'], $frame);
                if ($value instanceof SafeString) {
                    $this->context->write($value->text);
                } else {
                    $this->context->write(Escape::html($this->evaluator->stringify($value, $frame, $node['expr']['span'])));
                }

                return;
            case 'If':
                foreach ($node['branches'] as $branch) {
                    if (Value::isTruthy($this->evaluator->evaluate($branch['test'], $frame))) {
                        $this->renderNodes($branch['body'], $frame);

                        return;
                    }
                }
                if ($node['else'] !== null) {
                    $this->renderNodes($node['else'], $frame);
                }

                return;
            case 'For':
                $this->renderFor($node, $frame);

                return;
            case 'Set':
                $frame->locals->set($node['name'], $this->evaluator->evaluate($node['expr'], $frame));

                return;
            case 'Include':
                $this->renderInclude($node['path'], $node['span'], $frame);

                return;
            case 'Block':
                $this->renderBlock($node, $frame);

                return;
            case 'IfBlock':
                if (isset($this->context->registry[$node['id']])) {
                    $this->renderNodes($node['body'], $frame);
                } elseif ($node['else'] !== null) {
                    $this->renderNodes($node['else'], $frame);
                }

                return;
        }
    }

    /**
     * @param array<string, mixed> $node
     */
    private function renderFor(array $node, Frame $frame): void
    {
        $iterable = $this->evaluator->evaluate($node['iter'], $frame);
        if ($iterable === null) {
            $entries = [];
        } elseif (is_array($iterable)) {
            $entries = [];
            foreach ($iterable as $index => $value) {
                $entries[] = [(float) $index, $value];
            }
        } elseif ($iterable instanceof MapValue) {
            $entries = [];
            foreach ($iterable->entries() as $key => $value) {
                $entries[] = [$key, $value];
            }
        } else {
            throw $this->context->fail('E_RUNTIME_TYPE', $frame, $node['span'], 'loop requires a list, a map or null');
        }
        if ($entries === []) {
            if ($node['empty'] !== null) {
                $this->renderNodes($node['empty'], $frame);
            }

            return;
        }
        $name = $node['name'];
        $hadLocal = $frame->locals->has($name);
        $previous = $frame->locals->get($name);
        $stackBefore = $frame->loops[$name] ?? [];
        $size = count($entries);
        try {
            foreach ($entries as $index => [$key, $value]) {
                $this->context->countIteration($frame, $node['span']);
                $meta = ['index' => $index, 'key' => $key, 'value' => $value, 'first' => $index === 0, 'last' => $index === $size - 1, 'size' => $size];
                $frame->loops[$name] = [...$stackBefore, $meta];
                $frame->locals->set($name, $value);
                $this->renderNodes($node['body'], $frame);
            }
        } finally {
            $frame->loops[$name] = $stackBefore;
            if ($hadLocal) {
                $frame->locals->set($name, $previous);
            } else {
                $frame->locals->remove($name);
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
    private function renderInclude(string $path, array $span, Frame $frame): void
    {
        $name = $this->resolve($path, $frame, $span);
        $template = $this->context->engine->loadTemplate($name, $frame, $span);
        $this->context->enter($name, $frame, $span);
        try {
            $included = new Frame($template, $frame->context, $frame->locals, $frame->loops);
            $this->renderNodes($template['ast']['body'], $included);
        } finally {
            $this->context->leave();
        }
    }

    /**
     * @param array<string, mixed> $node
     */
    private function renderBlock(array $node, Frame $frame): void
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
            $data->set($item['name'], $this->evaluator->evaluate($item['expr'], $frame));
        }
        $template = $this->context->engine->loadTemplate($entry['template'], $frame, $node['span']);
        $this->context->enter($entry['template'], $frame, $node['span']);
        try {
            $this->renderNodes($template['ast']['body'], new Frame($template, $data));
        } finally {
            $this->context->leave();
        }
    }
}
