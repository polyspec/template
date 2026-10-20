<?php

declare(strict_types=1);

namespace Polyspec\Template\Native\Tests;

use PHPUnit\Framework\TestCase;
use Polyspec\Template\PageCache;

/**
 * The page cache of the library as the extension registers it: a key holds its HTML until its time to live has passed
 * on the clock of the cache, a time to live of null or zero keeps it, and a negative or non-finite one is refused.
 */
final class PageCacheClassTest extends TestCase
{
    public function testTheExtensionRegistersThePageCache(): void
    {
        $class = new \ReflectionClass(PageCache::class);
        $this->assertTrue($class->isInternal(), 'PageCache is not registered by the extension');
        $this->assertTrue($class->isFinal());
    }

    public function testAnEntryLivesForItsTimeToLiveOnTheClockOfTheCache(): void
    {
        $now = 100.0;
        $cache = new PageCache(static function () use (&$now): float {
            return $now;
        });
        $renders = 0;
        $render = static function () use (&$renders): string {
            $renders++;

            return '<p>' . $renders . '</p>';
        };

        $this->assertSame('<p>1</p>', $cache->getOrSet('a', 10.0, $render));
        $now = 109.0;
        $this->assertSame('<p>1</p>', $cache->getOrSet('a', 10.0, $render));
        $now = 110.0;
        $this->assertNull($cache->get('a'));
        $this->assertSame('<p>2</p>', $cache->getOrSet('a', 10.0, $render));

        $cache->set('kept', '<b>', 0.0);
        $cache->set('null', '<i>', null);
        $now = 1e9;
        $this->assertSame(['<b>', '<i>'], [$cache->get('kept'), $cache->get('null')]);
        $cache->delete('kept');
        $this->assertNull($cache->get('kept'));
        $cache->clear();
        $this->assertNull($cache->get('null'));
    }

    public function testATimeToLiveMustBeNullOrNonNegative(): void
    {
        foreach ([-1.0, INF, NAN] as $ttl) {
            try {
                (new PageCache())->set('a', 'x', $ttl);
                $this->fail('an argument error expected');
            } catch (\InvalidArgumentException $error) {
                $this->assertSame('page cache ttl must be null or non-negative', $error->getMessage());
            }
        }
    }
}
