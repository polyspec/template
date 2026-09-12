<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;

/**
 * The command line contract (CNF-4).
 */
final class CliTest extends TestCase
{
    /**
     * @param list<string> $arguments
     * @return array{status: int, stdout: string, stderr: string}
     */
    private function invoke(array $arguments): array
    {
        $library = dirname(__DIR__) . '/target/release/libpolyspec_template.dylib';
        if (!is_file($library)) {
            $library = dirname(__DIR__) . '/target/release/libpolyspec_template.so';
        }
        $command = array_merge([PHP_BINARY, '-d', 'extension=' . $library, dirname(__DIR__) . '/bin/template-ext.php'], $arguments);
        $descriptors = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $process = proc_open($command, $descriptors, $pipes);
        $this->assertIsResource($process);
        $stdout = (string) stream_get_contents($pipes[1]);
        $stderr = (string) stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);

        return ['status' => proc_close($process), 'stdout' => $stdout, 'stderr' => $stderr];
    }

    public function testParsePrintsTheAst(): void
    {
        $result = $this->invoke(['parse', __DIR__ . '/templates/echo.tpl']);
        $this->assertSame(0, $result['status']);
        $this->assertSame('Template', json_decode($result['stdout'], true)['type']);
    }

    public function testRenderPrintsTheOutputWithoutATrailingNewline(): void
    {
        $result = $this->invoke(['render', Support::casesDirectory() . '/text/plain/input.tpl']);
        $this->assertSame(0, $result['status']);
        $this->assertSame(Support::read(Support::casesDirectory() . '/text/plain/expected.html'), $result['stdout']);
    }

    public function testTemplateErrorExitsWithStatusTwo(): void
    {
        $result = $this->invoke(['render', Support::casesDirectory() . '/errors/unclosed-block/input.tpl']);
        $this->assertSame(2, $result['status']);
        $error = json_decode(trim($result['stderr']), true);
        $this->assertSame('E_PARSE_UNCLOSED_BLOCK', $error['code']);
        $this->assertSame('input.tpl', $error['template']);
    }

    public function testUsageErrorExitsWithStatusOne(): void
    {
        $this->assertSame(1, $this->invoke(['parse'])['status']);
        $this->assertSame(1, $this->invoke(['render', __DIR__ . '/templates/echo.tpl', '--unknown', '1'])['status']);
    }
}
