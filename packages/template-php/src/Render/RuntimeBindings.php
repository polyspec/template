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
use Polyspec\Template\Value\HostArgument;
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

    /**
     * Reads a fixed member name (EXP-18, VAL-19).
     *
     * @param array{0: int, 1: int} $span
     */
    public function member(mixed $container, string $key, Frame $frame, array $span): mixed
    {
        return $this->index($container, $key, $frame, $span);
    }

    /**
     * Calls a public method on the original assigned object and binds its result (VAL-19).
     *
     * @param list<mixed> $args
     * @param array{0: int, 1: int} $span
     */
    public function memberCall(mixed $container, string $method, array $args, Frame $frame, array $span): mixed
    {
        if (!is_object($container) || $container instanceof MapValue || $container instanceof SafeString) {
            throw $this->error($frame, $span, 'E_RUNTIME_UNKNOWN_FUNCTION', "{$method} is not a function");
        }
        $reflection = new \ReflectionObject($container);
        if (!$reflection->hasMethod($method) || !$reflection->getMethod($method)->isPublic()) {
            throw $this->error($frame, $span, 'E_RUNTIME_UNKNOWN_FUNCTION', "{$method} is not a function");
        }
        $target = $reflection->getMethod($method);
        $arguments = HostArgument::list($args);

        return $this->hostResult($method, static fn (): mixed => $target->invokeArgs($target->isStatic() ? null : $container, $arguments), $frame, $span);
    }

    /**
     * Calls a registered logical class function and binds its result.
     *
     * @param list<mixed> $args
     * @param array{0: int, 1: int} $span
     */
    public function classCall(string $className, string $method, array $args, Frame $frame, array $span): mixed
    {
        $function = $this->context->services->classFunction($className, $method);
        if ($function === null) {
            throw $this->error($frame, $span, 'E_RUNTIME_UNKNOWN_FUNCTION', "{$className}::{$method} is not a function");
        }
        $env = $this->context->env;
        $arguments = HostArgument::list($args);

        return $this->hostResult("{$className}::{$method}", static fn (): mixed => $function($arguments, $env), $frame, $span);
    }

    /**
     * Reads a dynamic list position, a map key or a public property of a native object (EXP-19, VAL-19).
     *
     * @param array{0: int, 1: int} $span
     */
    public function index(mixed $container, mixed $key, Frame $frame, array $span): mixed
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
        if (is_object($container) && !$container instanceof SafeString && Value::isString($key)) {
            $properties = Bind::publicProperties($container);
            $name = Value::textOf($key);
            if (!array_key_exists($name, $properties)) {
                return null;
            }

            return $this->bound($properties[$name], $frame, $span);
        }

        return null;
    }

    /**
     * Checks the depth of a value that a list or map literal built (VAL-20).
     *
     * @param array{0: int, 1: int} $span
     */
    public function depth(mixed $value, Frame $frame, array $span): mixed
    {
        if (!Bind::depthWithin($value, Bind::MAX_DEPTH)) {
            throw $this->error($frame, $span, 'E_RUNTIME_LIMIT', 'a list or map literal nests deeper than ' . Bind::MAX_DEPTH . ' levels');
        }

        return $value;
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
        $env = $this->context->env;
        $arguments = HostArgument::list($args);

        return $this->hostResult($name, static fn (): mixed => $host($arguments, $env), $frame, $span);
    }

    /**
     * Runs host code and binds its result; a thrown exception is E_RUNTIME_HOST_FUNCTION at the call
     * (FUN-46) and a value that cannot be bound fails with its code at the call (ERR-5).
     *
     * @param \Closure(): mixed $run
     * @param array{0: int, 1: int} $span
     */
    private function hostResult(string $name, \Closure $run, Frame $frame, array $span): mixed
    {
        try {
            $result = $run();
        } catch (TemplateError $error) {
            throw $error;
        } catch (\Throwable $error) {
            throw $this->error($frame, $span, 'E_RUNTIME_HOST_FUNCTION', "{$name} failed: " . $error->getMessage());
        }

        return $this->bound($result, $frame, $span);
    }

    /**
     * Binds a host value at the expression that produced it (ERR-5, VAL-11).
     *
     * @param array{0: int, 1: int} $span
     */
    private function bound(mixed $value, Frame $frame, array $span): mixed
    {
        try {
            return Bind::value($value);
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
