<?php

declare(strict_types=1);

namespace Polyspec\Template\Render;

use Polyspec\Template\TemplateError;
use Polyspec\Template\Value\MapValue;

/**
 * Expression evaluation (docs/spec/expressions.md).
 */
final class Evaluator
{
    private int $depth = 0;
    private Scope $scope;

    public readonly RuntimeBindings $runtime;

    public function __construct(private readonly Context $context)
    {
        $this->runtime = new RuntimeBindings($context);
        $this->scope = new Scope();
    }

    /**
     * @param array{0: int, 1: int} $span
     */
    private function fail(Frame $frame, array $span, string $code, string $message): TemplateError
    {
        return $this->runtime->error($frame, $span, $code, $message);
    }

    /**
     * @param array<string, mixed> $expr
     */
    public function evaluate(array $expr, Frame $frame, ?Scope $scope = null): mixed
    {
        if ($scope !== null) {
            $this->scope = $scope;
        }
        $this->depth++;
        try {
            $this->runtime->limit('expression', $this->depth, $frame, $expr['span']);
        } catch (TemplateError $error) {
            $this->depth--;
            throw $error;
        }
        try {
            return $this->evaluateNode($expr, $frame);
        } finally {
            $this->depth--;
        }
    }

    /**
     * @param array<string, mixed> $expr
     */
    private function evaluateNode(array $expr, Frame $frame): mixed
    {
        switch ($expr['type']) {
            case 'Literal':
                return $expr['value'];
            case 'Var':
                return $this->scope->lookup($frame, $expr['name']);
            case 'LoopMeta':
                $meta = $this->scope->loopMeta($expr['loop']);
                if ($meta === null) {
                    throw $this->fail($frame, $expr['span'], 'E_RUNTIME_UNKNOWN_LOOP', $expr['loop'] . ' is not an active loop variable');
                }

                return match ($expr['field']) {
                    'index_' => (float) $meta['index'],
                    'key_' => $meta['key'],
                    'value_' => $meta['value'],
                    'first_' => $meta['first'],
                    'last_' => $meta['last'],
                    'size_' => (float) $meta['size'],
                };
            case 'Member':
                return $this->runtime->member($this->evaluate($expr['object'], $frame), $expr['key']);
            case 'MemberCall':
                $args = array_map(fn (array $arg): mixed => $this->evaluate($arg, $frame), $expr['args']);
                return $this->runtime->memberCall($this->evaluate($expr['object'], $frame), $expr['method'], $args, $frame, $expr['span']);
            case 'ClassCall':
                $args = array_map(fn (array $arg): mixed => $this->evaluate($arg, $frame), $expr['args']);
                return $this->runtime->classCall($expr['className'], $expr['method'], $args, $frame, $expr['span']);
            case 'Index':
                return $this->runtime->index($this->evaluate($expr['object'], $frame), $this->evaluate($expr['index'], $frame));
            case 'Call':
                $args = [];
                foreach ($expr['args'] as $arg) {
                    $args[] = $this->evaluate($arg, $frame);
                }

                return $this->runtime->call($expr['name'], $args, $frame, $expr['span']);
            case 'Unary':
                $operand = $this->evaluate($expr['operand'], $frame);
                return $this->runtime->unary($expr['op'], $operand, $frame, $expr['span']);
            case 'Binary':
                return $this->binary($expr, $frame);
            case 'Ternary':
                $test = $this->evaluate($expr['test'], $frame);
                if ($expr['then'] === null) {
                    return $this->runtime->truthy($test) ? $test : $this->evaluate($expr['else'], $frame);
                }

                return $this->runtime->truthy($test) ? $this->evaluate($expr['then'], $frame) : $this->evaluate($expr['else'], $frame);
            case 'List':
                $list = [];
                foreach ($expr['items'] as $item) {
                    if ($item['type'] === 'Spread') {
                        $spread = $this->runtime->listSpread($this->evaluate($item['expr'], $frame), $frame, $item['span']);
                        foreach ($spread as $element) {
                            $list[] = $element;
                        }
                    } else {
                        $list[] = $this->evaluate($item, $frame);
                    }
                }

                return $list;
            case 'Map':
                $map = new MapValue();
                foreach ($expr['entries'] as $entry) {
                    if (isset($entry['type'])) {
                        $spread = $this->runtime->mapSpread($this->evaluate($entry['expr'], $frame), $frame, $entry['span']);
                        foreach ($spread->entries() as $key => $value) {
                            $map->set($key, $value);
                        }
                    } else {
                        $key = $this->runtime->stringify($this->evaluate($entry['key'], $frame), $frame, $entry['key']['span']);
                        $map->set($key, $this->evaluate($entry['value'], $frame));
                    }
                }

                return $map;
            default:
                throw $this->fail($frame, $expr['span'], 'E_RUNTIME_TYPE', 'unknown expression node ' . $expr['type']);
        }
    }

    /**
     * @param array<string, mixed> $expr
     */
    private function binary(array $expr, Frame $frame): mixed
    {
        switch ($expr['op']) {
            case '&&':
                $left = $this->evaluate($expr['left'], $frame);

                return $this->runtime->truthy($left) ? $this->runtime->truthy($this->evaluate($expr['right'], $frame)) : false;
            case '||':
                $left = $this->evaluate($expr['left'], $frame);

                return $this->runtime->truthy($left) ? true : $this->runtime->truthy($this->evaluate($expr['right'], $frame));
            case '??':
                $left = $this->evaluate($expr['left'], $frame);

                return $left !== null ? $left : $this->evaluate($expr['right'], $frame);
        }
        $left = $this->evaluate($expr['left'], $frame);
        $right = $this->evaluate($expr['right'], $frame);
        return $this->runtime->binary($expr['op'], $left, $right, $frame, $expr['span']);
    }

}
