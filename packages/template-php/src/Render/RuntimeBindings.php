<?php

declare(strict_types=1);

namespace Polyspec\Template\Render;

use Polyspec\Template\Escape;
use Polyspec\Template\Functions\FunctionError;
use Polyspec\Template\Functions\Helpers;
use Polyspec\Template\Functions\Registry;
use Polyspec\Template\TemplateError;
use Polyspec\Template\Value\Bind;
use Polyspec\Template\Value\BindError;
use Polyspec\Template\Value\MapValue;
use Polyspec\Template\Value\Number;
use Polyspec\Template\Value\SafeString;
use Polyspec\Template\Value\Value;

/** Shared runtime value, function and error semantics for AST and generated programs. */
final class RuntimeBindings
{
    public function __construct(private readonly Context $context)
    {
    }

    public function truthy(mixed $value): bool
    {
        return Value::isTruthy($value);
    }

    /** @param array{0: int, 1: int} $span */
    public function unary(string $operator, mixed $operand, Frame $frame, array $span): mixed
    {
        return match ($operator) {
            '!' => !$this->truthy($operand),
            '-' => $this->finite(-$this->number($operand, $frame, $span), $frame, $span),
            default => throw $this->error($frame, $span, 'E_RUNTIME_TYPE', "unknown operator {$operator}"),
        };
    }

