use polyspec_template::page_cache::PageCache;

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

#[test]
fn get_or_set_skips_renderer_on_hit() {
    let mut cache = PageCache::new();
    let mut calls = 0;
    assert_eq!(
        cache
            .get_or_set("page", None, 100.0, || {
                calls += 1;
                Ok("first".to_string())
            })
            .unwrap(),
        "first"
    );
    assert_eq!(
        cache
            .get_or_set("page", None, 100.0, || {
                calls += 1;
                Ok("second".to_string())
            })
            .unwrap(),
        "first"
    );
    assert_eq!(calls, 1);
}
