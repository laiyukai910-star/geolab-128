use axum::extract::{DefaultBodyLimit, State};
use axum::http::{HeaderValue, Method, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use geolab_core::{
    API_VERSION, ENGINE_NAME, EngineCapabilities, ModelError, ScenarioInput, SimulationReport,
    engine_capabilities,
};
use serde::Serialize;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tokio::sync::Semaphore;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::trace::TraceLayer;

pub const MAX_API_CELLS: usize = 262_144;
pub const MAX_REQUEST_BYTES: usize = 64 * 1024 * 1024;
pub const SIMULATION_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Clone)]
pub struct AppState {
    semaphore: Arc<Semaphore>,
    request_counter: Arc<AtomicU64>,
}

impl AppState {
    pub fn new(max_concurrent_simulations: usize) -> Self {
        Self {
            semaphore: Arc::new(Semaphore::new(max_concurrent_simulations.max(1))),
            request_counter: Arc::new(AtomicU64::new(0)),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthResponse {
    status: &'static str,
    engine: &'static str,
    api_version: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SimulationEnvelope {
    request_id: String,
    report: SimulationReport,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ValidationResponse {
    valid: bool,
    api_version: &'static str,
    cell_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorResponse {
    code: &'static str,
    message: String,
    field: Option<String>,
}

#[derive(Debug)]
enum ApiError {
    Invalid(ModelError),
    TooLarge(usize),
    Busy,
    Timeout,
    Worker(String),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, code, message, field) = match self {
            Self::Invalid(error) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "invalid_scenario",
                error.message,
                Some(error.field),
            ),
            Self::TooLarge(cell_count) => (
                StatusCode::PAYLOAD_TOO_LARGE,
                "grid_too_large",
                format!("API requests are limited to {MAX_API_CELLS} cells; received {cell_count}"),
                Some("grid".to_string()),
            ),
            Self::Busy => (
                StatusCode::SERVICE_UNAVAILABLE,
                "simulation_capacity_exhausted",
                "The local computation pool is busy; retry after an active simulation completes."
                    .to_string(),
                None,
            ),
            Self::Timeout => (
                StatusCode::REQUEST_TIMEOUT,
                "simulation_timeout",
                format!(
                    "Simulation exceeded the {} second execution limit.",
                    SIMULATION_TIMEOUT.as_secs()
                ),
                None,
            ),
            Self::Worker(message) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "simulation_worker_failed",
                message,
                None,
            ),
        };
        (
            status,
            Json(ErrorResponse {
                code,
                message,
                field,
            }),
        )
            .into_response()
    }
}

pub fn app(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([header::CONTENT_TYPE])
        .allow_origin(AllowOrigin::predicate(|origin: &HeaderValue, _| {
            let Ok(value) = origin.to_str() else {
                return false;
            };
            value.starts_with("http://127.0.0.1:") || value.starts_with("http://localhost:")
        }));
    Router::new()
        .route("/health", get(health))
        .route("/v1/capabilities", get(capabilities))
        .route("/v1/validate", post(validate))
        .route("/v1/simulate", post(simulate))
        .layer(DefaultBodyLimit::max(MAX_REQUEST_BYTES))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ready",
        engine: ENGINE_NAME,
        api_version: API_VERSION,
    })
}

async fn capabilities() -> Json<EngineCapabilities> {
    Json(engine_capabilities(MAX_API_CELLS))
}

async fn validate(Json(input): Json<ScenarioInput>) -> Result<Json<ValidationResponse>, ApiError> {
    enforce_api_grid_limit(&input)?;
    geolab_core::validate_scenario(&input).map_err(ApiError::Invalid)?;
    Ok(Json(ValidationResponse {
        valid: true,
        api_version: API_VERSION,
        cell_count: input.grid.width * input.grid.height,
    }))
}

