use polyspec_template::page_cache::PageCache;

/// RT-65: a positive TTL expires after that many seconds; 0 and null mean forever.
#[test]
fn ttl_zero_and_null_are_permanent() {
    let mut cache = PageCache::new();
    cache.set("short", "short", Some(10.0), 100.0).unwrap();
    cache.set("zero", "zero", Some(0.0), 100.0).unwrap();
    cache.set("null", "null", None, 100.0).unwrap();
    assert_eq!(cache.get("short", 111.0), None);
    assert_eq!(cache.get("zero", 111.0).as_deref(), Some("zero"));
    assert_eq!(cache.get("null", 111.0).as_deref(), Some("null"));
}

// RT-66: get_or_set returns the cached HTML on a hit without calling render; on a miss it calls render once,
// stores the HTML with the TTL and returns it.
#[test]
fn get_or_set_calls_render_once_and_stores_with_the_ttl() {
    let mut cache = PageCache::new();
    let ttl = Some(10.0);
    let mut calls = 0;
    assert_eq!(
        cache
            .get_or_set("page", ttl, 100.0, || {
                calls += 1;
                Ok("first".to_string())
            })
            .unwrap(),
        "first"
    );
    assert_eq!(calls, 1);
    assert_eq!(
        cache
            .get_or_set("page", ttl, 100.0, || {
                calls += 1;
                Ok("second".to_string())
            })
            .unwrap(),
        "first"
    );
    assert_eq!(calls, 1);
    assert_eq!(cache.get("page", 100.0).as_deref(), Some("first"));
    assert_eq!(
        cache
            .get_or_set("page", ttl, 111.0, || {
                calls += 1;
                Ok("third".to_string())
            })
            .unwrap(),
        "third"
    );
    assert_eq!(calls, 2);
}
