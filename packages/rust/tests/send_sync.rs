//! RT-70, VAL-22: a program, its prepared renders, its bound maps and its values are `Send` and `Sync`, so a host renders
//! one program from several threads.

use polyspec_template::{AstProgram, BoundMap, Engine, PreparedRender, Value};

fn send_and_sync<T: Send + Sync>() {}

#[test]
fn programs_prepared_renders_bound_maps_and_values_are_send_and_sync() {
    send_and_sync::<Engine>();
    send_and_sync::<AstProgram>();
    send_and_sync::<PreparedRender<'static>>();
    send_and_sync::<BoundMap>();
    send_and_sync::<Value>();
}
