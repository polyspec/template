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

func TestPageCacheGetOrSetSkipsRendererOnHit(t *testing.T) {
	now := time.Unix(100, 0)
	cache := NewPageCache(func() time.Time { return now })
	calls := 0
	if html, err := cache.GetOrSet("page", nil, func() (string, error) { calls++; return "first", nil }); err != nil || html != "first" {
		t.Fatalf("first: %q %v", html, err)
	}
	if html, err := cache.GetOrSet("page", nil, func() (string, error) { calls++; return "second", nil }); err != nil || html != "first" {
		t.Fatalf("second: %q %v", html, err)
	}
	if calls != 1 {
		t.Fatalf("calls = %d, want 1", calls)
	}
}

// TestPageCacheDeleteAndClear: Delete removes one entry and Clear every entry.
func TestPageCacheDeleteAndClear(t *testing.T) {
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
