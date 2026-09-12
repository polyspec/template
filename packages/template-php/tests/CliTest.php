<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\TestCase;

/**
 * Command line contract (CNF-4).
 */
final class CliTest extends TestCase
{
    /**
     * @param list<string> $args
     * @return array{status: int, stdout: string, stderr: string}
     */
    private static function runCli(array $args): array
    {
        $command = implode(' ', array_map('escapeshellarg', array_merge([PHP_BINARY, dirname(__DIR__) . '/bin/template.php'], $args)));
        $process = proc_open($command, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        self::assertIsResource($process);
        $stdout = (string) stream_get_contents($pipes[1]);
        $stderr = (string) stream_get_contents($pipes[2]);
        $status = proc_close($process);

        return ['status' => $status, 'stdout' => $stdout, 'stderr' => $stderr];
    }

    public function testParsePrintsAstJson(): void
    {
        $result = self::runCli(['parse', Support::casesDir() . '/text/plain/input.tpl']);
        self::assertSame(0, $result['status']);
        self::assertSame('Template', json_decode($result['stdout'], true)['type']);
    }

    public function testRenderAndErrorExitStatus(): void
    {
        $rendered = self::runCli(['render', Support::casesDir() . '/echo/path/input.tpl', '--data', 'data.json']);
        self::assertSame(0, $rendered['status']);
        $failed = self::runCli(['render', Support::casesDir() . '/errors/unclosed-block/input.tpl']);
        self::assertSame(2, $failed['status']);
        self::assertSame('E_PARSE_UNCLOSED_BLOCK', json_decode($failed['stderr'], true)['code']);
    }

    public function testUsageErrors(): void
    {
        self::assertSame(1, self::runCli(['parse'])['status']);
        self::assertSame(1, self::runCli(['render', 'x.tpl', '--unknown', '1'])['status']);
    }
}
