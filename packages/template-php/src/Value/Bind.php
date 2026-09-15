<?php

declare(strict_types=1);

namespace Polyspec\Template\Value;

use Polyspec\Template\Utf8;

/**
 * Host binding of PHP values (VAL-14).
 */
final class Bind
{
    public static function value(mixed $input): mixed
    {
        if ($input === null) {
            return null;
        }
        if (is_bool($input)) {
            return $input;
        }
        if (is_int($input)) {
            if (abs($input) > Number::MAX_SAFE) {
                throw new BindError('E_DATA_NUMBER_RANGE', "integer {$input} is outside the safe range");
            }

            return (float) $input;
        }
        if (is_float($input)) {
            if (!is_finite($input)) {
                throw new BindError('E_DATA_NUMBER_NOT_FINITE', 'number is not finite');
            }

            return $input;
        }
        if (is_string($input)) {
            if (Utf8::firstInvalid($input) >= 0) {
                throw new BindError('E_DATA_INVALID_UTF8', 'string is not valid UTF-8');
            }

            return $input;
        }
        if ($input instanceof SafeString) {
            return $input->text;
        }
        if ($input instanceof MapValue) {
            $map = new MapValue();
            foreach ($input->entries() as $key => $value) {
                $map->set($key, self::value($value));
            }

            return $map;
        }
        if (is_array($input)) {
            if (array_is_list($input)) {
                return array_map(static fn ($item) => self::value($item), $input);
            }
            $map = new MapValue();
            foreach ($input as $key => $value) {
                $map->set((string) $key, self::value($value));
            }

            return $map;
        }
        if ($input instanceof \JsonSerializable) {
            return self::value($input->jsonSerialize());
        }
        if ($input instanceof \stdClass) {
            $map = new MapValue();
            foreach (get_object_vars($input) as $key => $value) {
                $map->set((string) $key, self::value($value));
            }

            return $map;
        }

        // Preserve application objects so public fields and methods remain available to templates.
        return $input;
    }

    public static function map(mixed $input): MapValue
    {
        $value = self::value($input);
        if (!$value instanceof MapValue) {
            if ($value === []) {
                return new MapValue();
            }

            throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'assign is not a map');
        }

        return $value;
    }
}
