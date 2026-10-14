<?php

declare(strict_types=1);

namespace Polyspec\Showcase\Generated\ScopePrecedence;

final class ArtifactManifest
{
    public function __construct(
        public readonly int $schema,
        public readonly string $mode,
        public readonly string $target,
        public readonly string $entry,
        public readonly string $sourceDigest,
        public readonly string $typeDigest,
        public readonly string $contractDigest,
        public readonly array $files,
    ) {
    }
}
