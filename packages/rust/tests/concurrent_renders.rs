//! RT-70: renders of one program may run at the same time and share only the templates that the program loaded. Eight
//! threads render one program, each with its own data, and each render produces the output of its own data.

use polyspec_template::{AstProgram, EngineOptions, MapLoader, OrderedMap, RenderOptions, RenderTarget, Value};

#[test]
fn concurrent_renders_share_one_program_and_keep_their_own_data() {
    let mut loader = MapLoader::new();
    loader.set("a.tpl", "<p>{= x}</p>");
    let program = AstProgram::new(EngineOptions {
        loader: Some(Box::new(loader)),
        ..Default::default()
    })
    .expect("valid engine options");
    let options = RenderOptions::default();
    std::thread::scope(|scope| {
        let handles: Vec<_> = (0..8)
            .map(|index| {
                let program = &program;
                let options = &options;
                scope.spawn(move || {
                    let x = format!("v{index}");
                    let mut root = OrderedMap::new();
                    root.insert("x".to_string(), Value::text(x.as_str()));
                    let output = program.render_values(RenderTarget::Name("a.tpl"), root, options).expect("render");
                    (x, output)
                })
            })
            .collect();
        for handle in handles {
            let (x, output) = handle.join().expect("thread");
            assert_eq!(output, format!("<p>{x}</p>"));
        }
    });
}
