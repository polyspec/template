<?php

declare(strict_types=1);

namespace Polyspec\Template\Loader;

use Polyspec\Template\AstDecoder;

/**
 * The artifact-runtime of RT-56 (docs/spec/runtime.md): loads an AST artifact that the build compiler wrote. It checks the
 * manifest and the digest of every file, and serves the decoded templates; each file's digest is its version (RT-10).
 */
final class ArtifactLoader implements LoaderInterface
{
    /** @var array<string, array{ast: array<string, mixed>, version: string}> */
    private array $templates;

    /**
     * @param array<string, array{ast: array<string, mixed>, version: string}> $templates
     */
    private function __construct(array $templates)
    {
        $this->templates = $templates;
    }

    /**
     * Loads the AST artifact in `$directory`.
     *
     * @throws \RuntimeException when the manifest, a file or a digest does not match the artifact
     */
    public static function fromDirectory(string $directory): self
    {
        $raw = @file_get_contents($directory . '/manifest.json');
        if ($raw === false) {
            throw new \RuntimeException('AST artifact manifest is missing: ' . $directory . '/manifest.json');
        }
        $manifest = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        if (($manifest['mode'] ?? null) !== 'ast') {
            throw new \RuntimeException('the artifact in ' . $directory . ' is not an AST artifact: ' . (string) ($manifest['mode'] ?? ''));
        }
        $files = $manifest['files'] ?? [];
        if (!isset($files[$manifest['entry'] ?? ''])) {
            throw new \RuntimeException('AST artifact source graph is incomplete');
        }
        $templates = [];
        foreach ($files as $name => $file) {
            $bytes = @file_get_contents($directory . '/' . $file['path']);
            if ($bytes === false || hash('sha256', $bytes) !== $file['artifactDigest']) {
                throw new \RuntimeException('AST artifact is missing or corrupt: ' . (string) $name);
            }
            $templates[(string) $name] = ['ast' => AstDecoder::decode($bytes), 'version' => $file['artifactDigest']];
        }
        return new self($templates);
    }

    /**
     * @return array{ast: array<string, mixed>, version: string}|null
     */
    public function load(string $name): ?array
    {
        return $this->templates[$name] ?? null;
    }
}
