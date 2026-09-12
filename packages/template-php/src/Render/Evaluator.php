<?php

declare(strict_types=1);

namespace Polyspec\Template\Render;

use Polyspec\Template\TemplateError;
use Polyspec\Template\Value\MapValue;
use Polyspec\Template\Value\Number;
use Polyspec\Template\Value\Value;

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
                if ($expr['op'] === '!') {
                    return !$this->runtime->truthy($operand);
                }

                return $this->runtime->finite(-$this->runtime->number($operand, $frame, $expr['span']), $frame, $expr['span']);
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
                        $spread = $this->evaluate($item['expr'], $frame);
                        if (!is_array($spread)) {
                            throw $this->fail($frame, $item['span'], 'E_RUNTIME_TYPE', 'spread in a list requires a list');
                        }
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
                        $spread = $this->evaluate($entry['expr'], $frame);
                        if (!$spread instanceof MapValue) {
                            throw $this->fail($frame, $entry['span'], 'E_RUNTIME_TYPE', 'spread in a map requires a map');
                        }
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
        $span = $expr['span'];
        switch ($expr['op']) {
            case '+':
                if (Value::isCollection($left) || Value::isCollection($right)) {
                    throw $this->fail($frame, $span, 'E_RUNTIME_STRINGIFY', 'a list or map cannot be converted to text');
                }
                if (Value::isString($left) || Value::isString($right)) {
                    return $this->runtime->stringify($left, $frame, $span) . $this->runtime->stringify($right, $frame, $span);
                }

                return $this->runtime->finite($this->runtime->number($left, $frame, $span) + $this->runtime->number($right, $frame, $span), $frame, $span);
            case '-':
                return $this->runtime->finite($this->runtime->number($left, $frame, $span) - $this->runtime->number($right, $frame, $span), $frame, $span);
            case '*':
                return $this->runtime->finite($this->runtime->number($left, $frame, $span) * $this->runtime->number($right, $frame, $span), $frame, $span);
            case '/':
                $divisor = $this->runtime->number($right, $frame, $span);
                if ($divisor == 0.0) {
                    throw $this->fail($frame, $span, 'E_RUNTIME_DIV_ZERO', 'division by zero');
                }

                return $this->runtime->finite($this->runtime->number($left, $frame, $span) / $divisor, $frame, $span);
            case '%':
                $dividend = $this->runtime->number($left, $frame, $span);
                $divisor = $this->runtime->number($right, $frame, $span);
                if (!Number::isInteger($dividend) || !Number::isInteger($divisor)) {
                    throw $this->fail($frame, $span, 'E_RUNTIME_TYPE', '% requires integer operands');
                }
                if ($divisor == 0.0) {
                    throw $this->fail($frame, $span, 'E_RUNTIME_DIV_ZERO', 'division by zero');
                }

                return fmod($dividend, $divisor);
            case '==':
                return $this->runtime->equal($left, $right, false);
            case '!=':
                return !$this->runtime->equal($left, $right, false);
            case '===':
                return $this->runtime->equal($left, $right, true);
            case '!==':
                return !$this->runtime->equal($left, $right, true);
            case '<':
            case '>':
            case '<=':
            case '>=':
                $order = $this->runtime->compare($left, $right, $frame, $span);

                return match ($expr['op']) {
                    '<' => $order < 0,
                    '>' => $order > 0,
                    '<=' => $order <= 0,
                    default => $order >= 0,
                };
            case 'in':
                if (is_array($right)) {
                    foreach ($right as $item) {
                        if ($this->runtime->equal($item, $left, false)) {
                            return true;
                        }
                    }

                    return false;
                }
                if ($right instanceof MapValue) {
                    return $right->has($this->runtime->stringify($left, $frame, $span));
                }
                if (Value::isString($right)) {
                    return str_contains(Value::textOf($right), $this->runtime->stringify($left, $frame, $span));
                }
                throw $this->fail($frame, $span, 'E_RUNTIME_TYPE', 'in requires a list, map or string on the right');
            default:
                throw $this->fail($frame, $span, 'E_RUNTIME_TYPE', 'unknown operator ' . $expr['op']);
        }
    }

}
