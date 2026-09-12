package cache

import (
	"testing"
	"time"
)

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
