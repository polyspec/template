<?php

declare(strict_types=1);

namespace Polyspec\Showcase\Generated\CompilerCoverage;

use InvalidArgumentException;
use Polyspec\Template\Value\Bind;
use Polyspec\Template\Value\BindError;
use Polyspec\Template\Value\MapValue;

final class GeneratedRuntime
{
    private const RECORDS_SCHEMA = 'eyJQYWdlIjp7InRpdGxlIjp7ImtpbmQiOiJzdHJpbmciLCJvcHRpb25hbCI6ZmFsc2V9fSwiUm93Ijp7Im5hbWUiOnsia2luZCI6InN0cmluZyIsIm9wdGlvbmFsIjpmYWxzZX19LCJTbG90Ijp7InRlbXBsYXRlIjp7ImtpbmQiOiJzdHJpbmciLCJvcHRpb25hbCI6dHJ1ZX0sImh0bWwiOnsia2luZCI6InN0cmluZyIsIm9wdGlvbmFsIjp0cnVlfX19';
    private const ASSIGN_SCHEMA = 'eyJmbGFnIjp7ImtpbmQiOiJib29sZWFuIiwib3B0aW9uYWwiOmZhbHNlfSwiZGFuZ2Vyb3VzIjp7ImtpbmQiOiJzdHJpbmciLCJvcHRpb25hbCI6ZmFsc2V9LCJlbXB0eV9saXN0Ijp7ImtpbmQiOiJsaXN0IiwiaXRlbSI6eyJraW5kIjoic3RyaW5nIiwib3B0aW9uYWwiOmZhbHNlfSwib3B0aW9uYWwiOmZhbHNlfSwiZW1wdHlfbWFwIjp7ImtpbmQiOiJtYXAiLCJrZXkiOnsia2luZCI6InN0cmluZyIsIm9wdGlvbmFsIjpmYWxzZX0sInZhbHVlIjp7ImtpbmQiOiJzdHJpbmciLCJvcHRpb25hbCI6ZmFsc2V9LCJvcHRpb25hbCI6ZmFsc2V9LCJwYWdlIjp7ImtpbmQiOiJyZWNvcmQiLCJuYW1lIjoiUGFnZSIsIm9wdGlvbmFsIjpmYWxzZX0sIm51bWJlcnMiOnsia2luZCI6Imxpc3QiLCJpdGVtIjp7ImtpbmQiOiJudW1iZXIiLCJvcHRpb25hbCI6ZmFsc2V9LCJvcHRpb25hbCI6ZmFsc2V9LCJsb29rdXAiOnsia2luZCI6Im1hcCIsImtleSI6eyJraW5kIjoic3RyaW5nIiwib3B0aW9uYWwiOmZhbHNlfSwidmFsdWUiOnsia2luZCI6InN0cmluZyIsIm9wdGlvbmFsIjpmYWxzZX0sIm9wdGlvbmFsIjpmYWxzZX0sInJvd3MiOnsia2luZCI6Imxpc3QiLCJpdGVtIjp7ImtpbmQiOiJyZWNvcmQiLCJuYW1lIjoiUm93Iiwib3B0aW9uYWwiOmZhbHNlfSwib3B0aW9uYWwiOmZhbHNlfX0=';
    private const DEFINITION_SCHEMA = 'eyJjb250ZW50Ijp7ImZpZWxkIjoiY29udGVudCIsInRhcmdldCI6ImNhcmQudHBsIiwiaHRtbCI6dHJ1ZSwiY2xhc3MiOiJEZWZpbml0aW9uRGF0YUNhcmRUcGwiLCJpbnB1dCI6eyJsYWJlbCI6eyJraW5kIjoic3RyaW5nIiwib3B0aW9uYWwiOmZhbHNlfX19LCJsYXlvdXQiOnsiZmllbGQiOiJsYXlvdXQiLCJ0YXJnZXQiOiJsYXlvdXQudHBsIiwiaHRtbCI6ZmFsc2UsImNsYXNzIjoiRGVmaW5pdGlvbkRhdGFMYXlvdXRUcGwiLCJpbnB1dCI6e319fQ==';

    public static function schema(string $encoded): array
    {
        static $schemas = [];

        return $schemas[$encoded] ??= json_decode(base64_decode($encoded, true), true, flags: JSON_THROW_ON_ERROR);
    }

    public static function bindType(mixed $value, array $type, string $path): mixed
    {
        if ($value === null) {
            if (($type['optional'] ?? false) || $type['kind'] === 'null' || $type['kind'] === 'any') {
                return null;
            }
            throw new InvalidArgumentException($path . ' is required');
        }
        if ($type['kind'] === 'any') {
            return $value;
        }
        if (in_array($type['kind'], ['string', 'number', 'boolean'], true)) {
            $valid = match ($type['kind']) {
                'string' => is_string($value),
                'number' => is_float($value) || is_int($value),
                default => is_bool($value),
            };
            if (!$valid) {
                throw new InvalidArgumentException($path . ' has an invalid type');
            }

            return $type['kind'] === 'number' ? (float) $value : $value;
        }
        if ($type['kind'] === 'list') {
            if (!is_array($value)) {
                throw new InvalidArgumentException($path . ' is not a list');
            }

            return array_map(
                fn ($item, $index) => self::bindType($item, $type['item'], $path . '[' . $index . ']'),
                $value,
                array_keys($value),
            );
        }
        if ($type['kind'] === 'map') {
            if (!$value instanceof MapValue) {
                throw new InvalidArgumentException($path . ' is not a map');
            }
            $result = new MapValue();
            foreach ($value->entries() as $key => $item) {
                $result->set(
                    (string) self::bindType($key, $type['key'], $path . '.key'),
                    self::bindType($item, $type['value'], $path . '.' . $key),
                );
            }

            return $result;
        }
        if ($type['kind'] === 'record') {
            $records = self::schema(self::RECORDS_SCHEMA);

            return self::bindRecord($value, $records[$type['name']], __NAMESPACE__ . '\\' . $type['name'], $path);
        }
        throw new InvalidArgumentException($path . ' has an unknown generated type');
    }

