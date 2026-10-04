// The operations of bound data (VAL-22): `bind` checks a host value once and `merge` combines two
// bound maps. Both run outside a render, so their errors have no template (ERR-14).
import { errorWithoutPosition, internalBoundary } from '../errors.js';
import { BindError, bindValue } from './bind.js';
import { boundEntries, createBound, type BoundMap } from './bound.js';
import type { MapValue } from './value.js';

/**
 * Applies host binding to a value and returns a bound map (VAL-22). Null and undefined give the
 * empty bound map (RT-4); a bound map is returned unchanged.
 */
export function bind(input: unknown): BoundMap {
  return internalBoundary('', () => {
    if (boundEntries(input) !== undefined) return input as BoundMap;
    if (input === null || input === undefined) return createBound(new Map());
    let value;
    try {
      value = bindValue(input);
    } catch (error) {
      if (error instanceof BindError) throw errorWithoutPosition(error.code, '', error.message);
      throw error;
    }
    if (!(value instanceof Map)) throw errorWithoutPosition('E_DATA_UNSUPPORTED_TYPE', '', 'bind takes a value that binds to a map');
    return createBound(value);
  });
}

/**
 * Returns a bound map with the entries of `first` and `second`: an entry of `second` replaces the
 * entry of `first` with the same key in its position, and the other entries of `second` follow
 * (RT-26). It reads no value again.
 */
export function merge(first: unknown, second: unknown): BoundMap {
  return internalBoundary('', () => {
    const left = boundEntries(first);
    const right = boundEntries(second);
    if (left === undefined || right === undefined) throw errorWithoutPosition('E_DATA_UNSUPPORTED_TYPE', '', 'merge takes two bound maps');
    const entries: MapValue = new Map(left);
    for (const [key, value] of right) entries.set(key, value);
    return createBound(entries);
  });
}
