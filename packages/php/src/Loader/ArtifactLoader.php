<?php

declare(strict_types=1);

namespace Polyspec\Template\Loader;

use Polyspec\Template\AstDecoder;

/**
 * The artifact-runtime of RT-56 (docs/spec/runtime.md): loads an AST artifact that the build compiler wrote. It checks
 * the manifest and the digest of every file, and serves the decoded templates; each file's digest is its version
 * (RT-10).
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
     * Loads the AST artifact in `$directory`. A missing or stale artifact fails with ArtifactStaleException; any other
     * failure fails with its own exception: a file that cannot be read with a RuntimeException, a manifest that is not
     * JSON with a JsonException, an AST that does not decode with AstDecodeError.
     *
     * @throws ArtifactStaleException when the manifest or a file is absent, or a file does not match its digest
     * @throws \RuntimeException when a file cannot be read, or the manifest is not an AST manifest
     * @throws \JsonException when the manifest is not JSON
     */
    public static function fromDirectory(string $directory): self
    {
        $raw = self::read($directory . '/manifest.json', 'AST artifact manifest');
        $manifest = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        if (($manifest['mode'] ?? null) !== 'ast') {
            $mode = is_array($manifest) ? (string) ($manifest['mode'] ?? '') : get_debug_type($manifest);
            throw new \RuntimeException('the artifact in ' . $directory . ' is not an AST artifact: ' . $mode);
        }
        $files = $manifest['files'] ?? [];
        if (!isset($files[$manifest['entry'] ?? ''])) {
            throw new \RuntimeException('AST artifact source graph is incomplete');
        }
        $templates = [];
        foreach ($files as $name => $file) {
            $bytes = self::read($directory . '/' . $file['path'], 'AST artifact file of ' . (string) $name);
            if (hash('sha256', $bytes) !== $file['artifactDigest']) {
                throw new ArtifactStaleException(
                    'AST artifact file of ' . (string) $name . ' does not match its digest'
                );
            }
            $templates[(string) $name] = ['ast' => AstDecoder::decode($bytes), 'version' => $file['artifactDigest']];
        }
        return new self($templates);
    }

    /**
     * Reads one file of an artifact: an absent file is stale, and a file that exists but cannot be read fails with the
     * message of the read.
     *
     * @throws ArtifactStaleException when the file is absent
     * @throws \RuntimeException when the file cannot be read
     */
    private static function read(string $path, string $what): string
    {
        if (!is_file($path)) {
            throw new ArtifactStaleException($what . ' is missing: ' . $path);
        }
        if (!is_readable($path)) {
            throw new \RuntimeException($what . ' cannot be read: ' . $path);
        }
        $bytes = file_get_contents($path);
        if ($bytes === false) {
            $error = error_get_last();
            $detail = $error === null ? '' : ': ' . $error['message'];
            throw new \RuntimeException($what . ' cannot be read: ' . $path . $detail);
        }
        return $bytes;
    }

    /**
     * @return array{ast: array<string, mixed>, version: string}|null
     */
    public function load(string $name): ?array
    {
        return $this->templates[$name] ?? null;
    }
}
