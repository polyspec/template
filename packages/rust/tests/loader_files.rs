//! The filesystem loader keeps no file open (T23.5): it identifies a file by the device and inode number, or the volume
//! serial number and file index, which it reads while the file is open, and closes the file once it has read it, so a
//! loader that read many templates holds no descriptor of them. The test is the only one of its binary, so no other
//! test opens a file while it counts the descriptors of the process.
#![cfg(unix)]

use polyspec_template::{FsLoader, Loader};

const TEMPLATES: usize = 64;

fn open_descriptors() -> usize {
    std::fs::read_dir("/dev/fd").expect("/dev/fd").count()
}

#[test]
fn the_filesystem_loader_keeps_no_file_open() {
    let root = std::env::temp_dir().join(format!("template-loader-files-{}", std::process::id()));
    std::fs::create_dir_all(&root).expect("directory");
    for index in 0..TEMPLATES {
        std::fs::write(root.join(format!("t{index}.tpl")), "x").expect("file");
    }
    let loader = FsLoader::new(&root);
    let before = open_descriptors();
    let loaded = (0..TEMPLATES)
        .filter(|index| loader.load(&format!("t{index}.tpl")).expect("load").is_some())
        .count();
    let after = open_descriptors();
    std::fs::remove_dir_all(&root).expect("cleanup");
    assert_eq!(loaded, TEMPLATES);
    assert_eq!(after, before, "descriptors before and after the loader read {TEMPLATES} templates");
}
