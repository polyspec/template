package cache

import (
	"testing"
	"time"
)

// RT-65: a positive TTL expires after that many seconds; 0 and null mean forever.
func TestPageCacheTTL(t *testing.T) {
	now := time.Unix(100, 0)
	cache := NewPageCache(func() time.Time { return now })
	ttl := 10 * time.Second
	if err := cache.Set("short", "short", &ttl); err != nil {
		t.Fatal(err)
	}
	zero := time.Duration(0)
	if err := cache.Set("zero", "zero", &zero); err != nil {
		t.Fatal(err)
	}
	if err := cache.Set("null", "null", nil); err != nil {
		t.Fatal(err)
	}
	now = time.Unix(111, 0)
	if _, ok := cache.Get("short"); ok {
		t.Error("short entry did not expire")
	}
	if value, ok := cache.Get("zero"); !ok || value != "zero" {
		t.Error("zero entry was not permanent")
	}
	if value, ok := cache.Get("null"); !ok || value != "null" {
		t.Error("null entry was not permanent")
	}
}

// RT-66: GetOrSet returns the cached HTML on a hit without calling render; on a miss it calls render once,
// stores the HTML with the TTL and returns it.
func TestPageCacheGetOrSetCallsRenderOnceAndStoresWithTheTTL(t *testing.T) {
	now := time.Unix(100, 0)
	cache := NewPageCache(func() time.Time { return now })
	ttl := 10 * time.Second
	calls := 0
	if html, err := cache.GetOrSet("page", &ttl, func() (string, error) { calls++; return "first", nil }); err != nil || html != "first" {
		t.Fatalf("miss: got %q %v, want \"first\" nil", html, err)
	}
	if calls != 1 {
		t.Fatalf("after miss: calls = %d, want 1", calls)
	}
	if html, err := cache.GetOrSet("page", &ttl, func() (string, error) { calls++; return "second", nil }); err != nil || html != "first" {
		t.Fatalf("hit: got %q %v, want \"first\" nil", html, err)
	}
	if calls != 1 {
		t.Fatalf("after hit: calls = %d, want 1 (a hit must not call render)", calls)
	}
	if value, ok := cache.Get("page"); !ok || value != "first" {
		t.Fatalf("Get after miss: got %q %v, want \"first\" true", value, ok)
	}
	now = time.Unix(111, 0)
	if html, err := cache.GetOrSet("page", &ttl, func() (string, error) { calls++; return "third", nil }); err != nil || html != "third" {
		t.Fatalf("after TTL: got %q %v, want \"third\" nil", html, err)
	}
	if calls != 2 {
		t.Fatalf("after TTL: calls = %d, want 2 (stored entry should have expired)", calls)
	}
}

// TestPageCacheDeleteAndClear: Delete removes one entry and Clear every entry.
func TestPageCacheDeleteAndClear(t *testing.T) {
	emptyCache := NewPageCache(func() time.Time { return time.Unix(100, 0) })
	if err := emptyCache.Set("empty", "", nil); err != nil {
		t.Fatal(err)
	}
	if html, err := emptyCache.GetOrSet("empty", nil, func() (string, error) { t.Fatal("empty page is a hit"); return "", nil }); html != "" || err != nil {
		t.Fatalf("empty hit: %q %v", html, err)
	}
	emptyCache.Delete("empty")
	emptyCache.Delete("absent")
	if html, err := emptyCache.GetOrSet("empty", nil, func() (string, error) { return "new", nil }); html != "new" || err != nil {
		t.Fatalf("deleted miss: %q %v", html, err)
	}

	cache := NewPageCache(func() time.Time { return time.Unix(100, 0) })
	for _, key := range []string{"a", "b", "c"} {
		if err := cache.Set(key, key, nil); err != nil {
			t.Fatal(err)
		}
	}
	cache.Delete("a")
	if _, ok := cache.Get("a"); ok {
		t.Error("a remained after Delete")
	}
	if value, ok := cache.Get("b"); !ok || value != "b" {
		t.Error("Delete removed another entry")
	}
	cache.Clear()
	for _, key := range []string{"b", "c"} {
		if _, ok := cache.Get(key); ok {
			t.Errorf("%s remained after Clear", key)
		}
	}
}
