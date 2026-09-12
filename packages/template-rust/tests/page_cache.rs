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
