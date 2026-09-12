import { describe, expect, it } from 'vitest';
import { PageCache } from '../src/index.js';

describe('PageCache', () => {
  it('expires positive TTLs and keeps zero and null forever', () => {
    let now = 100;
    const cache = new PageCache(() => now);
    cache.set('short', '<p>short</p>', 10);
    cache.set('zero', '<p>zero</p>', 0);
    cache.set('null', '<p>null</p>', null);
    now = 111;
    expect(cache.get('short')).toBeNull();
    expect(cache.get('zero')).toBe('<p>zero</p>');
    expect(cache.get('null')).toBe('<p>null</p>');
  });

  it('does not call the renderer on a cache hit', () => {
    let calls = 0;
    const cache = new PageCache(() => 100);
    expect(cache.getOrSet('page', null, () => { calls++; return 'first'; })).toBe('first');
    expect(cache.getOrSet('page', null, () => { calls++; return 'second'; })).toBe('first');
    expect(calls).toBe(1);
  });
});
