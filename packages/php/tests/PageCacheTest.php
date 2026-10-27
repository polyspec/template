<?php

declare(strict_types=1);

namespace Polyspec\Template\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\PageCache;

final class PageCacheTest extends TestCase
{
    /** RT-65/66: empty pages are hits; deletion affects one key and clear all. */
    public function testDeletePreservesOtherKeysAndClearRemovesEveryPage(): void
    {
        $cache = new PageCache(static fn (): float => 100.0);
        $cache->set('empty', '', null);
        $cache->set('other', 'other', null);
        self::assertSame('', $cache->getOrSet('empty', null, static function (): string {
            self::fail('empty page is a hit');
        }));
        $cache->delete('empty');
        $cache->delete('absent');
        self::assertNull($cache->get('empty'));
        self::assertSame('other', $cache->get('other'));
        self::assertSame('new', $cache->getOrSet('empty', null, static fn (): string => 'new'));
        $cache->clear();
        self::assertNull($cache->get('empty'));
        self::assertNull($cache->get('other'));
    }

    /** RT-65: a positive TTL expires after that many seconds; 0 and null mean forever. */
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

    /**
     * RT-66: getOrSet returns the cached HTML on a hit without calling render; on a miss it calls render once,
     * stores the HTML with the TTL and returns it.
     */
    public function testGetOrSetCallsRenderOnceAndStoresWithTheTtl(): void
    {
        $now = 100.0;
        $cache = new PageCache(static function () use (&$now): float {
            return $now;
        });
        $calls = 0;
        self::assertSame('first', $cache->getOrSet('page', 10.0, function () use (&$calls): string {
            $calls++;

            return 'first';
        }));
        self::assertSame(1, $calls);
        self::assertSame('first', $cache->getOrSet('page', 10.0, function () use (&$calls): string {
            $calls++;

            return 'second';
        }));
        self::assertSame(1, $calls);
        self::assertSame('first', $cache->get('page'));
        $now = 111.0;
        self::assertSame('third', $cache->getOrSet('page', 10.0, function () use (&$calls): string {
            $calls++;

            return 'third';
        }));
        self::assertSame(2, $calls);
    }
}
