<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\AstProgram;
use Polyspec\Template\Engine;
use Polyspec\Template\Loader\ArrayLoader;

final class ObjectCallsTest extends TestCase
{
    public function testAssignedObjectRetainsPublicFieldsAndMethods(): void
    {
        $program = new AstProgram(new ArrayLoader(['page.tpl' => '{= order.total}|{= order.status_label("ready")}']));
        $order = new class {
            public float $total = 12.0;
            public function status_label(string $prefix): string { return $prefix . ':' . (int) $this->total; }
        };

        self::assertSame('12|ready:12', (new Engine($program))->render('page.tpl', ['order' => $order]));
    }

    public function testRegisteredClassFunctionIsCallable(): void
    {
        $program = new AstProgram(new ArrayLoader(['page.tpl' => '{= Order::status_label("ready")}']));
        $program->registerClass('Order', 'status_label', static fn (array $args): string => $args[0] . ':ok');

        self::assertSame('ready:ok', (new Engine($program))->render('page.tpl'));
    }
}
