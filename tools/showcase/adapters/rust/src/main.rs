mod render_adapter;

mod generated {
    pub mod compiler_coverage {
        include!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../generated/typed/compiler-coverage.rust"
        ));
    }
    pub mod empty_state {
        include!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../generated/typed/empty-state.rust"
        ));
    }
    pub mod html_slot {
        include!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../generated/typed/html-slot.rust"
        ));
    }
    pub mod react_boundary {
        include!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../generated/typed/react-boundary.rust"
        ));
    }
    pub mod scope_precedence {
        include!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../generated/typed/scope-precedence.rust"
        ));
    }
}

use polyspec_template::{
    AstProgram, DefineInput, Engine, EngineOptions, Env, MapLoader, RenderOptions, RenderTarget,
    RuntimeEnvironment,
};
use render_adapter::{
    DefineEntry, DefineRegistry, Environment, RenderAdapter, RenderRequest, RepeatResult, Scenario,
};
use serde::Deserialize;
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

struct Adapter {
    root: PathBuf,
    engine: Engine,
}

impl Adapter {
    fn new(root: impl AsRef<Path>) -> Result<Adapter, String> {
        let root = root.as_ref().to_path_buf();
        let generated = std::env::var("SHOWCASE_EXECUTION_MODE").as_deref() == Ok("generated");
        let engine = if generated {
            generated_engine(
                root.file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or_default(),
            )?
        } else {
            Engine::new(AstProgram::new(EngineOptions {
                loader: Some(Box::new(artifact_loader(&root)?)),
                ..Default::default()
            }))
        };
        Ok(Adapter { root, engine })
    }

    fn read_json(&self, name: &str) -> Result<Value, String> {
        let bytes =
            std::fs::read(self.root.join(name)).map_err(|error| format!("{name}: {error}"))?;
        serde_json::from_slice(&bytes).map_err(|error| format!("{name}: {error}"))
    }

    fn read_target(&self) -> Result<String, String> {
        #[derive(Deserialize)]
        struct Metadata {
            target: String,
        }
        let metadata: Metadata = serde_json::from_value(self.read_json("scenario.json")?)
            .map_err(|error| format!("scenario.json: {error}"))?;
        if metadata.target.is_empty() {
            return Err("scenario target is empty".to_string());
        }
        Ok(metadata.target)
    }

    fn read_define(&self) -> Result<DefineRegistry, String> {
        let value = self.read_json("define.json")?;
        let Some(object) = value.as_object() else {
            return Err("define.json must contain an object".to_string());
        };
        let mut define = DefineRegistry::new();
        for (id, entry) in object {
            if let Some(template) = entry.as_str() {
                define.insert(
                    id.clone(),
                    DefineEntry {
                        template: Some(template.to_string()),
                        data: None,
                        html: None,
                    },
                );
                continue;
            }
            let parsed: DefineEntry = serde_json::from_value(entry.clone())
                .map_err(|error| format!("define {id}: {error}"))?;
            let has_template = parsed.template.is_some();
            let has_html = parsed.html.is_some();
            if has_template == has_html {
                return Err(format!("define {id} needs exactly one of template or html"));
            }
            if parsed.data.is_some() && has_html {
                return Err(format!("define {id}.html cannot have data"));
            }
            define.insert(id.clone(), parsed);
        }
        Ok(define)
    }

    fn read_environment(&self) -> Result<Option<Environment>, String> {
        let path = self.root.join("env.json");
        if !path.is_file() {
            return Ok(None);
        }
        let value = self.read_json("env.json")?;
        serde_json::from_value(value)
            .map(Some)
            .map_err(|error| format!("env.json: {error}"))
    }
}

fn generated_runtime() -> RuntimeEnvironment {
    RuntimeEnvironment::new(None, std::collections::HashMap::new())
}

fn generated_engine(scenario: &str) -> Result<Engine, String> {
    Ok(match scenario {
        "compiler-coverage" => Engine::new(generated::compiler_coverage::GeneratedProgram::new(
            generated_runtime(),
        )),
        "empty-state" => Engine::new(generated::empty_state::GeneratedProgram::new(
            generated_runtime(),
        )),
        "html-slot" => Engine::new(generated::html_slot::GeneratedProgram::new(
            generated_runtime(),
        )),
        "react-boundary" => Engine::new(generated::react_boundary::GeneratedProgram::new(
            generated_runtime(),
        )),
        "scope-precedence" => Engine::new(generated::scope_precedence::GeneratedProgram::new(
            generated_runtime(),
        )),
        _ => {
            return Err(format!(
                "generated program is missing for scenario {scenario}"
            ));
        }
    })
}

fn artifact_loader(root: &Path) -> Result<MapLoader, String> {
    #[derive(Deserialize)]
    struct Entry {
        path: String,
    }
    #[derive(Deserialize)]
    struct Manifest {
        files: std::collections::BTreeMap<String, Entry>,
    }
    let base = root.join("compiled").join("ast");
    let manifest_bytes = std::fs::read(base.join("manifest.json"))
        .map_err(|error| format!("compiled AST manifest: {error}"))?;
    let manifest: Manifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|error| format!("compiled AST manifest: {error}"))?;
    let mut loader = MapLoader::new();
    for (name, entry) in manifest.files {
        let path = base.join(entry.path);
        let bytes =
            std::fs::read(&path).map_err(|error| format!("compiled AST/{name}: {error}"))?;
        let ast = serde_json::from_slice(&bytes)
            .map_err(|error| format!("compiled AST/{name}: {error}"))?;
        loader.set_ast(&name, ast);
    }
    Ok(loader)
}

