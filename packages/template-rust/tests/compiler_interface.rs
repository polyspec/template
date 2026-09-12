// Compiler runtime interface declaration checks.
use serde::Deserialize;
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
    #[serde(rename = "runtimeServiceOperationNames")]
    runtime_service_operation_names: RuntimeServiceOperationNames,
}

#[derive(Deserialize)]
struct RuntimeServiceOperationNames {
    limits: String,
    #[serde(rename = "hostFunction")]
    host_function: String,
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
    assert!(
        source
            .items
            .iter()
            .any(|item| matches!(item, Item::Struct(item) if item.ident == "AstProgram"))
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
        .map(|operation| operation.name.clone())
        .collect();
    assert_eq!(operations, expected);
    for operation in &manifest.runtime_contract.runtime_bindings.operations {
        let method = implementation
            .items
            .iter()
            .find_map(|item| match item {
                ImplItem::Fn(method) if method.sig.ident == operation.name => Some(method),
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
            other => panic!("unknown RuntimeServices operation {other}"),
        };
        assert_eq!(method.sig.ident, expected);
        assert_eq!(method.sig.inputs.len() - 1, operation.parameters.len());
    }
}