    /** @param array{0: int, 1: int} $span */
    public function binary(string $operator, mixed $left, mixed $right, Frame $frame, array $span): mixed
    {
        switch ($operator) {
            case '+':
                if (Value::isCollection($left) || Value::isCollection($right)) {
                    throw $this->error($frame, $span, 'E_RUNTIME_STRINGIFY', 'a list or map cannot be converted to text');
                }
                if (Value::isString($left) || Value::isString($right)) {
                    return $this->stringify($left, $frame, $span).$this->stringify($right, $frame, $span);
                }

                return $this->finite($this->number($left, $frame, $span) + $this->number($right, $frame, $span), $frame, $span);
            case '-':
                return $this->finite($this->number($left, $frame, $span) - $this->number($right, $frame, $span), $frame, $span);
            case '*':
                return $this->finite($this->number($left, $frame, $span) * $this->number($right, $frame, $span), $frame, $span);
            case '/':
                $divisor = $this->number($right, $frame, $span);
                if ($divisor == 0.0) {
                    throw $this->error($frame, $span, 'E_RUNTIME_DIV_ZERO', 'division by zero');
                }

                return $this->finite($this->number($left, $frame, $span) / $divisor, $frame, $span);
            case '%':
                $dividend = $this->number($left, $frame, $span);
                $divisor = $this->number($right, $frame, $span);
                if (!Number::isInteger($dividend) || !Number::isInteger($divisor)) {
                    throw $this->error($frame, $span, 'E_RUNTIME_TYPE', '% requires integer operands');
                }
                if ($divisor == 0.0) {
                    throw $this->error($frame, $span, 'E_RUNTIME_DIV_ZERO', 'division by zero');
                }

                return fmod($dividend, $divisor);
            case '==': return $this->equal($left, $right, false);
            case '!=': return !$this->equal($left, $right, false);
            case '===': return $this->equal($left, $right, true);
            case '!==': return !$this->equal($left, $right, true);
            case '<':
            case '>':
            case '<=':
            case '>=':
                $order = $this->compare($left, $right, $frame, $span);

                return match ($operator) {
                    '<' => $order < 0,
                    '>' => $order > 0,
                    '<=' => $order <= 0,
                    default => $order >= 0,
                };
            case 'in':
                if (is_array($right)) {
                    foreach ($right as $item) {
                        if ($this->equal($item, $left, false)) {
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
                throw $this->error($frame, $span, 'E_RUNTIME_TYPE', 'in requires a list, map or string on the right');
            default:
                throw $this->error($frame, $span, 'E_RUNTIME_TYPE', "unknown operator {$operator}");
        }
    }

    /** @param array{0: int, 1: int} $span */
    public function stringify(mixed $value, Frame $frame, array $span): string
    {
        $text = Value::stringify($value);
        if ($text === null) {
            throw $this->error($frame, $span, 'E_RUNTIME_STRINGIFY', 'a list or map cannot be converted to text');
        }

        return $text;
    }

    /** @param array{0: int, 1: int} $span */
    public function escape(mixed $value, Frame $frame, array $span): string
    {
        return $value instanceof SafeString ? $value->text : Escape::html($this->stringify($value, $frame, $span));
    }

    /** @param array{0: int, 1: int} $span */
    public function number(mixed $value, Frame $frame, array $span): float
    {
        try {
            return Helpers::toNumber($value);
        } catch (FunctionError $error) {
            throw $this->error($frame, $span, $error->errorCode, $error->getMessage());
        }
    }

    /** @param array{0: int, 1: int} $span */
    public function finite(float $value, Frame $frame, array $span): float
    {
        if (!is_finite($value)) {
            throw $this->error($frame, $span, 'E_RUNTIME_TYPE', 'arithmetic result is not finite');
        }

        return $value;
    }

    public function equal(mixed $left, mixed $right, bool $strict): bool
    {
        return $strict ? Value::strictEquals($left, $right) : Value::looseEquals($left, $right);
    }

    /** @param array{0: int, 1: int} $span */
    public function compare(mixed $left, mixed $right, Frame $frame, array $span): int
    {
        $order = Value::compare($left, $right);
        if ($order === null) {
            throw $this->error($frame, $span, 'E_RUNTIME_COMPARE', Value::typeOf($left) . ' and ' . Value::typeOf($right) . ' have no order');
        }

        return $order;
    }

    public function member(mixed $container, string $key): mixed
    {
        if (is_object($container) && !$container instanceof MapValue) {
            $reflection = new \ReflectionClass($container);
            if (!$reflection->hasProperty($key) || !$reflection->getProperty($key)->isPublic()) {
                return null;
            }
            return Bind::value($reflection->getProperty($key)->getValue($container));
        }
        return $this->index($container, $key);
    }

    /** Calls a public method on the original assigned object. */
    public function memberCall(mixed $container, string $method, array $args, Frame $frame, array $span): mixed
    {
        if (!is_object($container) || $container instanceof MapValue) {
            throw $this->error($frame, $span, 'E_RUNTIME_UNKNOWN_FUNCTION', "{$method} is not a function");
        }
        $reflection = new \ReflectionClass($container);
        if (!$reflection->hasMethod($method) || !$reflection->getMethod($method)->isPublic()) {
            throw $this->error($frame, $span, 'E_RUNTIME_UNKNOWN_FUNCTION', "{$method} is not a function");
        }
        try {
            return Bind::value($reflection->getMethod($method)->invokeArgs($container, $args));
        } catch (\Throwable $error) {
            throw $this->error($frame, $span, 'E_RUNTIME_HOST_FUNCTION', "{$method} failed: {$error->getMessage()}");
        }
    }

    /** Calls a registered logical class function. */
    public function classCall(string $className, string $method, array $args, Frame $frame, array $span): mixed
    {
        $function = $this->context->services->classFunction($className, $method);
        if ($function === null) {
            throw $this->error($frame, $span, 'E_RUNTIME_UNKNOWN_FUNCTION', "{$className}::{$method} is not a function");
        }
        try {
            return Bind::value($function($args, $this->context->env));
        } catch (\Throwable $error) {
            throw $this->error($frame, $span, 'E_RUNTIME_HOST_FUNCTION', "{$className}::{$method} failed: {$error->getMessage()}");
        }
    }

    public function index(mixed $container, mixed $key): mixed
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
            $position = null;
            if (Value::isNumber($key) && Number::isInteger((float) $key)) {
                $position = (int) $key;
            } elseif (Value::isString($key) && preg_match('/^(0|[1-9][0-9]*)$/', Value::textOf($key)) === 1) {
                $position = (int) Value::textOf($key);
            }

            return $position !== null && $position >= 0 && $position < count($container) ? $container[$position] : null;
        }

        return null;
    }

    /**
     * @param array{0: int, 1: int} $span
     * @return list<array{0: mixed, 1: mixed}>
     */
    public function entries(mixed $value, Frame $frame, array $span): array
    {
        if ($value === null) {
            return [];
        }
        if (is_array($value)) {
            $entries = [];
            foreach ($value as $position => $item) {
                $entries[] = [(float) $position, $item];
            }

            return $entries;
        }
        if ($value instanceof MapValue) {
            $entries = [];
            foreach ($value->entries() as $key => $item) {
                $entries[] = [$key, $item];
            }

            return $entries;
        }

        throw $this->error($frame, $span, 'E_RUNTIME_TYPE', 'loop requires a list, a map or null');
    }

    /** @param array{0: int, 1: int} $span */
    public function listSpread(mixed $value, Frame $frame, array $span): array
    {
        if (!is_array($value)) {
            throw $this->error($frame, $span, 'E_RUNTIME_TYPE', 'spread in a list requires a list');
        }

        return $value;
    }

    /** @param array{0: int, 1: int} $span */
    public function mapSpread(mixed $value, Frame $frame, array $span): MapValue
    {
        if (!$value instanceof MapValue) {
            throw $this->error($frame, $span, 'E_RUNTIME_TYPE', 'spread in a map requires a map');
        }

        return $value;
    }

    /**
     * @param list<mixed> $args
     * @param array{0: int, 1: int} $span
     */
    public function call(string $name, array $args, Frame $frame, array $span): mixed
    {
        $builtin = Registry::builtins()[$name] ?? null;
        if ($builtin !== null) {
            $count = count($args);
            if ($count < $builtin['min'] || $count > $builtin['max']) {
                $accepts = $builtin['min'] === $builtin['max'] ? (string) $builtin['min'] : $builtin['min'] . ' to ' . $builtin['max'];
                throw $this->error($frame, $span, 'E_RUNTIME_ARITY', "{$name} accepts {$accepts} arguments, got {$count}");
            }
            try {
                return ($builtin['call'])($args, $this->context->env);
            } catch (FunctionError $error) {
                throw $this->error($frame, $span, $error->errorCode, $error->getMessage());
            }
        }
        $host = $this->context->services->hostFunction($name);
        if ($host === null) {
            throw $this->error($frame, $span, 'E_RUNTIME_UNKNOWN_FUNCTION', "{$name} is not a function");
        }
        try {
            $result = $host($args, $this->context->env);
        } catch (\Throwable $error) {
            throw $this->error($frame, $span, 'E_RUNTIME_HOST_FUNCTION', "{$name} failed: " . $error->getMessage());
        }
        try {
            return Bind::value($result);
        } catch (BindError $error) {
            throw $this->error($frame, $span, $error->errorCode, $error->getMessage());
        }
    }

    /** @param array{0: int, 1: int} $span */
    public function limit(string $kind, int $count, Frame $frame, array $span): void
    {
        $limits = $this->context->services->limits();
        $maximum = $kind === 'expression' ? $limits['expressionDepth'] : $limits['iterations'];
        if ($count <= $maximum) {
            return;
        }
        $message = $kind === 'expression' ? 'expression nesting exceeds ' : 'loop iterations exceed ';
        throw $this->error($frame, $span, 'E_RUNTIME_LIMIT', $message . $maximum);
    }

    /** @param array{0: int, 1: int} $span */
    public function error(Frame $frame, array $span, string $code, string $message): TemplateError
    {
        return $this->context->fail($code, $frame, $span, $message);
    }
}
