// Package cache stores final rendered pages independently from template artifacts.
package cache

import (
	"fmt"
	"sync"
	"time"
)

type Entry struct {
	HTML      string
	ExpiresAt *time.Time
}

type PageCache struct {
	mu         sync.Mutex
	now        func() time.Time
	mapEntries map[string]Entry
}

func NewPageCache(now func() time.Time) *PageCache {
	if now == nil {
		now = time.Now
	}
	return &PageCache{now: now, mapEntries: map[string]Entry{}}
}

func (c *PageCache) Get(key string) (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.mapEntries[key]
	if !ok {
		return "", false
	}
	if entry.ExpiresAt != nil && !entry.ExpiresAt.After(c.now()) {
		delete(c.mapEntries, key)
		return "", false
	}
	return entry.HTML, true
}

func (c *PageCache) Set(key, html string, ttl *time.Duration) error {
	if ttl != nil && *ttl < 0 {
		return fmt.Errorf("page cache ttl must be nil or non-negative")
	}
	var expires *time.Time
	if ttl != nil && *ttl > 0 {
		value := c.now().Add(*ttl)
		expires = &value
	}
	c.mu.Lock()
	c.mapEntries[key] = Entry{HTML: html, ExpiresAt: expires}
	c.mu.Unlock()
	return nil
}

// GetOrSet returns a cached page or renders and stores it on a miss.
func (c *PageCache) GetOrSet(key string, ttl *time.Duration, render func() (string, error)) (string, error) {
	if html, ok := c.Get(key); ok { return html, nil }
	html, err := render(); if err != nil { return "", err }
	if err := c.Set(key, html, ttl); err != nil { return "", err }
	return html, nil
}

func (c *PageCache) Delete(key string) { c.mu.Lock(); delete(c.mapEntries, key); c.mu.Unlock() }
func (c *PageCache) Clear()            { c.mu.Lock(); clear(c.mapEntries); c.mu.Unlock() }
