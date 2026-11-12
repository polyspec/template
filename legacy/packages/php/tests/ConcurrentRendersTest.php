<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;
use Polyspec\Template\Loader\ArrayLoader;

/**
 * RT-70: renders of one program may run at the same time and share only the templates that the program loaded. PHP has
 * no concurrent host code, so the renders are interleaved: eight renders of one program, each with its own data,
 * produce the output of their own data. The PHP extension runs this file too (config/parity.json).
 */
final class ConcurrentRendersTest extends TestCase
{
    public function testInterleavedRendersOfOneProgramKeepTheirOwnData(): void
    {
        $program = new AstProgram(new ArrayLoader(['a.tpl' => '<p>{= x}</p>']));
        $renders = [];
        for ($index = 0; $index < 8; ++$index) {
            $renders[] = ['x' => 'v' . $index];
        }
        $outputs = [];
        foreach ($renders as $data) {
            $outputs[] = $program->render('a.tpl', $data);
        }
        foreach ($renders as $index => $data) {
            self::assertSame('<p>' . $data['x'] . '</p>', $outputs[$index]);
        }
    }
}
