<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\PageCache;

final class PageCacheTest extends TestCase
{
    public function testPositiveTtlExpiresAndZeroOrNullArePermanent(): void
    {
        $now = 100.0;
        $cache = new PageCache(static function () use (&$now): float {
            return $now;
        });
        $cache->set('short', 'short', 10.0);
        $cache->set('zero', 'zero', 0.0);
        $cache->set('null', 'null', null);
        $now = 111.0;
        self::assertNull($cache->get('short'));
        self::assertSame('zero', $cache->get('zero'));
        self::assertSame('null', $cache->get('null'));
    }
}
