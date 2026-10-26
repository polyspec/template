pub fn escape_implementation() -> String {
    polyspec_template::escape::escape_html("<").into_owned()
}
