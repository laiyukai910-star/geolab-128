#[cfg(any(target_arch = "wasm32", test))]
use geolab_core::{MAX_CORE_CELLS, ScenarioInput, engine_capabilities, simulate};
#[cfg(any(target_arch = "wasm32", test))]
use serde::Serialize;

#[cfg(any(target_arch = "wasm32", test))]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SimulationEnvelope<T> {
    report: T,
}

#[cfg(any(target_arch = "wasm32", test))]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorEnvelope {
    error: ErrorBody,
}

#[cfg(any(target_arch = "wasm32", test))]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorBody {
    code: &'static str,
    message: String,
    field: Option<String>,
}

#[cfg(any(target_arch = "wasm32", test))]
fn capabilities_json() -> Vec<u8> {
    serialize_or_fallback(&engine_capabilities(MAX_CORE_CELLS))
}

#[cfg(any(target_arch = "wasm32", test))]
fn simulate_json(input_json: &[u8]) -> Vec<u8> {
    let input = match serde_json::from_slice::<ScenarioInput>(input_json) {
        Ok(input) => input,
        Err(error) => {
            return serialize_or_fallback(&ErrorEnvelope {
                error: ErrorBody {
                    code: "invalid_json",
                    message: error.to_string(),
                    field: None,
                },
            });
        }
    };
    match simulate(&input) {
        Ok(report) => serialize_or_fallback(&SimulationEnvelope { report }),
        Err(error) => serialize_or_fallback(&ErrorEnvelope {
            error: ErrorBody {
                code: "invalid_scenario",
                message: error.message,
                field: Some(error.field),
            },
        }),
    }
}

#[cfg(any(target_arch = "wasm32", test))]
fn serialize_or_fallback<T: Serialize>(value: &T) -> Vec<u8> {
    serde_json::to_vec(value).unwrap_or_else(|error| {
        format!(
            "{{\"error\":{{\"code\":\"serialization_failed\",\"message\":{},\"field\":null}}}}",
            serde_json::to_string(&error.to_string()).unwrap_or_else(|_| "\"unknown\"".to_string())
        )
        .into_bytes()
    })
}

#[cfg(target_arch = "wasm32")]
fn leak_bytes(bytes: Vec<u8>) -> u64 {
    let bytes = bytes.into_boxed_slice();
    let length = u32::try_from(bytes.len()).expect("WASM response exceeds the 32-bit ABI limit");
    let pointer = Box::into_raw(bytes) as *mut u8 as u32;
    (u64::from(length) << 32) | u64::from(pointer)
}

#[cfg(target_arch = "wasm32")]
#[unsafe(no_mangle)]
pub extern "C" fn geolab_alloc(length: u32) -> u32 {
    let bytes = vec![0_u8; length as usize].into_boxed_slice();
    Box::into_raw(bytes) as *mut u8 as u32
}

#[cfg(target_arch = "wasm32")]
#[unsafe(no_mangle)]
pub extern "C" fn geolab_dealloc(pointer: u32, length: u32) {
    if pointer == 0 || length == 0 {
        return;
    }
    let slice = std::ptr::slice_from_raw_parts_mut(pointer as *mut u8, length as usize);
    // SAFETY: pointers returned by geolab_alloc and leak_bytes retain their exact slice length.
    unsafe { drop(Box::from_raw(slice)) };
}

#[cfg(target_arch = "wasm32")]
#[unsafe(no_mangle)]
pub extern "C" fn geolab_capabilities_json() -> u64 {
    leak_bytes(capabilities_json())
}

#[cfg(target_arch = "wasm32")]
#[unsafe(no_mangle)]
pub extern "C" fn geolab_simulate_json(pointer: u32, length: u32) -> u64 {
    if pointer == 0 || length == 0 {
        return leak_bytes(simulate_json(&[]));
    }
    // SAFETY: the caller obtains this allocation through geolab_alloc and keeps it alive
    // until this synchronous function returns.
    let input = unsafe { std::slice::from_raw_parts(pointer as *const u8, length as usize) };
    leak_bytes(simulate_json(input))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn capabilities_are_serialized_from_the_shared_core_contract() {
        let value: Value = serde_json::from_slice(&capabilities_json()).expect("valid JSON");
        assert_eq!(value["engine"], "geolab-core-rust");
        assert_eq!(value["maxApiCells"], MAX_CORE_CELLS);
        assert_eq!(value["routing"][1], "priority-flood-freeman-mfd");
    }

    #[test]
    fn malformed_json_returns_a_structured_error() {
        let value: Value = serde_json::from_slice(&simulate_json(b"{")).expect("valid JSON");
        assert_eq!(value["error"]["code"], "invalid_json");
    }
}
