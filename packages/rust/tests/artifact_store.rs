//! RT-56 ArtifactStore.loadOrRefresh: Dev builds on every call, True reuses an artifact that loads, and False never builds.

mod common;

use polyspec_template::ArtifactRefresh;
use polyspec_template::artifact::load_or_refresh;
use std::cell::Cell;

#[test]
fn load_or_refresh_follows_its_policy() {
    let directory = common::repo_root().join("tests").join("fixtures").join("artifact-runtime").join("artifact");
    let builds = Cell::new(0);
    let build = |_: &std::path::Path| {
        builds.set(builds.get() + 1);
        Ok(())
    };
    load_or_refresh(&directory, ArtifactRefresh::True, build).expect("true loads");
    assert_eq!(builds.get(), 0, "true built an artifact that loads");
    load_or_refresh(&directory, ArtifactRefresh::Dev, build).expect("dev loads");
    assert_eq!(builds.get(), 1, "dev builds on every call");
    load_or_refresh(&directory, ArtifactRefresh::False, build).expect("false loads");
    assert_eq!(builds.get(), 1, "false never builds");
    let missing = directory.with_file_name("none");
    assert!(load_or_refresh(&missing, ArtifactRefresh::False, build).is_err(), "false loaded a missing artifact");
}
