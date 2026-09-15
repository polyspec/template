<?php

declare(strict_types=1);

namespace Polyspec\Template\Render;

use Polyspec\Template\Functions\Registry;

/** Host functions and resource limits shared by AST and generated programs. */
final class RuntimeEnvironment implements RuntimeServices
{
    public const DEFAULT_LIMITS = [
        'iterations' => 1000000,
        'depth' => 32,
        'outputBytes' => 16 * 1024 * 1024,
        'expressionDepth' => 64,
    ];

    /** @var array{iterations: int, depth: int, outputBytes: int, expressionDepth: int} */
    private readonly array $limits;

    /** @var array<string, callable> */
    private array $hostFunctions = [];
    /** @var array<string, callable> */
    private array $classFunctions = [];

    /**
     * @param array<string, int> $limits
     * @param array<string, callable> $hostFunctions
     */
    public function __construct(array $limits = [], array $hostFunctions = [])
    {
        $this->limits = array_merge(self::DEFAULT_LIMITS, $limits);
        foreach ($hostFunctions as $name => $function) {
            $this->register((string) $name, $function);
        }
    }

    /** Registers one host function after validating its name. */
    public function register(string $name, callable $function): void
    {
        if (preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $name) !== 1) {
            throw new \InvalidArgumentException(json_encode($name).' is not an identifier');
        }
        if (Registry::isBuiltin($name)) {
            throw new \InvalidArgumentException("{$name} is a built-in function");
        }
        $this->hostFunctions[$name] = $function;
    }

    /** @return array{iterations: int, depth: int, outputBytes: int, expressionDepth: int} */
    public function limits(): array
    {
        return $this->limits;
    }

    /** Returns one registered host function. */
    public function hostFunction(string $name): ?callable
    {
        return $this->hostFunctions[$name] ?? null;
    }

    /** Registers one logical class function used by `Class::method(...)`. */
    public function registerClass(string $className, string $method, callable $function): void
    {
        if (preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $className) !== 1 || preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $method) !== 1) {
            throw new \InvalidArgumentException('class function names must be identifiers');
        }
        $this->classFunctions[$className.'::'.$method] = $function;
    }

    /** Returns one logical class function. */
    public function classFunction(string $className, string $method): ?callable
    {
        return $this->classFunctions[$className.'::'.$method] ?? null;
    }
}
