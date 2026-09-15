// Compiler runtime interface declaration checks.
use serde::Deserialize;
use std::collections::HashMap;
use std::fs;
use syn::{Fields, ImplItem, Item, TraitItem};

#[derive(Deserialize)]
struct Manifest {
    #[serde(rename = "runtimeContract")]
    runtime_contract: RuntimeContract,
    languages: Languages,
}

#[derive(Deserialize)]
struct Languages {
    rust: RustMapping,
}

#[derive(Deserialize)]
struct RustMapping {
    #[serde(rename = "runtimeBindingsExplicitContext")]
    runtime_bindings_explicit_context: Vec<String>,
    #[serde(rename = "runtimeBindingOperationNames")]
    runtime_binding_operation_names: HashMap<String, String>,
    #[serde(rename = "runtimeServiceOperationNames")]
    runtime_service_operation_names: RuntimeServiceOperationNames,
    #[serde(rename = "frameFields")]
    frame_fields: Vec<String>,
    #[serde(rename = "scopeFields")]
    scope_fields: Vec<String>,
    #[serde(rename = "scopeOperations")]
    scope_operations: Vec<String>,
    #[serde(rename = "runtimeEnvironmentFields")]
    runtime_environment_fields: Vec<String>,
    #[serde(rename = "runtimeEnvironmentOperations")]
    runtime_environment_operations: Vec<String>,
}

#[derive(Deserialize)]
struct RuntimeServiceOperationNames {
    limits: String,
    #[serde(rename = "hostFunction")]
    host_function: String,
    #[serde(rename = "classFunction")]
    class_function: String,
}

#[derive(Deserialize)]
struct RuntimeContract {
    #[serde(rename = "Program")]
    program: ProgramContract,
    #[serde(rename = "Engine")]
    engine: EngineContract,
    #[serde(rename = "RuntimeBindings")]
    runtime_bindings: BindingsContract,
    #[serde(rename = "RuntimeServices")]
    runtime_services: BindingsContract,
    #[serde(rename = "RuntimeEnvironment")]
    runtime_environment: RuntimeEnvironmentContract,
}

#[derive(Deserialize)]
struct ProgramContract {
    operations: Vec<Operation>,
}

#[derive(Deserialize)]
struct EngineContract {
    owns: Vec<String>,
    operations: Vec<String>,
}

#[derive(Deserialize)]
struct BindingsContract {
    operations: Vec<Operation>,
}

#[derive(Deserialize)]
struct RuntimeEnvironmentContract {
    fields: Vec<String>,
    operations: Vec<Operation>,
}

#[derive(Deserialize)]
struct Operation {
    name: String,
    parameters: Vec<String>,
}

