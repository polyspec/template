import { describe, expect, it } from 'vitest';
import { PageCache } from '../src/index.js';

describe('PageCache', () => {
  it('deletes one key, preserves empty hits and clears every key (RT-65, RT-66)', () => {
    const cache = new PageCache(() => 100);
    cache.set('empty', '', null);
    cache.set('other', 'other', null);
    expect(cache.getOrSet('empty', null, () => { throw new Error('empty page is a hit'); })).toBe('');
    cache.delete('empty');
    cache.delete('absent');
    expect(cache.get('empty')).toBeNull();
    expect(cache.get('other')).toBe('other');
    expect(cache.getOrSet('empty', null, () => 'new')).toBe('new');
    cache.clear();
    expect(cache.get('empty')).toBeNull();
    expect(cache.get('other')).toBeNull();
  });

  // RT-65: a positive TTL expires after that many seconds; 0 and null mean forever.
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

  // RT-66: getOrSet returns the cached HTML on a hit without calling render; on a miss it calls render once,
  // stores the HTML with the TTL and returns it.
  it('calls the renderer once on a miss and stores its HTML with the TTL (RT-66)', () => {
    let now = 100;
    let calls = 0;
    const cache = new PageCache(() => now);
    expect(cache.getOrSet('page', 10, () => { calls++; return 'first'; })).toBe('first');
    expect(calls).toBe(1);
    expect(cache.getOrSet('page', 10, () => { calls++; return 'second'; })).toBe('first');
    expect(calls).toBe(1);
    expect(cache.get('page')).toBe('first');
    now = 111;
    expect(cache.getOrSet('page', 10, () => { calls++; return 'third'; })).toBe('third');
    expect(calls).toBe(2);
  });
});
