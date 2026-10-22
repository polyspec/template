<?php

declare(strict_types=1);

namespace Polyspec\Showcase\Adapter\Php;

use Polyspec\Showcase\Adapter\DefineEntry;
use Polyspec\Showcase\Adapter\RenderRequest;
use Polyspec\Template\Value\MapValue;
use RuntimeException;

/** The JSON report of the adapter: the request as plain values and the digests of the outputs. */
final class Output
{
    public static function plain(mixed $value): mixed
    {
        if ($value instanceof MapValue) {
            // entries() lists [key, value] pairs (T26.7-2-2-2); an object keeps a map a JSON object, also for keys such as "0".
            $result = new \stdClass();
            foreach ($value->entries() as [$key, $item]) {
                $result->{$key} = self::plain($item);
            }

            return $result;
        }
        if (is_array($value)) {
            return array_map(self::plain(...), $value);
        }

        return $value;
    }

    /**
     * The environment of a request with its given entries only.
     *
     * @return array<string, string|float>
     */
    public static function environment(RenderRequest $request): array
    {
        $environment = [];
        if ($request->env?->timezone !== null) {
            $environment['timezone'] = $request->env->timezone;
        }
        if ($request->env?->now !== null) {
            $environment['now'] = $request->env->now;
        }

        return $environment;
    }

    /** @return array<string, mixed> */
    public static function requestJson(RenderRequest $request): array
    {
        $define = [];
        foreach ($request->define->entries() as [$id, $entry]) {
            if (!$entry instanceof DefineEntry) {
                throw new RuntimeException('invalid define entry');
            }
            if ($entry->template === null) {
                $define[$id] = ['html' => $entry->html];
                continue;
            }
            $define[$id] = $entry->data === null
                ? $entry->template
                : ['template' => $entry->template, 'data' => self::plain($entry->data)];
        }
        $result = [
            'target' => $request->target,
            'assign' => self::plain($request->assign),
            'define' => $define,
        ];
        if ($request->env !== null) {
            $result['env'] = self::environment($request);
        }

        return $result;
    }

    /** @return array{bytes: int, sha256: string} */
    public static function digest(string $value): array
    {
        return ['bytes' => strlen($value), 'sha256' => hash('sha256', $value)];
    }
}
