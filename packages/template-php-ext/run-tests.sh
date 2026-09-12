#!/bin/sh
# Runs the extension test suite with the built shared library loaded.
set -eu

directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
library="$directory/target/release/libpolyspec_template.dylib"
if [ ! -f "$library" ]; then
    library="$directory/target/release/libpolyspec_template.so"
fi
if [ ! -f "$library" ]; then
    echo "the extension is not built; run make ext" >&2
    exit 1
fi
if [ ! -f "$directory/vendor/bin/phpunit" ]; then
    echo "install the test dependencies with composer install" >&2
    exit 1
fi

exec php -d extension="$library" "$directory/vendor/bin/phpunit" --configuration "$directory/phpunit.xml" "$@"