impl RenderAdapter for Adapter {
    fn load_scenario(&self) -> Result<Scenario, String> {
        let assign = self.read_json("data.json")?;
        let Some(assign) = assign.as_object() else {
            return Err("data.json must contain an object".to_string());
        };
        Ok(Scenario {
            target: self.read_target()?,
            assign: assign.clone(),
            define: self.read_define()?,
            env: self.read_environment()?,
        })
    }

    fn build_request(&self, scenario: &Scenario) -> Result<RenderRequest, String> {
        if scenario.target.is_empty() {
            return Err("scenario target is empty".to_string());
        }
        Ok(RenderRequest {
            target: scenario.target.clone(),
            assign: scenario.assign.clone(),
            define: scenario.define.clone(),
            env: scenario.env.clone(),
        })
    }

    fn render(&self, request: &RenderRequest) -> Result<String, String> {
        let mut options = RenderOptions::default();
        for (id, entry) in &request.define {
            options.define.insert(
                id.clone(),
                DefineInput {
                    template: entry.template.clone(),
                    data: entry.data.clone().map(Value::Object),
                    html: entry.html.clone(),
                },
            );
        }
        if let Some(environment) = &request.env {
            options.env = Some(Env {
                timezone: environment
                    .timezone
                    .clone()
                    .unwrap_or_else(|| "Z".to_string()),
                now: environment.now.unwrap_or(0.0),
            });
        }
        self.engine
            .render(
                RenderTarget::Name(&request.target),
                &Value::Object(request.assign.clone()),
                &options,
            )
            .map_err(|error| error.message)
    }

    fn render_twice(&self, request: &RenderRequest) -> Result<RepeatResult, String> {
        let first = self.render(request)?;
        let second = self.render(request)?;
        Ok(RepeatResult { first, second })
    }
}

fn digest(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}

fn request_json(request: &RenderRequest) -> Value {
    let mut define = Map::new();
    for (id, entry) in &request.define {
        if let Some(template) = &entry.template {
            if entry.data.is_none() && entry.html.is_none() {
                define.insert(id.clone(), Value::String(template.clone()));
                continue;
            }
        }
        let mut item = Map::new();
        if let Some(template) = &entry.template {
            item.insert("template".to_string(), Value::String(template.clone()));
        }
        if let Some(data) = &entry.data {
            item.insert("data".to_string(), Value::Object(data.clone()));
        }
        if let Some(html) = &entry.html {
            item.insert("html".to_string(), Value::String(html.clone()));
        }
        define.insert(id.clone(), Value::Object(item));
    }
    let mut result = Map::new();
    result.insert("target".to_string(), Value::String(request.target.clone()));
    result.insert("assign".to_string(), Value::Object(request.assign.clone()));
    result.insert("define".to_string(), Value::Object(define));
    if let Some(environment) = &request.env {
        let mut env = Map::new();
        if let Some(timezone) = &environment.timezone {
            env.insert("timezone".to_string(), Value::String(timezone.clone()));
        }
        if let Some(now) = environment.now {
            env.insert("now".to_string(), serde_json::json!(now));
        }
        result.insert("env".to_string(), Value::Object(env));
    }
    Value::Object(result)
}

fn main() {
    let root = std::env::args().nth(1).unwrap_or_else(|| {
        eprintln!("usage: showcase-adapter-rust SCENARIO_DIR");
        std::process::exit(1);
    });
    let adapter = Adapter::new(root).unwrap_or_else(|error| panic!("{error}"));
    let scenario = adapter
        .load_scenario()
        .unwrap_or_else(|error| panic!("{error}"));
    let request = adapter
        .build_request(&scenario)
        .unwrap_or_else(|error| panic!("{error}"));
    let repeated = adapter
        .render_twice(&request)
        .unwrap_or_else(|error| panic!("{error}"));
    let mut invalid = request.clone();
    invalid.target = "__contract_missing_target__".to_string();
    let before_failure =
        serde_json::to_vec(&request_json(&request)).unwrap_or_else(|error| panic!("{error}"));
    let failure_observed = adapter.render(&invalid).is_err();
    let after_failure =
        serde_json::to_vec(&request_json(&request)).unwrap_or_else(|error| panic!("{error}"));
    let recovered = adapter
        .render(&request)
        .unwrap_or_else(|error| panic!("{error}"));
    let output = serde_json::json!({
        "language": "rust",
        "type": "Adapter",
        "operations": ["loadScenario", "buildRequest", "render", "renderTwice"],
        "request": request_json(&request),
        "bytes": repeated.first.len(),
        "firstSha256": digest(&repeated.first),
        "secondSha256": digest(&repeated.second),
        "failureObserved": failure_observed,
        "requestUnchanged": before_failure == after_failure,
        "recoveredSha256": digest(&recovered),
    });
    println!("{output}");
}