async fn simulate(
    State(state): State<AppState>,
    Json(input): Json<ScenarioInput>,
) -> Result<Json<SimulationEnvelope>, ApiError> {
    enforce_api_grid_limit(&input)?;
    geolab_core::validate_scenario(&input).map_err(ApiError::Invalid)?;
    let permit = state
        .semaphore
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::Busy)?;
    let request_number = state.request_counter.fetch_add(1, Ordering::Relaxed) + 1;
    let task = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        geolab_core::simulate(&input)
    });
    let report = tokio::time::timeout(SIMULATION_TIMEOUT, task)
        .await
        .map_err(|_| ApiError::Timeout)?
        .map_err(|error| ApiError::Worker(error.to_string()))?
        .map_err(ApiError::Invalid)?;
    Ok(Json(SimulationEnvelope {
        request_id: format!("rust-{request_number:08}"),
        report,
    }))
}

fn enforce_api_grid_limit(input: &ScenarioInput) -> Result<(), ApiError> {
    let cell_count = input.grid.width.saturating_mul(input.grid.height);
    if cell_count > MAX_API_CELLS {
        return Err(ApiError::TooLarge(cell_count));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    #[tokio::test]
    async fn health_reports_rust_engine() {
        let response = app(AppState::new(1))
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(value["engine"], ENGINE_NAME);
        assert_eq!(value["status"], "ready");
    }

    #[tokio::test]
    async fn malformed_scenario_is_rejected() {
        let response = app(AppState::new(1))
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/v1/simulate")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from("{}"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    }

    #[tokio::test]
    async fn capabilities_publish_coupled_processes() {
        let response = app(AppState::new(1))
            .oneshot(
                Request::builder()
                    .uri("/v1/capabilities")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert!(
            value["routing"]
                .as_array()
                .unwrap()
                .contains(&serde_json::json!("priority-flood-freeman-mfd"))
        );
        assert!(
            value["processes"]
                .as_array()
                .unwrap()
                .contains(&serde_json::json!("transport-limited-sediment-budget"))
        );
        assert!(
            value["outputLayers"]
                .as_array()
                .unwrap()
                .contains(&serde_json::json!("habitat-connectivity"))
        );
    }

    #[tokio::test]
    async fn simulation_endpoint_runs_the_core() {
        let layer = vec![900.0; 9];
        let payload = serde_json::json!({
            "apiVersion": "1.0",
            "scenarioId": "api-test",
            "grid": {
                "width": 3,
                "height": 3,
                "pointSpacingM": 100.0,
                "cellSupportAreaM2": 10000.0,
                "elevationM": [120.0, 118.0, 116.0, 119.0, 90.0, 114.0, 117.0, 115.0, 112.0]
            },
            "climate": {
                "annualPrecipitationMm": layer,
                "meanTemperatureC": vec![16.0; 9],
                "relativeHumidityFraction": 0.65,
                "windSpeedMS": 3.0,
                "latitudeDegrees": 32.0,
                "dayOfYear": 183
            },
            "surface": {
                "curveNumber": vec![72.0; 9],
                "hydraulicConductivityMmH": vec![18.0; 9],
                "availableWaterCapacityMm": vec![150.0; 9],
                "imperviousFraction": vec![0.05; 9],
                "vegetationFraction": vec![0.7; 9]
            },
            "management": { "irrigationMm": [], "requestedDemandMm": [] },
            "includeLayers": false
        });
        let response = app(AppState::new(1))
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/v1/simulate")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(payload.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(value["report"]["engine"], ENGINE_NAME);
        assert_eq!(value["report"]["summary"]["failedGateCount"], 0);
        assert_eq!(value["report"]["terrain"]["routingMethod"], "d8");
        assert!(
            value["report"]["subsurfaceBudget"]["residualPercentOfInput"]
                .as_f64()
                .unwrap()
                .abs()
                < 1e-9
        );
        assert!(
            value["report"]["sedimentBudget"]["residualPercentOfDetachment"]
                .as_f64()
                .unwrap()
                .abs()
                < 1e-9
        );
    }

    #[tokio::test]
    async fn cors_does_not_authorize_remote_web_origins() {
        let response = app(AppState::new(1))
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .header(header::ORIGIN, "https://example.com")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert!(
            response
                .headers()
                .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
                .is_none()
        );
    }
}