    public static function bindRecord(mixed $value, array $fields, string $class, string $path): object
    {
        if (!$value instanceof MapValue) {
            throw new InvalidArgumentException($path . ' is not an object');
        }
        $arguments = [];
        foreach ($fields as $name => $type) {
            if (!$value->has($name)) {
                if (!($type['optional'] ?? false)) {
                    throw new InvalidArgumentException($path . '.' . $name . ' is required');
                }
                continue;
            }
            $arguments[$name] = self::bindType($value->get($name), $type, $path . '.' . $name);
        }

        return new $class(...$arguments);
    }

    public static function bindAssign(mixed $value): array
    {
        $root = $value === null ? new MapValue() : Bind::map($value);

        return [self::bindRecord($root, self::schema(self::ASSIGN_SCHEMA), Assign::class, 'assign'), $root];
    }

    public static function bindDefinitions(array $input): array
    {
        $arguments = [];
        $targets = [];
        $specs = self::schema(self::DEFINITION_SCHEMA);
        foreach ($input as $id => $raw) {
            $id = (string) $id;
            if (preg_match('//u', $id) !== 1) {
                throw new BindError('E_DATA_INVALID_UTF8', 'a define id is not valid UTF-8');
            }
            $spec = $specs[$id] ?? null;
            if ($spec === null) {
                throw new InvalidArgumentException('define.' . $id . ' is not declared');
            }
            if (is_string($raw)) {
                if ($spec['target'] === null || $raw !== $spec['target']) {
                    throw new InvalidArgumentException('define.' . $id . ' has an invalid template');
                }
                $arguments[$spec['field']] = new Definition(template: $spec['target']);
                $targets[$id] = ['target' => $spec['target']];
                continue;
            }
            if (!is_array($raw)) {
                throw new InvalidArgumentException('define.' . $id . ' is not an object');
            }
            $template = $raw['template'] ?? null;
            $html = $raw['html'] ?? null;
            $data = array_key_exists('data', $raw) ? Bind::data($raw['data']) : null;
            if (is_string($html)) {
                if (!$spec['html'] || array_key_exists('template', $raw) || array_key_exists('data', $raw)) {
                    throw new InvalidArgumentException('define.' . $id . ' has an invalid html entry');
                }
                $arguments[$spec['field']] = new Definition(html: $html);
                $targets[$id] = ['target' => null, 'html' => $html];
                continue;
            }
            if (!is_string($template) || $spec['target'] === null || $template !== $spec['target']) {
                throw new InvalidArgumentException('define.' . $id . ' has an invalid template');
            }
            $boundData = null;
            if (array_key_exists('data', $raw)) {
                if ($data === []) {
                    $data = new MapValue();
                }
                if (!$data instanceof MapValue) {
                    throw new InvalidArgumentException('define.' . $id . '.data is not an object');
                }
                $values = [];
                foreach ($spec['input'] as $name => $type) {
                    if ($data->has($name)) {
                        $values['has_' . $name] = true;
                        $values[$name] = self::bindType($data->get($name), $type, 'define.' . $id . '.data.' . $name);
                    }
                }
                $class = __NAMESPACE__ . '\\' . $spec['class'];
                $boundData = new $class(...$values);
            }
            $arguments[$spec['field']] = new Definition(template: $spec['target'], data: $boundData);
            $targets[$id] = ['target' => $spec['target']];
        }

        return [new Definitions(...$arguments), $targets];
    }

    public static function list(array $items): array
    {
        $result = [];
        foreach ($items as $item) {
            if ($item['spread']) {
                array_push($result, ...$item['value']);
            } else {
                $result[] = $item['value'];
            }
        }

        return $result;
    }

    public static function map(array $items): MapValue
    {
        $result = new MapValue();
        foreach ($items as $item) {
            if ($item['spread']) {
                foreach ($item['value']->entries() as $key => $value) {
                    $result->set($key, $value);
                }
            } else {
                $result->set((string) $item['key'], $item['value']);
            }
        }

        return $result;
    }

    public static function env(mixed $input): array
    {
        if ($input === null) {
            $input = [];
        }
        if (!is_array($input)) {
            throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'env is not an object');
        }
        $timezone = $input['timezone'] ?? 'Z';
        $now = $input['now'] ?? (float) time();
        if (!is_string($timezone)) {
            throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'env.timezone is not a string');
        }
        if (!is_int($now) && !is_float($now)) {
            throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'env.now is not a number');
        }

        return ['timezone' => $timezone, 'now' => (float) $now];
    }
}
