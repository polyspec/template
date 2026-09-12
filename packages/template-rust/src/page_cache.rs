//! Final HTML page cache, separate from compiled template artifacts.
use std::collections::HashMap;

#[derive(Debug, Clone)]
struct Entry {
    html: String,
    expires_at: Option<f64>,
}

/// Stores final rendered HTML pages independently from template artifacts.
#[derive(Debug, Default)]
pub struct PageCache {
    entries: HashMap<String, Entry>,
}

impl PageCache {
    /// Creates an empty page cache.
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns an unexpired page at the supplied Unix timestamp.
    pub fn get(&mut self, key: &str, now: f64) -> Option<String> {
        let expired = self
            .entries
            .get(key)
            .and_then(|entry| entry.expires_at)
            .is_some_and(|expires| expires <= now);
        if expired {
            self.entries.remove(key);
            return None;
        }
        self.entries.get(key).map(|entry| entry.html.clone())
    }

    /// Stores a page. `None` and zero mean no expiration.
    pub fn set(&mut self, key: impl Into<String>, html: impl Into<String>, ttl: Option<f64>, now: f64) -> Result<(), String> {
        if ttl.is_some_and(|value| !value.is_finite() || value < 0.0) {
            return Err("page cache ttl must be null or non-negative".to_string());
        }
        let expires_at = ttl.filter(|value| *value > 0.0).map(|value| now + value);
        self.entries.insert(
            key.into(),
            Entry {
                html: html.into(),
                expires_at,
            },
        );
        Ok(())
    }

    /// Returns a cached page or renders and stores it on a miss.
    pub fn get_or_set<F>(&mut self, key: &str, ttl: Option<f64>, now: f64, render: F) -> Result<String, String>
    where F: FnOnce() -> Result<String, String> {
        if let Some(html) = self.get(key, now) { return Ok(html); }
        let html = render()?;
        self.set(key, html.clone(), ttl, now)?;
        Ok(html)
    }

    /// Removes one page.
    pub fn delete(&mut self, key: &str) {
        self.entries.remove(key);
    }

    /// Removes all pages.
    pub fn clear(&mut self) {
        self.entries.clear();
    }
}
