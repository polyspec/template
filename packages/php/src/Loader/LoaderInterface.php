<?php

declare(strict_types=1);

namespace Polyspec\Template\Loader;

/**
 * Template loader (RT-9, RT-10).
 */
interface LoaderInterface
{
    /**
     * Returns `['source' => bytes, 'version' => string]` or `['ast' => array, 'version' => string]`,
     * or null when the name does not exist. An exception reports a failure, which the engine reports
     * as E_LOAD_FAILED (RT-9).
     *
     * @return array{source?: string, ast?: array<string, mixed>, version: string}|null
     */
    public function load(string $name): ?array;
}