#[test]
fn runtime_declarations_match_manifest() {
    let manifest_path = std::env::var("TEMPLATE_INTERFACE_MANIFEST").unwrap_or_else(|_| "../../tools/compiler/interface.json".to_string());
    let manifest: Manifest = serde_json::from_str(&fs::read_to_string(manifest_path).unwrap()).unwrap();
    let source = syn::parse_file(&fs::read_to_string("src/render/engine.rs").unwrap()).unwrap();

    let program = source
        .items
        .iter()
        .find_map(|item| match item {
            Item::Trait(item) if item.ident == "Program" => Some(item),
            _ => None,
        })
        .expect("Program trait is missing");
    let methods: Vec<_> = program
        .items
        .iter()
        .filter_map(|item| match item {
            TraitItem::Fn(method) => Some(method),
            _ => None,
        })
        .collect();
    assert_eq!(methods.len(), manifest.runtime_contract.program.operations.len());
    for (method, operation) in methods.iter().zip(&manifest.runtime_contract.program.operations) {
        assert_eq!(method.sig.ident, operation.name);
        assert_eq!(method.sig.inputs.len() - 1, operation.parameters.len());
    }

    let engine = source
        .items
        .iter()
        .find_map(|item| match item {
            Item::Struct(item) if item.ident == "Engine" => Some(item),
            _ => None,
        })
        .expect("Engine struct is missing");
    let Fields::Named(fields) = &engine.fields else {
        panic!("Engine fields are not named")
    };
    let owned: Vec<_> = fields.named.iter().map(|field| field.ident.as_ref().unwrap().to_string()).collect();
    assert_eq!(owned, manifest.runtime_contract.engine.owns);

    let implementation = source
        .items
        .iter()
        .find_map(|item| match item {
            Item::Impl(item) => match item.self_ty.as_ref() {
                syn::Type::Path(path) if path.path.is_ident("Engine") => Some(item),
                _ => None,
            },
            _ => None,
        })
        .expect("Engine implementation is missing");
    let operations: Vec<_> = implementation
        .items
        .iter()
        .filter_map(|item| match item {
            ImplItem::Fn(method) if method.sig.ident != "new" => Some(method.sig.ident.to_string()),
            _ => None,
        })
        .collect();
    assert_eq!(operations, manifest.runtime_contract.engine.operations);
    let ast_program = source
        .items
        .iter()
        .find_map(|item| match item {
            Item::Struct(item) if item.ident == "AstProgram" => Some(item),
            _ => None,
        })
        .expect("AstProgram struct is missing");
    let Fields::Named(ast_fields) = &ast_program.fields else {
        panic!("AstProgram fields are not named")
    };
    assert!(
        ast_fields
            .named
            .iter()
            .any(|field| field.ident.as_ref().is_some_and(|name| name == "runtime"))
    );

    let bindings_source = syn::parse_file(&fs::read_to_string("src/render/runtime_bindings.rs").unwrap()).unwrap();
    let implementation = bindings_source
        .items
        .iter()
        .find_map(|item| match item {
            Item::Impl(item) => match item.self_ty.as_ref() {
                syn::Type::Path(path) if path.path.is_ident("RuntimeBindings") => Some(item),
                _ => None,
            },
            _ => None,
        })
        .expect("RuntimeBindings implementation is missing");
    let operations: Vec<_> = implementation
        .items
        .iter()
        .filter_map(|item| match item {
            ImplItem::Fn(method) if method.sig.ident != "new" => Some(method.sig.ident.to_string()),
            _ => None,
        })
        .collect();
    let expected: Vec<_> = manifest
        .runtime_contract
        .runtime_bindings
        .operations
        .iter()
        .map(|operation| {
            manifest
                .languages
                .rust
                .runtime_binding_operation_names
                .get(&operation.name)
                .cloned()
                .unwrap_or_else(|| operation.name.clone())
        })
        .collect();
    assert_eq!(operations, expected);
    for operation in &manifest.runtime_contract.runtime_bindings.operations {
        let method = implementation
            .items
            .iter()
            .find_map(|item| match item {
                ImplItem::Fn(method)
                    if method.sig.ident
                        == manifest
                            .languages
                            .rust
                            .runtime_binding_operation_names
                            .get(&operation.name)
                            .unwrap_or(&operation.name) =>
                {
                    Some(method)
                }
                _ => None,
            })
            .unwrap();
        let context_count = usize::from(manifest.languages.rust.runtime_bindings_explicit_context.contains(&operation.name));
        assert_eq!(method.sig.inputs.len() - 1, operation.parameters.len() + context_count);
    }

    let context_source = syn::parse_file(&fs::read_to_string("src/render/context.rs").unwrap()).unwrap();
    let services = context_source
        .items
        .iter()
        .find_map(|item| match item {
            Item::Trait(item) if item.ident == "RuntimeServices" => Some(item),
            _ => None,
        })
        .expect("RuntimeServices trait is missing");
    let service_methods: Vec<_> = services
        .items
        .iter()
        .filter_map(|item| match item {
            TraitItem::Fn(method) => Some(method),
            _ => None,
        })
        .collect();
    assert_eq!(service_methods.len(), manifest.runtime_contract.runtime_services.operations.len());
    for (method, operation) in service_methods.iter().zip(&manifest.runtime_contract.runtime_services.operations) {
        let expected = match operation.name.as_str() {
            "limits" => &manifest.languages.rust.runtime_service_operation_names.limits,
            "hostFunction" => &manifest.languages.rust.runtime_service_operation_names.host_function,
            "classFunction" => &manifest.languages.rust.runtime_service_operation_names.class_function,
            other => panic!("unknown RuntimeServices operation {other}"),
        };
        assert_eq!(method.sig.ident, expected);
        assert_eq!(method.sig.inputs.len() - 1, operation.parameters.len());
    }
    for (name, expected) in [
        ("Frame", &manifest.languages.rust.frame_fields),
        ("Scope", &manifest.languages.rust.scope_fields),
    ] {
        let structure = context_source
            .items
            .iter()
            .find_map(|item| match item {
                Item::Struct(item) if item.ident == name => Some(item),
                _ => None,
            })
            .unwrap();
        let Fields::Named(fields) = &structure.fields else {
            panic!("{name} fields are not named")
        };
        let actual: Vec<_> = fields.named.iter().map(|field| field.ident.as_ref().unwrap().to_string()).collect();
        assert_eq!(&actual, expected);
    }
    let scope_impl = context_source
        .items
        .iter()
        .find_map(|item| match item {
            Item::Impl(item) => match item.self_ty.as_ref() {
                syn::Type::Path(path) if path.path.is_ident("Scope") => Some(item),
                _ => None,
            },
            _ => None,
        })
        .unwrap();
    let scope_operations: Vec<_> = scope_impl
        .items
        .iter()
        .filter_map(|item| match item {
            ImplItem::Fn(method) => Some(method.sig.ident.to_string()),
            _ => None,
        })
        .collect();
    assert_eq!(scope_operations, manifest.languages.rust.scope_operations);

    let runtime_source = syn::parse_file(&fs::read_to_string("src/render/runtime_environment.rs").unwrap()).unwrap();
    let runtime_environment = runtime_source
        .items
        .iter()
        .find_map(|item| match item {
            Item::Struct(item) if item.ident == "RuntimeEnvironment" => Some(item),
            _ => None,
        })
        .expect("RuntimeEnvironment struct is missing");
    let Fields::Named(runtime_fields) = &runtime_environment.fields else {
        panic!("RuntimeEnvironment fields are not named")
    };
    let actual_fields: Vec<_> = runtime_fields
        .named
        .iter()
        .map(|field| field.ident.as_ref().unwrap().to_string())
        .collect();
    assert_eq!(actual_fields, manifest.languages.rust.runtime_environment_fields);
    assert_eq!(manifest.runtime_contract.runtime_environment.fields, vec!["limits", "hostFunctions", "classFunctions"]);

    let mut actual_operations = Vec::new();
    for item in &runtime_source.items {
        let Item::Impl(implementation) = item else {
            continue;
        };
        let syn::Type::Path(path) = implementation.self_ty.as_ref() else {
            continue;
        };
        if !path.path.is_ident("RuntimeEnvironment") {
            continue;
        }
        for item in &implementation.items {
            if let ImplItem::Fn(method) = item
                && method.sig.ident != "new"
            {
                actual_operations.push((method.sig.ident.to_string(), method.sig.inputs.len() - 1));
            }
        }
    }
    let actual_by_name: HashMap<String, usize> = actual_operations.into_iter().collect();
    for (index, operation) in manifest.runtime_contract.runtime_environment.operations.iter().enumerate() {
        let name = &manifest.languages.rust.runtime_environment_operations[index];
        assert!(actual_by_name.contains_key(name), "RuntimeEnvironment.{name} is missing");
        assert!(operation.parameters.len() <= 3);
    }
}
