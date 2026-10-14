// The bound map type (VAL-22): a map that host binding checked once. Its entries are in a private
// field, so host code cannot read or change them; the runtime reads them with `boundEntries`.
import type { MapValue } from './value.js';

const token = Symbol('BoundMap');

let entriesOf: (value: unknown) => MapValue | undefined;

/** A map that passed host binding (VAL-22). `bind` and `merge` create it. */
export class BoundMap {
  readonly #entries: MapValue;

  /** Fails unless the package calls it, so `new` and a subclass cannot create a bound map. */
  constructor(key: symbol, entries: MapValue) {
    if (key !== token || new.target !== BoundMap) throw new TypeError('a bound map is created by bind and merge');
    this.#entries = entries;
  }

  static {
    entriesOf = value => (typeof value === 'object' && value !== null && #entries in value ? (value as BoundMap).#entries : undefined);
  }
}

/** The entries of a bound map, or undefined for every other value (VAL-22). */
export function boundEntries(value: unknown): MapValue | undefined {
  return entriesOf(value);
}

/** Creates a bound map from entries that host binding produced. */
export function createBound(entries: MapValue): BoundMap {
  return new BoundMap(token, entries);
}
