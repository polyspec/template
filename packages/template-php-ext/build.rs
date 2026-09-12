// PHP symbols are resolved by the PHP binary that loads the extension, so the macOS linker must
// not require them at link time. The argument is emitted here rather than in `.cargo/config.toml`
// so that it applies when cargo is invoked from another directory with `--manifest-path`.
fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo::rustc-link-arg-cdylib=-Wl,-undefined,dynamic_lookup");
    }
}
