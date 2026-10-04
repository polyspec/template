<?php

declare(strict_types=1);

namespace Polyspec\Template;

use Polyspec\Template\Value\Bind;
use Polyspec\Template\Value\BindError;
use Polyspec\Template\Value\MapValue;

/**
 * A map that host binding checked once (VAL-22). `bind` and `merge` create it; `render` and
 * `prepare` take it as assign and as definition data without binding it again. Its entries are
 * private, and the class cannot be instantiated, cloned or unserialized.
 */
final class BoundMap
{
    private function __construct(private readonly MapValue $entries)
    {
    }

    private function __clone()
    {
    }

    /**
     * PHP calls this method for `unserialize`; a bound map holds only checked values, so it cannot
     * be restored from text.
     *
     * @param array<mixed> $data
     */
    public function __unserialize(array $data): void
    {
        throw new \LogicException('a bound map cannot be unserialized');
    }

    /**
     * Applies host binding to a value and returns a bound map (VAL-22). Null and the empty array give
     * the empty bound map (RT-4); a bound map is returned unchanged. Errors have no template and no
     * position (ERR-14).
     */
    public static function bind(mixed $value): self
    {
        return InternalBoundary::run('', static function () use ($value): self {
            if ($value instanceof self) {
                return $value;
            }
            if ($value === null) {
                return new self(new MapValue());
            }
            try {
                $bound = Bind::value($value);
            } catch (BindError $error) {
                throw TemplateError::withoutPosition($error->errorCode, '', $error->getMessage());
            }
            if ($bound === []) {
                return new self(new MapValue());
            }
            if (!$bound instanceof MapValue) {
                throw TemplateError::withoutPosition('E_DATA_UNSUPPORTED_TYPE', '', 'bind takes a value that binds to a map');
            }

            return new self($bound);
        });
    }

    /**
     * Returns a bound map with the entries of `$first` and `$second`: an entry of `$second` replaces
     * the entry of `$first` with the same key in its position, and the other entries of `$second`
     * follow (RT-26). It reads no value again.
     */
    public static function merge(mixed $first, mixed $second): self
    {
        return InternalBoundary::run('', static function () use ($first, $second): self {
            if (!$first instanceof self || !$second instanceof self) {
                throw TemplateError::withoutPosition('E_DATA_UNSUPPORTED_TYPE', '', 'merge takes two bound maps');
            }
            $entries = $first->entries->copy();
            foreach ($second->entries->entries() as $key => $value) {
                $entries->set($key, $value);
            }

            return new self($entries);
        });
    }
}
