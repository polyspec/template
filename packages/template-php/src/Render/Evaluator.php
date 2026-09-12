<?php

declare(strict_types=1);

namespace Polyspec\Template\Render;

use Polyspec\Template\Functions\FunctionError;
use Polyspec\Template\Functions\Helpers;
use Polyspec\Template\Functions\Registry;
use Polyspec\Template\TemplateError;
use Polyspec\Template\Value\Bind;
use Polyspec\Template\Value\BindError;
use Polyspec\Template\Value\MapValue;
use Polyspec\Template\Value\Number;
use Polyspec\Template\Value\Value;

/**
 * Expression evaluation (docs/spec/expressions.md).
 */
final class Evaluator
{
    private const DEPTH_LIMIT = 64;

    private int $depth = 0;

    public function __construct(private readonly Context $context)
    {
    }

    /**
     * @param array{0: int, 1: int} $span
     */
    private function fail(Frame $frame, array $span, string $code, string $message): TemplateError
    {
        return $this->context->fail($code, $frame, $span, $message);
    }

    /**
     * @param array<string, mixed> $expr
     */
    public function evaluate(array $expr, Frame $frame): mixed
    {
        $this->depth++;
        if ($this->depth > self::DEPTH_LIMIT) {
            $this->depth--;
            throw $this->fail($frame, $expr['span'], 'E_RUNTIME_LIMIT', 'expression nesting exceeds ' . self::DEPTH_LIMIT);
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
                return $frame->lookup($expr['name']);
            case 'LoopMeta':
                $meta = $frame->loopMeta($expr['loop']);
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
                return self::lookup($this->evaluate($expr['object'], $frame), $expr['key']);
            case 'Index':
                return self::lookup($this->evaluate($expr['object'], $frame), $this->evaluate($expr['index'], $frame));
            case 'Call':
                $args = [];
                foreach ($expr['args'] as $arg) {
                    $args[] = $this->evaluate($arg, $frame);
                }

                return $this->call($expr['name'], $args, $frame, $expr['span']);
            case 'Unary':
                $operand = $this->evaluate($expr['operand'], $frame);
                if ($expr['op'] === '!') {
                    return !Value::isTruthy($operand);
                }

                return $this->finite(-$this->number($operand, $frame, $expr['span']), $frame, $expr['span']);
            case 'Binary':
                return $this->binary($expr, $frame);
            case 'Ternary':
                $test = $this->evaluate($expr['test'], $frame);
                if ($expr['then'] === null) {
                    return Value::isTruthy($test) ? $test : $this->evaluate($expr['else'], $frame);
                }

                return Value::isTruthy($test) ? $this->evaluate($expr['then'], $frame) : $this->evaluate($expr['else'], $frame);
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
                        $key = $this->stringify($this->evaluate($entry['key'], $frame), $frame, $entry['key']['span']);
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

                return Value::isTruthy($left) ? Value::isTruthy($this->evaluate($expr['right'], $frame)) : false;
            case '||':
                $left = $this->evaluate($expr['left'], $frame);

                return Value::isTruthy($left) ? true : Value::isTruthy($this->evaluate($expr['right'], $frame));
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
                    return $this->stringify($left, $frame, $span) . $this->stringify($right, $frame, $span);
                }

                return $this->finite($this->number($left, $frame, $span) + $this->number($right, $frame, $span), $frame, $span);
            case '-':
                return $this->finite($this->number($left, $frame, $span) - $this->number($right, $frame, $span), $frame, $span);
            case '*':
                return $this->finite($this->number($left, $frame, $span) * $this->number($right, $frame, $span), $frame, $span);
            case '/':
                $divisor = $this->number($right, $frame, $span);
                if ($divisor == 0.0) {
                    throw $this->fail($frame, $span, 'E_RUNTIME_DIV_ZERO', 'division by zero');
                }

                return $this->finite($this->number($left, $frame, $span) / $divisor, $frame, $span);
            case '%':
                $dividend = $this->number($left, $frame, $span);
                $divisor = $this->number($right, $frame, $span);
                if (!Number::isInteger($dividend) || !Number::isInteger($divisor)) {
                    throw $this->fail($frame, $span, 'E_RUNTIME_TYPE', '% requires integer operands');
                }
                if ($divisor == 0.0) {
                    throw $this->fail($frame, $span, 'E_RUNTIME_DIV_ZERO', 'division by zero');
                }

                return fmod($dividend, $divisor);
            case '==':
                return Value::looseEquals($left, $right);
            case '!=':
                return !Value::looseEquals($left, $right);
            case '===':
                return Value::strictEquals($left, $right);
            case '!==':
                return !Value::strictEquals($left, $right);
            case '<':
            case '>':
            case '<=':
            case '>=':
                $order = Value::compare($left, $right);
                if ($order === null) {
                    throw $this->fail($frame, $span, 'E_RUNTIME_COMPARE', Value::typeOf($left) . ' and ' . Value::typeOf($right) . ' have no order');
                }

                return match ($expr['op']) {
                    '<' => $order < 0,
                    '>' => $order > 0,
                    '<=' => $order <= 0,
                    default => $order >= 0,
                };
            case 'in':
                if (is_array($right)) {
                    foreach ($right as $item) {
                        if (Value::looseEquals($item, $left)) {
                            return true;
                        }
                    }

                    return false;
                }
                if ($right instanceof MapValue) {
                    return $right->has($this->stringify($left, $frame, $span));
                }
                if (Value::isString($right)) {
                    return str_contains(Value::textOf($right), $this->stringify($left, $frame, $span));
                }
                throw $this->fail($frame, $span, 'E_RUNTIME_TYPE', 'in requires a list, map or string on the right');
            default:
                throw $this->fail($frame, $span, 'E_RUNTIME_TYPE', 'unknown operator ' . $expr['op']);
        }
    }

    /**
     * @param array{0: int, 1: int} $span
     */
    private function number(mixed $value, Frame $frame, array $span): float
    {
        try {
            return Helpers::toNumber($value);
        } catch (FunctionError $error) {
            throw $this->fail($frame, $span, $error->errorCode, $error->getMessage());
        }
    }

    /**
     * @param array{0: int, 1: int} $span
     */
    private function finite(float $value, Frame $frame, array $span): float
    {
        if (!is_finite($value)) {
            throw $this->fail($frame, $span, 'E_RUNTIME_TYPE', 'arithmetic result is not finite');
        }

        return $value;
    }

    /**
     * @param array{0: int, 1: int} $span
     */
    public function stringify(mixed $value, Frame $frame, array $span): string
    {
        $text = Value::stringify($value);
        if ($text === null) {
            throw $this->fail($frame, $span, 'E_RUNTIME_STRINGIFY', 'a list or map cannot be converted to text');
        }

        return $text;
    }

    /**
     * @param list<mixed> $args
     * @param array{0: int, 1: int} $span
     */
    private function call(string $name, array $args, Frame $frame, array $span): mixed
    {
        $builtin = Registry::builtins()[$name] ?? null;
        if ($builtin !== null) {
            $count = count($args);
            if ($count < $builtin['min'] || $count > $builtin['max']) {
                $accepts = $builtin['min'] === $builtin['max'] ? (string) $builtin['min'] : $builtin['min'] . ' to ' . $builtin['max'];
                throw $this->fail($frame, $span, 'E_RUNTIME_ARITY', "{$name} accepts {$accepts} arguments, got {$count}");
            }
            try {
                return ($builtin['call'])($args, $this->context->env);
            } catch (FunctionError $error) {
                throw $this->fail($frame, $span, $error->errorCode, $error->getMessage());
            }
        }
        $host = $this->context->engine->hostFunction($name);
        if ($host === null) {
            throw $this->fail($frame, $span, 'E_RUNTIME_UNKNOWN_FUNCTION', "{$name} is not a function");
        }
        try {
            $result = $host($args, $this->context->env);
        } catch (\Throwable $error) {
            throw $this->fail($frame, $span, 'E_RUNTIME_HOST_FUNCTION', "{$name} failed: " . $error->getMessage());
        }
        try {
            return Bind::value($result);
        } catch (BindError $error) {
            throw $this->fail($frame, $span, $error->errorCode, $error->getMessage());
        }
    }

    /**
     * EXP-19 lookup.
     */
    public static function lookup(mixed $container, mixed $key): mixed
    {
        if ($container instanceof MapValue) {
            if (Value::isString($key)) {
                return $container->get(Value::textOf($key));
            }
            if (Value::isNumber($key) && Number::isInteger((float) $key)) {
                return $container->get(Number::toText((float) $key));
            }

            return null;
        }
        if (is_array($container)) {
            $index = null;
            if (Value::isNumber($key) && Number::isInteger((float) $key)) {
                $index = (int) $key;
            } elseif (Value::isString($key) && preg_match('/^(0|[1-9][0-9]*)$/', Value::textOf($key)) === 1) {
                $index = (int) Value::textOf($key);
            }
            if ($index === null || $index < 0 || $index >= count($container)) {
                return null;
            }

            return $container[$index];
        }

        return null;
    }
}
