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
     * The proxy of bin/template-ext.php of polyspec/template in the vendor/bin of the Composer project that runs PHPUnit,
     * which Composer names in $_composer_bin_dir of the proxy of PHPUnit; the proxy sets the autoloader of that project.
     */
    private static function command(): string
    {
        $binDir = $GLOBALS['_composer_bin_dir'] ?? null;
        self::assertIsString($binDir, 'PHPUnit runs without the proxy of vendor/bin/phpunit');

        return $binDir . '/template-ext.php';
    }

    /**
     * @param list<string> $arguments
     * @return array{status: int, stdout: string, stderr: string}
     */
    private function invoke(array $arguments): array
    {
        // The library that make ext publishes (T21.4).
        $library = Support::repositoryRoot() . '/var/build/polyspec_template.so';
        $command = array_merge(
            [PHP_BINARY, '-d', 'extension=' . $library, self::command()],
            $arguments,
        );
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
        $this->assertSame('Template', Support::json($result['stdout'])['type']);
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
        $error = Support::json(trim($result['stderr']));
        $this->assertSame('E_PARSE_UNCLOSED_BLOCK', $error['code']);
        $this->assertSame('input.tpl', $error['template']);
    }

    public function testTokensPrintsTheTokensWithByteOffsets(): void
    {
        $directory = Support::casesDirectory() . '/echo/path';
        $result = $this->invoke(['tokens', '--root', $directory, $directory . '/input.tpl']);
        $this->assertSame(0, $result['status'], $result['stderr']);
        $this->assertSame(Support::readJson($directory . '/expected.tokens.json'), Support::json($result['stdout']));
        $failed = $this->invoke(['tokens', Support::casesDirectory() . '/errors/unclosed-block/input.tpl']);
        $this->assertSame(2, $failed['status']);
        $this->assertSame('E_PARSE_UNCLOSED_BLOCK', Support::json(trim($failed['stderr']))['code']);
    }

    public function testFormatPrintsTheFormattedText(): void
    {
        $file = tempnam(sys_get_temp_dir(), 'fmt');
        $this->assertIsString($file);
        file_put_contents($file, "<ul>\n<li>{=a}</li>\n</ul>");
        try {
            $this->assertSame(
                ['status' => 0, 'stdout' => "<ul>\n  <li>{= a}</li>\n</ul>", 'stderr' => ''],
                $this->invoke(['format', $file]),
            );
            $this->assertSame(
                "<ul>\n<li>{= a}</li>\n</ul>",
                $this->invoke(['format', '--indent', 'none', $file])['stdout'],
            );
            file_put_contents($file, "<p>\n  {? a}\n</p>");
            $failed = $this->invoke(['format', $file]);
            $this->assertSame(2, $failed['status']);
            $error = Support::json($failed['stderr']);
            $this->assertIsArray($error);
            $this->assertSame(
                ['parse', 'E_PARSE_UNCLOSED_BLOCK', 2, 3],
                [$error['reason'], $error['code'], $error['line'], $error['col']],
            );
            $this->assertSame(1, $this->invoke(['format', '--indent', 'x', $file])['status']);
        } finally {
            unlink($file);
        }
    }

    public function testUsageErrorExitsWithStatusOne(): void
    {
        $this->assertSame(1, $this->invoke(['parse'])['status']);
        $this->assertSame(1, $this->invoke(['render', '--unknown', '1', __DIR__ . '/templates/echo.tpl'])['status']);
    }
}
