"""The operations of bound data (VAL-22): `bind` checks a host value once and
`merge` combines two bound maps.

Both run outside a render, so their errors have no template (ERR-14).
"""

from __future__ import annotations

from .bind import BindError, BoundMap, bind_value
from .errors import error_without_position, internal_boundary


def bind(value) -> BoundMap:
    """Applies host binding to a value and returns a bound map (VAL-22).

    None gives the empty bound map (RT-4); a bound map is returned unchanged.
    """

    def run() -> BoundMap:
        if isinstance(value, BoundMap):
            return value
        if value is None:
            return BoundMap({})
        try:
            bound = bind_value(value)
        except BindError as error:
            raise error_without_position(error.code, "", str(error)) from None
        if not isinstance(bound, dict):
            raise error_without_position(
                "E_DATA_UNSUPPORTED_TYPE", "", "bind takes a value that binds to a map"
            )
        return BoundMap(bound)

    return internal_boundary("", run)


def merge(first, second) -> BoundMap:
    """Returns a bound map with the entries of `first` and `second`.

    An entry of `second` replaces the entry of `first` with the same key in its
    position, and the other entries of `second` follow (RT-26). It reads no value
    again.
    """

    def run() -> BoundMap:
        if not isinstance(first, BoundMap) or not isinstance(second, BoundMap):
            raise error_without_position(
                "E_DATA_UNSUPPORTED_TYPE", "", "merge takes two bound maps"
            )
        entries = dict(first.entries)
        for key, value in second.entries.items():
            entries[key] = value
        return BoundMap(entries)

    return internal_boundary("", run)
