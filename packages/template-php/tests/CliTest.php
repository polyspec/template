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

    public function testTokensPrintsTheTokensWithByteOffsets(): void
    {
        $dir = Support::casesDir() . '/echo/path';
        $result = self::runCli(['tokens', "{$dir}/input.tpl", '--root', $dir]);
        self::assertSame(0, $result['status'], $result['stderr']);
        self::assertSame(json_decode((string) file_get_contents("{$dir}/expected.tokens.json"), true), json_decode($result['stdout'], true));
        $failed = self::runCli(['tokens', Support::casesDir() . '/errors/unclosed-block/input.tpl']);
        self::assertSame(2, $failed['status']);
        self::assertSame('E_PARSE_UNCLOSED_BLOCK', json_decode($failed['stderr'], true)['code']);
    }

    public function testFormatPrintsTheFormattedText(): void
    {
        $file = tempnam(sys_get_temp_dir(), 'fmt');
        self::assertIsString($file);
        file_put_contents($file, "<ul>\n<li>{=a}</li>\n</ul>");
        try {
            self::assertSame(['status' => 0, 'stdout' => "<ul>\n  <li>{= a}</li>\n</ul>", 'stderr' => ''], self::runCli(['format', $file]));
            self::assertSame("<ul>\n\t<li>{= a}</li>\n</ul>", self::runCli(['format', $file, '--indent', 'tab'])['stdout']);
            self::assertSame("<ul>\n    <li>{= a}</li>\n</ul>", self::runCli(['format', $file, '--indent', '4'])['stdout']);
            self::assertSame("<ul>\n<li>{= a}</li>\n</ul>", self::runCli(['format', $file, '--indent', 'none'])['stdout']);
            file_put_contents($file, '[= a+1]');
            self::assertSame('[= a + 1]', self::runCli(['format', $file, '--delimiters', '[]'])['stdout']);
            file_put_contents($file, "<p>\n  {? a}\n</p>");
            $failed = self::runCli(['format', $file]);
            self::assertSame(2, $failed['status']);
            $error = json_decode($failed['stderr'], true);
            self::assertIsArray($error);
            self::assertSame(['reason', 'code', 'line', 'col', 'message'], array_keys($error));
            self::assertSame(['parse', 'E_PARSE_UNCLOSED_BLOCK', 2, 3], [$error['reason'], $error['code'], $error['line'], $error['col']]);
            self::assertSame(1, self::runCli(['format', $file, '--indent', '9'])['status']);
            self::assertSame(1, self::runCli(['format', $file, '--root', '/'])['status']);
        } finally {
            unlink($file);
        }
    }

    public function testUsageErrors(): void
    {
        self::assertSame(1, self::runCli(['parse'])['status']);
        self::assertSame(1, self::runCli(['render', 'x.tpl', '--unknown', '1'])['status']);
    }
}
