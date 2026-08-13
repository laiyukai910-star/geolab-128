use serde::{Deserialize, Serialize};
use std::cmp::{Ordering, Reverse};
use std::collections::BinaryHeap;
use std::error::Error;
use std::f64::consts::PI;
use std::fmt::{Display, Formatter};

mod ecology;
mod routing;
mod sediment;
mod subsurface;

use ecology::simulate_ecology;
use routing::{FlowNetwork, build_flow_network, route_accumulation};
use sediment::simulate_sediment;
use subsurface::simulate_subsurface;

pub const API_VERSION: &str = "1.0";
pub const ENGINE_NAME: &str = "geolab-core-rust";
pub const MAX_CORE_CELLS: usize = 1_048_576;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioInput {
    pub api_version: String,
    pub scenario_id: String,
    pub grid: GridInput,
    pub climate: ClimateInput,
    pub surface: SurfaceInput,
    #[serde(default)]
    pub management: ManagementInput,
    #[serde(default)]
    pub routing: RoutingInput,
    #[serde(default)]
    pub subsurface: SubsurfaceInput,
    #[serde(default)]
    pub geomorphology: GeomorphologyInput,
    #[serde(default)]
    pub ecology: EcologyInput,
    #[serde(default)]
    pub control: SimulationControl,
    #[serde(default)]
    pub include_layers: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GridInput {
    pub width: usize,
    pub height: usize,
    pub point_spacing_m: f64,
    pub cell_support_area_m2: f64,
    pub elevation_m: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClimateInput {
    pub annual_precipitation_mm: Vec<f64>,
    pub mean_temperature_c: Vec<f64>,
    pub relative_humidity_fraction: f64,
    pub wind_speed_m_s: f64,
    pub latitude_degrees: f64,
    pub day_of_year: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SurfaceInput {
    pub curve_number: Vec<f64>,
    pub hydraulic_conductivity_mm_h: Vec<f64>,
    pub available_water_capacity_mm: Vec<f64>,
    pub impervious_fraction: Vec<f64>,
    pub vegetation_fraction: Vec<f64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagementInput {
    #[serde(default)]
    pub irrigation_mm: Vec<f64>,
    #[serde(default)]
    pub requested_demand_mm: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutingInput {
    #[serde(default)]
    pub method: RoutingMethod,
    #[serde(default = "default_mfd_exponent")]
    pub mfd_exponent: f64,
}

impl Default for RoutingInput {
    fn default() -> Self {
        Self {
            method: RoutingMethod::default(),
            mfd_exponent: default_mfd_exponent(),
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RoutingMethod {
    #[default]
    D8,
    MultipleFlowDirection,
}

impl RoutingMethod {
    pub fn id(self) -> &'static str {
        match self {
            Self::D8 => "d8",
            Self::MultipleFlowDirection => "multiple-flow-direction",
        }
    }
}

fn default_mfd_exponent() -> f64 {
    1.1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubsurfaceInput {
    #[serde(default)]
    pub soil_depth_m: Vec<f64>,
    #[serde(default)]
    pub aquifer_thickness_m: Vec<f64>,
    #[serde(default)]
    pub specific_yield_fraction: Vec<f64>,
    #[serde(default)]
    pub initial_storage_fraction: Vec<f64>,
    #[serde(default = "default_baseflow_recession")]
    pub annual_baseflow_recession_fraction: f64,
}

impl Default for SubsurfaceInput {
    fn default() -> Self {
        Self {
            soil_depth_m: Vec::new(),
            aquifer_thickness_m: Vec::new(),
            specific_yield_fraction: Vec::new(),
            initial_storage_fraction: Vec::new(),
            annual_baseflow_recession_fraction: default_baseflow_recession(),
        }
    }
}

fn default_baseflow_recession() -> f64 {
    0.22
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeomorphologyInput {
    #[serde(default)]
    pub soil_erodibility_factor: Vec<f64>,
    #[serde(default)]
    pub support_practice_factor: Vec<f64>,
    #[serde(default)]
    pub rainfall_erosivity_mj_mm_ha_h_year: Option<f64>,
    #[serde(default = "default_transport_capacity")]
    pub transport_capacity_coefficient: f64,
}

impl Default for GeomorphologyInput {
    fn default() -> Self {
        Self {
            soil_erodibility_factor: Vec::new(),
            support_practice_factor: Vec::new(),
            rainfall_erosivity_mj_mm_ha_h_year: None,
            transport_capacity_coefficient: default_transport_capacity(),
        }
    }
}

fn default_transport_capacity() -> f64 {
    0.035
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EcologyInput {
    #[serde(default)]
    pub barrier_fraction: Vec<f64>,
    #[serde(default = "default_preferred_temperature")]
    pub preferred_temperature_c: f64,
    #[serde(default = "default_temperature_tolerance")]
    pub temperature_tolerance_c: f64,
    #[serde(default = "default_preferred_moisture")]
    pub preferred_moisture_index: f64,
    #[serde(default = "default_moisture_tolerance")]
    pub moisture_tolerance: f64,
    #[serde(default = "default_maximum_slope")]
    pub maximum_slope_degrees: f64,
    #[serde(default = "default_habitat_threshold")]
    pub habitat_threshold: f64,
}

impl Default for EcologyInput {
    fn default() -> Self {
        Self {
            barrier_fraction: Vec::new(),
            preferred_temperature_c: default_preferred_temperature(),
            temperature_tolerance_c: default_temperature_tolerance(),
            preferred_moisture_index: default_preferred_moisture(),
            moisture_tolerance: default_moisture_tolerance(),
            maximum_slope_degrees: default_maximum_slope(),
            habitat_threshold: default_habitat_threshold(),
        }
    }
}

fn default_preferred_temperature() -> f64 {
    15.0
}

fn default_temperature_tolerance() -> f64 {
    16.0
}

fn default_preferred_moisture() -> f64 {
    0.85
}

fn default_moisture_tolerance() -> f64 {
    0.7
}

fn default_maximum_slope() -> f64 {
    38.0
}

fn default_habitat_threshold() -> f64 {
    0.55
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationControl {
    #[serde(default = "default_duration_days")]
    pub duration_days: u32,
    #[serde(default = "default_timestep_days")]
    pub timestep_days: u16,
}

impl Default for SimulationControl {
    fn default() -> Self {
        Self {
            duration_days: default_duration_days(),
            timestep_days: default_timestep_days(),
        }
    }
}

fn default_duration_days() -> u32 {
    365
}

fn default_timestep_days() -> u16 {
    30
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationReport {
    pub api_version: String,
    pub engine: String,
    pub scenario_id: String,
    pub grid: GridSummary,
    pub terrain: TerrainSummary,
    pub water_budget: WaterBudget,
    pub subsurface_budget: SubsurfaceBudget,
    pub sediment_budget: SedimentBudget,
    pub ecology: EcologySummary,
    pub gates: Vec<ProcessGate>,
    pub summary: SimulationSummary,
    pub layers: Option<SimulationLayers>,
    pub methods: Vec<MethodReference>,
    pub limitations: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GridSummary {
    pub width: usize,
    pub height: usize,
    pub cell_count: usize,
    pub point_spacing_m: f64,
    pub cell_support_area_m2: f64,
    pub support_area_km2: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerrainSummary {
    pub minimum_elevation_m: f64,
    pub maximum_elevation_m: f64,
    pub mean_slope_degrees: f64,
    pub maximum_fill_depth_m: f64,
    pub outlet_count: usize,
    pub maximum_contributing_area_km2: f64,
    pub routing_method: String,
    pub divergent_cell_fraction: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WaterBudget {
    pub precipitation_m3: f64,
    pub irrigation_m3: f64,
    pub requested_demand_m3: f64,
    pub allocated_demand_m3: f64,
    pub unmet_demand_m3: f64,
    pub actual_evapotranspiration_m3: f64,
    pub generated_runoff_m3: f64,
    pub groundwater_recharge_m3: f64,
    pub soil_storage_change_m3: f64,
    pub unresolved_residual_m3: f64,
    pub residual_percent_of_input: f64,
    pub outlet_discharge_m3: f64,
    pub surface_runoff_outlet_m3: f64,
    pub baseflow_outlet_m3: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubsurfaceBudget {
    pub initial_storage_m3: f64,
    pub recharge_m3: f64,
    pub baseflow_m3: f64,
    pub capacity_overflow_m3: f64,
    pub final_storage_m3: f64,
    pub unresolved_residual_m3: f64,
    pub residual_percent_of_input: f64,
    pub mean_saturation_fraction: f64,
    pub mean_water_table_depth_m: f64,
    pub timestep_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SedimentBudget {
    pub gross_detachment_kg: f64,
    pub deposited_kg: f64,
    pub outlet_export_kg: f64,
    pub unresolved_residual_kg: f64,
    pub residual_percent_of_detachment: f64,
    pub sediment_delivery_ratio: f64,
    pub mean_soil_loss_t_ha_period: f64,
    pub maximum_transport_capacity_kg: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EcologySummary {
    pub suitable_habitat_area_km2: f64,
    pub effective_habitat_area_km2: f64,
    pub patch_count: usize,
    pub largest_patch_area_km2: f64,
    pub largest_patch_fraction: f64,
    pub mean_habitat_suitability: f64,
    pub mean_resistance_connectivity: f64,
    pub barrier_edge_fraction: f64,
    pub corridor_bottleneck_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessGate {
    pub id: String,
    pub label: String,
    pub status: GateStatus,
    pub score: f64,
    pub evidence: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GateStatus {
    Pass,
    Review,
    Fail,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationSummary {
    pub process_integrity_index: f64,
    pub passed_gate_count: usize,
    pub review_gate_count: usize,
    pub failed_gate_count: usize,
    pub mean_reference_evapotranspiration_mm: f64,
    pub mean_actual_evapotranspiration_mm: f64,
    pub mean_runoff_depth_mm: f64,
    pub mean_recharge_depth_mm: f64,
    pub maximum_absolute_cell_residual_mm: f64,
    pub subsurface_residual_percent: f64,
    pub sediment_residual_percent: f64,
    pub habitat_connectivity_index: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationLayers {
    pub filled_elevation_m: Vec<f64>,
    pub fill_depth_m: Vec<f64>,
    pub slope_degrees: Vec<f64>,
    pub flow_receiver: Vec<i64>,
    pub flow_target_offsets: Vec<usize>,
    pub flow_target_indices: Vec<usize>,
    pub flow_target_fractions: Vec<f64>,
    pub contributing_area_m2: Vec<f64>,
    pub discharge_m3_period: Vec<f64>,
    pub discharge_m3_year: Vec<f64>,
    pub reference_evapotranspiration_mm: Vec<f64>,
    pub actual_evapotranspiration_mm: Vec<f64>,
    pub runoff_depth_mm: Vec<f64>,
    pub groundwater_recharge_mm: Vec<f64>,
    pub soil_storage_change_mm: Vec<f64>,
    pub groundwater_storage_mm: Vec<f64>,
    pub groundwater_saturation_fraction: Vec<f64>,
    pub groundwater_baseflow_mm: Vec<f64>,
    pub groundwater_residual_mm: Vec<f64>,
    pub water_table_depth_m: Vec<f64>,
    pub gross_detachment_kg: Vec<f64>,
    pub sediment_deposition_kg: Vec<f64>,
    pub sediment_outflow_kg: Vec<f64>,
    pub sediment_transport_capacity_kg: Vec<f64>,
    pub habitat_suitability: Vec<f64>,
    pub habitat_connectivity: Vec<f64>,
    pub habitat_patch_id: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MethodReference {
    pub id: String,
    pub method: String,
    pub role: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelError {
    pub field: String,
    pub message: String,
}

impl ModelError {
    fn new(field: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            field: field.into(),
            message: message.into(),
        }
    }
}

impl Display for ModelError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}: {}", self.field, self.message)
    }
}

impl Error for ModelError {}

pub fn validate_scenario(input: &ScenarioInput) -> Result<(), ModelError> {
    if input.api_version != API_VERSION {
        return Err(ModelError::new(
            "apiVersion",
            format!("expected {API_VERSION}, received {}", input.api_version),
        ));
    }
    if input.scenario_id.trim().is_empty() || input.scenario_id.len() > 120 {
        return Err(ModelError::new(
            "scenarioId",
            "must contain between 1 and 120 characters",
        ));
    }
    if input.grid.width < 3 || input.grid.height < 3 {
        return Err(ModelError::new(
            "grid",
            "width and height must be at least 3",
        ));
    }
    let cell_count = input
        .grid
        .width
        .checked_mul(input.grid.height)
        .ok_or_else(|| ModelError::new("grid", "cell count overflow"))?;
    if cell_count > MAX_CORE_CELLS {
        return Err(ModelError::new(
            "grid",
            format!("cell count exceeds core limit of {MAX_CORE_CELLS}"),
        ));
    }
    validate_scalar(
        "grid.pointSpacingM",
        input.grid.point_spacing_m,
        0.1,
        100_000.0,
    )?;
    validate_scalar(
        "grid.cellSupportAreaM2",
        input.grid.cell_support_area_m2,
        0.01,
        10_000_000_000.0,
    )?;
    validate_layer(
        "grid.elevationM",
        &input.grid.elevation_m,
        cell_count,
        -12_000.0,
        10_000.0,
    )?;
    validate_layer(
        "climate.annualPrecipitationMm",
        &input.climate.annual_precipitation_mm,
        cell_count,
        0.0,
        15_000.0,
    )?;
    validate_layer(
        "climate.meanTemperatureC",
        &input.climate.mean_temperature_c,
        cell_count,
        -80.0,
        65.0,
    )?;
    validate_scalar(
        "climate.relativeHumidityFraction",
        input.climate.relative_humidity_fraction,
        0.01,
        1.0,
    )?;
    validate_scalar(
        "climate.windSpeedMS",
        input.climate.wind_speed_m_s,
        0.0,
        100.0,
    )?;
    validate_scalar(
        "climate.latitudeDegrees",
        input.climate.latitude_degrees,
        -90.0,
        90.0,
    )?;
    if !(1..=366).contains(&input.climate.day_of_year) {
        return Err(ModelError::new(
            "climate.dayOfYear",
            "must be within 1..=366",
        ));
    }
    validate_layer(
        "surface.curveNumber",
        &input.surface.curve_number,
        cell_count,
        30.0,
        100.0,
    )?;
    validate_layer(
        "surface.hydraulicConductivityMmH",
        &input.surface.hydraulic_conductivity_mm_h,
        cell_count,
        0.0,
        2_000.0,
    )?;
    validate_layer(
        "surface.availableWaterCapacityMm",
        &input.surface.available_water_capacity_mm,
        cell_count,
        0.0,
        1_000.0,
    )?;
    validate_layer(
        "surface.imperviousFraction",
        &input.surface.impervious_fraction,
        cell_count,
        0.0,
        1.0,
    )?;
    validate_layer(
        "surface.vegetationFraction",
        &input.surface.vegetation_fraction,
        cell_count,
        0.0,
        1.0,
    )?;
    validate_optional_layer(
        "management.irrigationMm",
        &input.management.irrigation_mm,
        cell_count,
        0.0,
        5_000.0,
    )?;
    validate_optional_layer(
        "management.requestedDemandMm",
        &input.management.requested_demand_mm,
        cell_count,
        0.0,
        10_000.0,
    )?;
    validate_scalar("routing.mfdExponent", input.routing.mfd_exponent, 0.1, 10.0)?;
    validate_optional_layer(
        "subsurface.soilDepthM",
        &input.subsurface.soil_depth_m,
        cell_count,
        0.05,
        100.0,
    )?;
    validate_optional_layer(
        "subsurface.aquiferThicknessM",
        &input.subsurface.aquifer_thickness_m,
        cell_count,
        0.1,
        5_000.0,
    )?;
    validate_optional_layer(
        "subsurface.specificYieldFraction",
        &input.subsurface.specific_yield_fraction,
        cell_count,
        0.001,
        0.6,
    )?;
    validate_optional_layer(
        "subsurface.initialStorageFraction",
        &input.subsurface.initial_storage_fraction,
        cell_count,
        0.0,
        1.0,
    )?;
    validate_scalar(
        "subsurface.annualBaseflowRecessionFraction",
        input.subsurface.annual_baseflow_recession_fraction,
        0.0001,
        0.9999,
    )?;
    validate_optional_layer(
        "geomorphology.soilErodibilityFactor",
        &input.geomorphology.soil_erodibility_factor,
        cell_count,
        0.0,
        1.0,
    )?;
    validate_optional_layer(
        "geomorphology.supportPracticeFactor",
        &input.geomorphology.support_practice_factor,
        cell_count,
        0.0,
        2.0,
    )?;
    if let Some(erosivity) = input.geomorphology.rainfall_erosivity_mj_mm_ha_h_year {
        validate_scalar(
            "geomorphology.rainfallErosivityMjMmHaHYear",
            erosivity,
            0.0,
            50_000.0,
        )?;
    }
    validate_scalar(
        "geomorphology.transportCapacityCoefficient",
        input.geomorphology.transport_capacity_coefficient,
        0.0001,
        1.0,
    )?;
    validate_optional_layer(
        "ecology.barrierFraction",
        &input.ecology.barrier_fraction,
        cell_count,
        0.0,
        1.0,
    )?;
    validate_scalar(
        "ecology.preferredTemperatureC",
        input.ecology.preferred_temperature_c,
        -80.0,
        65.0,
    )?;
    validate_scalar(
        "ecology.temperatureToleranceC",
        input.ecology.temperature_tolerance_c,
        0.1,
        100.0,
    )?;
    validate_scalar(
        "ecology.preferredMoistureIndex",
        input.ecology.preferred_moisture_index,
        0.0,
        10.0,
    )?;
    validate_scalar(
        "ecology.moistureTolerance",
        input.ecology.moisture_tolerance,
        0.01,
        10.0,
    )?;
    validate_scalar(
        "ecology.maximumSlopeDegrees",
        input.ecology.maximum_slope_degrees,
        0.1,
        90.0,
    )?;
    validate_scalar(
        "ecology.habitatThreshold",
        input.ecology.habitat_threshold,
        0.0,
        1.0,
    )?;
    if input.control.duration_days == 0 || input.control.duration_days > 36_500 {
        return Err(ModelError::new(
            "control.durationDays",
            "must be within 1..=36500",
        ));
    }
    if input.control.timestep_days == 0 || input.control.timestep_days > 365 {
        return Err(ModelError::new(
            "control.timestepDays",
            "must be within 1..=365; the final step is clipped to the remaining duration",
        ));
    }
    Ok(())
}

pub fn simulate(input: &ScenarioInput) -> Result<SimulationReport, ModelError> {
    validate_scenario(input)?;
    let cell_count = input.grid.width * input.grid.height;
    let cell_area_m2 = input.grid.cell_support_area_m2;
    let period_fraction = input.control.duration_days as f64 / 365.0;
    let (filled, flood_parent) =
        priority_flood(&input.grid.elevation_m, input.grid.width, input.grid.height);
    let fill_depth: Vec<f64> = filled
        .iter()
        .zip(&input.grid.elevation_m)
        .map(|(resolved, original)| (resolved - original).max(0.0))
        .collect();
    let slopes = horn_slopes(
        &input.grid.elevation_m,
        input.grid.width,
        input.grid.height,
        input.grid.point_spacing_m,
    );
    let network = build_flow_network(
        &filled,
        &flood_parent,
        input.grid.width,
        input.grid.height,
        input.grid.point_spacing_m,
        input.routing.method,
        input.routing.mfd_exponent,
    )?;

    let mut reference_et = vec![0.0; cell_count];
    let mut actual_et = vec![0.0; cell_count];
    let mut runoff = vec![0.0; cell_count];
    let mut recharge = vec![0.0; cell_count];
    let mut storage = vec![0.0; cell_count];
    let mut residual = vec![0.0; cell_count];
    let mut allocated_demand = vec![0.0; cell_count];
    let mut unmet_demand = vec![0.0; cell_count];
    let mut local_runoff_m3 = vec![0.0; cell_count];

    for index in 0..cell_count {
        let annual_precipitation = input.climate.annual_precipitation_mm[index];
        let precipitation = annual_precipitation * period_fraction;
        let irrigation = optional_value(&input.management.irrigation_mm, index) * period_fraction;
        let requested_demand =
            optional_value(&input.management.requested_demand_mm, index) * period_fraction;
        let total_input = precipitation + irrigation;
        let demand = requested_demand.min(total_input);
        let remaining_after_demand = (total_input - demand).max(0.0);
        let et0 = reference_evapotranspiration(
            input.climate.mean_temperature_c[index],
            input.climate.latitude_degrees,
            input.grid.elevation_m[index].max(0.0),
            input.climate.relative_humidity_fraction,
            input.climate.wind_speed_m_s,
            input.climate.day_of_year,
            annual_precipitation,
        ) * period_fraction;
        let vegetation = input.surface.vegetation_fraction[index];
        let impervious = input.surface.impervious_fraction[index];
        let conductivity = input.surface.hydraulic_conductivity_mm_h[index];
        let available_water = input.surface.available_water_capacity_mm[index];
        let conductivity_factor = (conductivity.ln_1p() / 2_000.0_f64.ln_1p()).clamp(0.0, 1.0);
        let crop_coefficient = (0.18 + vegetation * 0.86).clamp(0.12, 1.08);
        let soil_stress = (0.18 + available_water / 1_000.0 * 0.46 + conductivity_factor * 0.3
            - impervious * 0.34)
            .clamp(0.05, 1.0);
        let aet = remaining_after_demand
            .min(et0 * crop_coefficient * soil_stress * (1.0 - impervious * 0.45));
        let partitionable = (remaining_after_demand - aet).max(0.0);
        let representative_storm =
            (12.0 + precipitation / 52.0 + input.climate.relative_humidity_fraction * 14.0)
                .clamp(12.0, 180.0);
        let event_ratio =
            nrcs_event_runoff_ratio(input.surface.curve_number[index], representative_storm);
        let runoff_coefficient =
            (0.02 + event_ratio * 0.58 + slopes[index] / 70.0 * 0.2 + impervious * 0.48
                - vegetation * 0.16
                - conductivity_factor * 0.12)
                .clamp(0.01, 0.95);
        let runoff_depth = partitionable * runoff_coefficient;
        let post_runoff = (partitionable - runoff_depth).max(0.0);
        let recharge_fraction = (0.05
            + conductivity_factor * 0.45
            + available_water / 1_000.0 * 0.15
            + vegetation * 0.08
            - impervious * 0.45
            - slopes[index] / 150.0)
            .clamp(0.02, 0.85);
        let recharge_depth = post_runoff * recharge_fraction;
        let storage_depth = (post_runoff - recharge_depth).max(0.0);
        let cell_residual =
            total_input - demand - aet - runoff_depth - recharge_depth - storage_depth;

        reference_et[index] = et0;
        actual_et[index] = aet;
        runoff[index] = runoff_depth;
        recharge[index] = recharge_depth;
        storage[index] = storage_depth;
        residual[index] = cell_residual;
        allocated_demand[index] = demand;
        unmet_demand[index] = (requested_demand - demand).max(0.0);
        local_runoff_m3[index] = runoff_depth / 1_000.0 * cell_area_m2;
    }

    let subsurface = simulate_subsurface(input, &recharge, cell_area_m2);
    let local_baseflow_m3: Vec<f64> = subsurface
        .baseflow_mm
        .iter()
        .map(|depth| depth / 1_000.0 * cell_area_m2)
        .collect();
    let (contributing_area, surface_discharge) =
        route_accumulation(&network, cell_area_m2, &local_runoff_m3);
    let (_, baseflow_discharge) = route_accumulation(&network, cell_area_m2, &local_baseflow_m3);
    let discharge: Vec<f64> = surface_discharge
        .iter()
        .zip(&baseflow_discharge)
        .map(|(surface, baseflow)| surface + baseflow)
        .collect();
    let water_budget = summarize_water(
        input,
        period_fraction,
        cell_area_m2,
        &allocated_demand,
        &unmet_demand,
        &actual_et,
        &runoff,
        &recharge,
        &storage,
        &residual,
        &network,
        &surface_discharge,
        &baseflow_discharge,
    );
    let sediment = simulate_sediment(
        input,
        &network,
        &slopes,
        &contributing_area,
        &surface_discharge,
    );
    let ecology = simulate_ecology(input, &slopes, &reference_et);
    let gates = build_gates(GateContext {
        input,
        filled: &filled,
        network: &network,
        contributing_area: &contributing_area,
        reference_et: &reference_et,
        actual_et: &actual_et,
        residual: &residual,
        subsurface: &subsurface,
        sediment: &sediment,
        ecology: &ecology,
    });
    let process_integrity_index = geometric_mean(gates.iter().map(|gate| gate.score));
    let summary = SimulationSummary {
        process_integrity_index,
        passed_gate_count: gates
            .iter()
            .filter(|gate| gate.status == GateStatus::Pass)
            .count(),
        review_gate_count: gates
            .iter()
            .filter(|gate| gate.status == GateStatus::Review)
            .count(),
        failed_gate_count: gates
            .iter()
            .filter(|gate| gate.status == GateStatus::Fail)
            .count(),
        mean_reference_evapotranspiration_mm: mean(&reference_et),
        mean_actual_evapotranspiration_mm: mean(&actual_et),
        mean_runoff_depth_mm: mean(&runoff),
        mean_recharge_depth_mm: mean(&recharge),
        maximum_absolute_cell_residual_mm: residual
            .iter()
            .map(|value| value.abs())
            .fold(0.0, f64::max),
        subsurface_residual_percent: subsurface.budget.residual_percent_of_input,
        sediment_residual_percent: sediment.budget.residual_percent_of_detachment,
        habitat_connectivity_index: ecology.summary.mean_resistance_connectivity,
    };
    let terrain = TerrainSummary {
        minimum_elevation_m: input
            .grid
            .elevation_m
            .iter()
            .copied()
            .fold(f64::INFINITY, f64::min),
        maximum_elevation_m: input
            .grid
            .elevation_m
            .iter()
            .copied()
            .fold(f64::NEG_INFINITY, f64::max),
        mean_slope_degrees: mean(&slopes),
        maximum_fill_depth_m: fill_depth.iter().copied().fold(0.0, f64::max),
        outlet_count: network.outlet_count(),
        maximum_contributing_area_km2: contributing_area.iter().copied().fold(0.0, f64::max)
            / 1_000_000.0,
        routing_method: input.routing.method.id().to_string(),
        divergent_cell_fraction: network.divergent_cell_fraction(),
    };
    let (flow_target_offsets, flow_target_indices, flow_target_fractions) =
        network.flattened_targets();
    let layers = input.include_layers.then(|| SimulationLayers {
        filled_elevation_m: filled,
        fill_depth_m: fill_depth,
        slope_degrees: slopes,
        flow_receiver: network
            .dominant_receivers
            .iter()
            .map(|receiver| *receiver as i64)
            .collect(),
        flow_target_offsets,
        flow_target_indices,
        flow_target_fractions,
        contributing_area_m2: contributing_area,
        discharge_m3_period: discharge.clone(),
        discharge_m3_year: discharge
            .iter()
            .map(|value| value / period_fraction.max(f64::EPSILON))
            .collect(),
        reference_evapotranspiration_mm: reference_et,
        actual_evapotranspiration_mm: actual_et,
        runoff_depth_mm: runoff,
        groundwater_recharge_mm: recharge,
        soil_storage_change_mm: storage,
        groundwater_storage_mm: subsurface.storage_mm,
        groundwater_saturation_fraction: subsurface.saturation_fraction,
        groundwater_baseflow_mm: subsurface.baseflow_mm,
        groundwater_residual_mm: subsurface.residual_mm,
        water_table_depth_m: subsurface.water_table_depth_m,
        gross_detachment_kg: sediment.gross_detachment_kg,
        sediment_deposition_kg: sediment.deposition_kg,
        sediment_outflow_kg: sediment.outflow_kg,
        sediment_transport_capacity_kg: sediment.transport_capacity_kg,
        habitat_suitability: ecology.habitat_suitability,
        habitat_connectivity: ecology.connectivity,
        habitat_patch_id: ecology.patch_id,
    });

    Ok(SimulationReport {
        api_version: API_VERSION.to_string(),
        engine: ENGINE_NAME.to_string(),
        scenario_id: input.scenario_id.clone(),
        grid: GridSummary {
            width: input.grid.width,
            height: input.grid.height,
            cell_count,
            point_spacing_m: input.grid.point_spacing_m,
            cell_support_area_m2: input.grid.cell_support_area_m2,
            support_area_km2: cell_area_m2 * cell_count as f64 / 1_000_000.0,
        },
        terrain,
        water_budget,
        subsurface_budget: subsurface.budget,
        sediment_budget: sediment.budget,
        ecology: ecology.summary,
        gates,
        summary,
        layers,
        methods: method_references(),
        limitations: vec![
            "The Rust core is an independent screening kernel, not a calibrated forecast.".to_string(),
            "Reference ET uses derived radiation and temperature range when station observations are absent.".to_string(),
            "Depression-resolved D8 or Freeman-style MFD routing is terrain routing, not a two-dimensional hydraulic solver.".to_string(),
            "Groundwater is a spatially distributed linear-reservoir screening model; it does not solve three-dimensional saturated flow.".to_string(),
            "Sediment results use RUSLE-structured detachment and transport-capacity accounting, not a calibrated RUSLE2 implementation.".to_string(),
            "Habitat connectivity is a resistance-weighted raster graph diagnostic, not a population-genetic or full circuit-theory solve.".to_string(),
        ],
    })
}

fn validate_scalar(field: &str, value: f64, minimum: f64, maximum: f64) -> Result<(), ModelError> {
    if !value.is_finite() || value < minimum || value > maximum {
        return Err(ModelError::new(
            field,
            format!("must be finite and within {minimum}..={maximum}"),
        ));
    }
    Ok(())
}

fn validate_layer(
    field: &str,
    values: &[f64],
    expected_length: usize,
    minimum: f64,
    maximum: f64,
) -> Result<(), ModelError> {
    if values.len() != expected_length {
        return Err(ModelError::new(
            field,
            format!(
                "expected {expected_length} values, received {}",
                values.len()
            ),
        ));
    }
    for (index, value) in values.iter().enumerate() {
        if !value.is_finite() || *value < minimum || *value > maximum {
            return Err(ModelError::new(
                format!("{field}[{index}]"),
                format!("must be finite and within {minimum}..={maximum}"),
            ));
        }
    }
    Ok(())
}

fn validate_optional_layer(
    field: &str,
    values: &[f64],
    expected_length: usize,
    minimum: f64,
    maximum: f64,
) -> Result<(), ModelError> {
    if values.is_empty() {
        return Ok(());
    }
    validate_layer(field, values, expected_length, minimum, maximum)
}

fn optional_value(values: &[f64], index: usize) -> f64 {
    values.get(index).copied().unwrap_or(0.0)
}

#[derive(Debug, Clone, Copy)]
struct HeapCell {
    elevation: f64,
    index: usize,
}

impl PartialEq for HeapCell {
    fn eq(&self, other: &Self) -> bool {
        self.index == other.index && self.elevation.to_bits() == other.elevation.to_bits()
    }
}

impl Eq for HeapCell {}

impl PartialOrd for HeapCell {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for HeapCell {
    fn cmp(&self, other: &Self) -> Ordering {
        self.elevation
            .total_cmp(&other.elevation)
            .then_with(|| self.index.cmp(&other.index))
    }
}

fn priority_flood(elevation: &[f64], width: usize, height: usize) -> (Vec<f64>, Vec<isize>) {
    let mut filled = elevation.to_vec();
    let mut parent = vec![-1; elevation.len()];
    let mut visited = vec![false; elevation.len()];
    let mut heap = BinaryHeap::new();
    for y in 0..height {
        for x in 0..width {
            if x != 0 && y != 0 && x + 1 != width && y + 1 != height {
                continue;
            }
            let index = y * width + x;
            if visited[index] {
                continue;
            }
            visited[index] = true;
            heap.push(Reverse(HeapCell {
                elevation: filled[index],
                index,
            }));
        }
    }
    while let Some(Reverse(cell)) = heap.pop() {
        for neighbor in neighbors(cell.index, width, height) {
            if visited[neighbor] {
                continue;
            }
            visited[neighbor] = true;
            parent[neighbor] = cell.index as isize;
            filled[neighbor] = filled[neighbor].max(cell.elevation);
            heap.push(Reverse(HeapCell {
                elevation: filled[neighbor],
                index: neighbor,
            }));
        }
    }
    (filled, parent)
}

fn horn_slopes(elevation: &[f64], width: usize, height: usize, cell_size_m: f64) -> Vec<f64> {
    let mut slopes = vec![0.0; elevation.len()];
    for y in 0..height {
        for x in 0..width {
            let sample = |dx: isize, dy: isize| {
                let sx = (x as isize + dx).clamp(0, width as isize - 1) as usize;
                let sy = (y as isize + dy).clamp(0, height as isize - 1) as usize;
                elevation[sy * width + sx]
            };
            let dz_dx = (sample(1, -1) + 2.0 * sample(1, 0) + sample(1, 1)
                - sample(-1, -1)
                - 2.0 * sample(-1, 0)
                - sample(-1, 1))
                / (8.0 * cell_size_m);
            let dz_dy = (sample(-1, 1) + 2.0 * sample(0, 1) + sample(1, 1)
                - sample(-1, -1)
                - 2.0 * sample(0, -1)
                - sample(1, -1))
                / (8.0 * cell_size_m);
            slopes[y * width + x] = dz_dx.hypot(dz_dy).atan().to_degrees();
        }
    }
    slopes
}

fn reference_evapotranspiration(
    temperature_c: f64,
    latitude_degrees: f64,
    elevation_m: f64,
    relative_humidity: f64,
    wind_speed_m_s: f64,
    day_of_year: u16,
    annual_precipitation_mm: f64,
) -> f64 {
    let temperature_c = temperature_c.clamp(-35.0, 48.0);
    let latitude = latitude_degrees.clamp(-66.5, 66.5).to_radians();
    let elevation_m = elevation_m.clamp(0.0, 10_000.0);
    let relative_humidity = relative_humidity.clamp(0.05, 1.0);
    let wind_speed_m_s = wind_speed_m_s.clamp(0.1, 35.0);
    let day = day_of_year as f64;
    let inverse_distance = 1.0 + 0.033 * (2.0 * PI * day / 365.0).cos();
    let declination = 0.409 * (2.0 * PI * day / 365.0 - 1.39).sin();
    let sunset_angle = (-latitude.tan() * declination.tan())
        .clamp(-1.0, 1.0)
        .acos();
    let extraterrestrial = (24.0 * 60.0 / PI)
        * 0.082
        * inverse_distance
        * (sunset_angle * latitude.sin() * declination.sin()
            + latitude.cos() * declination.cos() * sunset_angle.sin());
    let cloud_humidity = (relative_humidity * 0.72
        + (annual_precipitation_mm / 2_400.0).min(1.0) * 0.28)
        .clamp(0.08, 0.98);
    let sunshine_fraction = (1.0 - cloud_humidity * 0.68).clamp(0.18, 0.82);
    let solar_radiation = (0.25 + 0.5 * sunshine_fraction) * extraterrestrial;
    let clear_sky = ((0.75 + 0.00002 * elevation_m) * extraterrestrial).max(0.001);
    let temperature_range =
        (13.0 - relative_humidity * 6.0 + elevation_m / 2_400.0).clamp(4.0, 19.0);
    let minimum_temperature = temperature_c - temperature_range * 0.5;
    let maximum_temperature = temperature_c + temperature_range * 0.5;
    let saturation_minimum = saturation_vapor_pressure(minimum_temperature);
    let saturation_maximum = saturation_vapor_pressure(maximum_temperature);
    let saturation = (saturation_minimum + saturation_maximum) * 0.5;
    let actual_vapor_pressure = saturation * relative_humidity;
    let vapor_pressure_deficit = (saturation - actual_vapor_pressure).max(0.0);
    let net_shortwave = 0.77 * solar_radiation;
    let cloudiness = (1.35 * (solar_radiation / clear_sky).min(1.0) - 0.35).clamp(0.05, 1.0);
    let net_longwave = 4.903e-9
        * (((maximum_temperature + 273.16).powi(4) + (minimum_temperature + 273.16).powi(4)) * 0.5)
        * (0.34 - 0.14 * actual_vapor_pressure.max(0.0).sqrt())
        * cloudiness;
    let net_radiation = (net_shortwave - net_longwave).max(0.0);
    let slope_vapor_curve =
        4_098.0 * saturation_vapor_pressure(temperature_c) / (temperature_c + 237.3).powi(2);
    let pressure = 101.3 * ((293.0 - 0.0065 * elevation_m) / 293.0).powf(5.26);
    let psychrometric = 0.000665 * pressure;
    let daily = (0.408 * slope_vapor_curve * net_radiation
        + psychrometric
            * (900.0 / (temperature_c + 273.0))
            * wind_speed_m_s
            * vapor_pressure_deficit)
        / (slope_vapor_curve + psychrometric * (1.0 + 0.34 * wind_speed_m_s)).max(0.001);
    (daily.max(0.0) * 365.0).clamp(0.0, 3_200.0)
}

fn saturation_vapor_pressure(temperature_c: f64) -> f64 {
    0.6108 * (17.27 * temperature_c / (temperature_c + 237.3)).exp()
}

fn nrcs_event_runoff_ratio(curve_number: f64, precipitation_mm: f64) -> f64 {
    let curve_number = curve_number.clamp(30.0, 98.0);
    let retention = (25_400.0 / curve_number - 254.0).max(0.0);
    let initial_abstraction = retention * 0.2;
    if precipitation_mm <= initial_abstraction || precipitation_mm <= 0.0 {
        return 0.0;
    }
    let runoff = (precipitation_mm - initial_abstraction).powi(2)
        / (precipitation_mm + retention * 0.8).max(0.001);
    (runoff / precipitation_mm).clamp(0.0, 1.0)
}

#[allow(clippy::too_many_arguments)]
fn summarize_water(
    input: &ScenarioInput,
    period_fraction: f64,
    cell_area_m2: f64,
    allocated_demand: &[f64],
    unmet_demand: &[f64],
    actual_et: &[f64],
    runoff: &[f64],
    recharge: &[f64],
    storage: &[f64],
    residual: &[f64],
    network: &FlowNetwork,
    surface_discharge: &[f64],
    baseflow_discharge: &[f64],
) -> WaterBudget {
    let depth_to_volume = |values: &[f64]| values.iter().sum::<f64>() / 1_000.0 * cell_area_m2;
    let precipitation_m3 =
        depth_to_volume(&input.climate.annual_precipitation_mm) * period_fraction;
    let irrigation_m3 = depth_to_volume(&input.management.irrigation_mm) * period_fraction;
    let requested_demand_m3 =
        depth_to_volume(&input.management.requested_demand_mm) * period_fraction;
    let unresolved_residual_m3 = depth_to_volume(residual);
    let total_input = precipitation_m3 + irrigation_m3;
    let surface_runoff_outlet_m3 = network.outlet_sum(surface_discharge);
    let baseflow_outlet_m3 = network.outlet_sum(baseflow_discharge);
    WaterBudget {
        precipitation_m3,
        irrigation_m3,
        requested_demand_m3,
        allocated_demand_m3: depth_to_volume(allocated_demand),
        unmet_demand_m3: depth_to_volume(unmet_demand),
        actual_evapotranspiration_m3: depth_to_volume(actual_et),
        generated_runoff_m3: depth_to_volume(runoff),
        groundwater_recharge_m3: depth_to_volume(recharge),
        soil_storage_change_m3: depth_to_volume(storage),
        unresolved_residual_m3,
        residual_percent_of_input: if total_input > 0.0 {
            unresolved_residual_m3 / total_input * 100.0
        } else {
            0.0
        },
        outlet_discharge_m3: surface_runoff_outlet_m3 + baseflow_outlet_m3,
        surface_runoff_outlet_m3,
        baseflow_outlet_m3,
    }
}

struct GateContext<'a> {
    input: &'a ScenarioInput,
    filled: &'a [f64],
    network: &'a FlowNetwork,
    contributing_area: &'a [f64],
    reference_et: &'a [f64],
    actual_et: &'a [f64],
    residual: &'a [f64],
    subsurface: &'a subsurface::SubsurfaceResult,
    sediment: &'a sediment::SedimentResult,
    ecology: &'a ecology::EcologyResult,
}

fn build_gates(context: GateContext<'_>) -> Vec<ProcessGate> {
    let GateContext {
        input,
        filled,
        network,
        contributing_area,
        reference_et,
        actual_et,
        residual,
        subsurface,
        sediment,
        ecology,
    } = context;
    let cell_count = filled.len();
    let maximum_residual = residual.iter().map(|value| value.abs()).fold(0.0, f64::max);
    let maximum_input = input
        .climate
        .annual_precipitation_mm
        .iter()
        .enumerate()
        .map(|(index, precipitation)| {
            precipitation + optional_value(&input.management.irrigation_mm, index)
        })
        .fold(1.0, f64::max);
    let closure_score = (1.0 - maximum_residual / maximum_input * 100.0).clamp(0.0, 1.0);
    let depression_score = input
        .grid
        .elevation_m
        .iter()
        .zip(filled)
        .filter(|(original, resolved)| **resolved + 1e-9 >= **original)
        .count() as f64
        / cell_count as f64;
    let et_score = actual_et
        .iter()
        .zip(reference_et)
        .filter(|(actual, reference)| **actual <= **reference * 1.08 + 0.01 && actual.is_finite())
        .count() as f64
        / cell_count as f64;
    let mut routed_cells = 0usize;
    let mut fraction_passes = 0usize;
    let mut routing_edges = 0usize;
    let mut routing_passes = 0usize;
    for (index, targets) in network.targets.iter().enumerate() {
        if targets.is_empty() {
            continue;
        }
        routed_cells += 1;
        let fraction_sum: f64 = targets.iter().map(|target| target.fraction).sum();
        if (fraction_sum - 1.0).abs() <= 1e-10
            && targets
                .iter()
                .all(|target| target.fraction.is_finite() && target.fraction > 0.0)
        {
            fraction_passes += 1;
        }
        for target in targets {
            routing_edges += 1;
            if filled[target.index] <= filled[index] + 1e-9 {
                routing_passes += 1;
            }
        }
    }
    let routing_score = if routing_edges > 0 {
        routing_passes as f64 / routing_edges as f64
    } else {
        1.0
    };
    let fraction_score = if routed_cells > 0 {
        fraction_passes as f64 / routed_cells as f64
    } else {
        1.0
    };
    let expected_area = input.grid.cell_support_area_m2 * cell_count as f64;
    let outlet_area: f64 = network.outlet_sum(contributing_area);
    let accumulation_score =
        (1.0 - (outlet_area - expected_area).abs() / expected_area.max(1.0) * 1e9).clamp(0.0, 1.0);
    let finite_score = [
        filled,
        reference_et,
        actual_et,
        residual,
        &subsurface.storage_mm,
        &sediment.outflow_kg,
        &ecology.habitat_suitability,
    ]
    .iter()
    .flat_map(|values| values.iter())
    .filter(|value| value.is_finite())
    .count() as f64
        / (cell_count * 7) as f64;
    let subsurface_score =
        (1.0 - subsurface.budget.residual_percent_of_input.abs() / 0.000_001).clamp(0.0, 1.0);
    let sediment_score =
        (1.0 - sediment.budget.residual_percent_of_detachment.abs() / 0.000_001).clamp(0.0, 1.0);
    vec![
        gate(
            "water-mass-closure",
            "Cell water partitions close independently",
            closure_score,
            "P + irrigation = allocated demand + actual ET + runoff + recharge + storage + residual",
        ),
        gate(
            "depression-resolution",
            "Priority-Flood never lowers terrain",
            depression_score,
            "Resolved elevations must be greater than or equal to source elevations",
        ),
        gate(
            "evapotranspiration-bounds",
            "Actual ET remains within atmospheric demand",
            et_score,
            "Actual ET must not materially exceed FAO-56 structured reference ET",
        ),
        gate(
            "downslope-routing",
            "Flow targets do not route uphill",
            routing_score,
            "Every retained D8 or MFD target follows an equal or lower depression-resolved elevation",
        ),
        gate(
            "flow-fraction-closure",
            "Per-cell routing fractions close",
            fraction_score,
            "Every routed cell distributes exactly one unit of flow among positive target fractions",
        ),
        gate(
            "accumulation-area-closure",
            "Outlet contributing area closes to map support area",
            accumulation_score,
            "The sum of fractional contributing area at all outlets equals the represented map area",
        ),
        gate(
            "subsurface-mass-closure",
            "Groundwater storage and baseflow close",
            subsurface_score,
            "Initial storage + recharge = baseflow + capacity overflow + final storage + residual",
        ),
        gate(
            "sediment-mass-closure",
            "Detachment, deposition, and export close",
            sediment_score,
            "Gross detachment = deposition + outlet export + unresolved residual",
        ),
        gate(
            "sediment-transport-capacity",
            "Sediment outflow respects transport capacity",
            sediment.capacity_score,
            "Every cell exports no more sediment than its runoff, slope, cover, and capacity permit",
        ),
        gate(
            "habitat-patch-accounting",
            "Suitable habitat cells belong to one patch",
            ecology.accounting_score,
            "Every cell above the declared suitability threshold is assigned exactly once",
        ),
        gate(
            "ecology-bounds",
            "Habitat and connectivity layers remain bounded",
            ecology.bounds_score,
            "Resistance-weighted suitability and local connectivity remain finite within 0..=1",
        ),
        gate(
            "finite-numerics",
            "Computed numeric layers are finite",
            finite_score,
            "Terrain, ET, and water-partition arrays contain no NaN or infinite values",
        ),
    ]
}

fn gate(id: &str, label: &str, score: f64, evidence: &str) -> ProcessGate {
    let score = score.clamp(0.0, 1.0);
    let status = if score >= 0.999 {
        GateStatus::Pass
    } else if score >= 0.98 {
        GateStatus::Review
    } else {
        GateStatus::Fail
    };
    ProcessGate {
        id: id.to_string(),
        label: label.to_string(),
        status,
        score,
        evidence: evidence.to_string(),
    }
}

fn neighbors(index: usize, width: usize, height: usize) -> impl Iterator<Item = usize> {
    let x = index % width;
    let y = index / width;
    let mut values = [usize::MAX; 8];
    let mut count = 0usize;
    for dy in -1isize..=1 {
        for dx in -1isize..=1 {
            if dx == 0 && dy == 0 {
                continue;
            }
            let nx = x as isize + dx;
            let ny = y as isize + dy;
            if nx < 0 || ny < 0 || nx >= width as isize || ny >= height as isize {
                continue;
            }
            values[count] = ny as usize * width + nx as usize;
            count += 1;
        }
    }
    values.into_iter().take(count)
}

fn mean(values: &[f64]) -> f64 {
    if values.is_empty() {
        0.0
    } else {
        values.iter().sum::<f64>() / values.len() as f64
    }
}

fn geometric_mean(values: impl Iterator<Item = f64>) -> f64 {
    let values: Vec<f64> = values.map(|value| value.clamp(0.0001, 1.0)).collect();
    if values.is_empty() {
        return 0.0;
    }
    (values.iter().map(|value| value.ln()).sum::<f64>() / values.len() as f64).exp()
}

fn method_references() -> Vec<MethodReference> {
    vec![
        MethodReference {
            id: "priority-flood".to_string(),
            method: "Priority-Flood depression resolution".to_string(),
            role: "Hydrologically connected elevation surface".to_string(),
        },
        MethodReference {
            id: "d8-routing".to_string(),
            method: "D8 single-flow-direction routing with topological accumulation".to_string(),
            role: "Inspectable drainage topology and contributing area".to_string(),
        },
        MethodReference {
            id: "freeman-mfd-routing".to_string(),
            method: "Freeman (1991) slope-weighted multiple-flow-direction routing".to_string(),
            role: "Divergent hillslope contributing area with mass-closing flow fractions"
                .to_string(),
        },
        MethodReference {
            id: "fao56-reference-et".to_string(),
            method: "FAO-56 Penman-Monteith structure with derived forcing".to_string(),
            role: "Reference atmospheric water demand".to_string(),
        },
        MethodReference {
            id: "nrcs-event-runoff".to_string(),
            method: "NRCS curve-number event-response constraint".to_string(),
            role: "Representative storm runoff tendency, not continuous infiltration".to_string(),
        },
        MethodReference {
            id: "linear-groundwater-reservoir".to_string(),
            method: "Time-stepped linear groundwater reservoir with exact fractional recession"
                .to_string(),
            role: "Storage, recharge, baseflow, overflow, and residual accounting".to_string(),
        },
        MethodReference {
            id: "rusle-structured-sediment".to_string(),
            method: "RUSLE-structured detachment with runoff transport-capacity limiting"
                .to_string(),
            role: "Screening sediment detachment, deposition, delivery, and mass closure"
                .to_string(),
        },
        MethodReference {
            id: "resistance-habitat-graph".to_string(),
            method: "Resistance-weighted raster habitat graph and connected components".to_string(),
            role: "Transparent habitat patches, local conductance, barriers, and bottlenecks"
                .to_string(),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    pub(crate) fn scenario() -> ScenarioInput {
        let width = 7;
        let height = 7;
        let mut elevation = Vec::with_capacity(width * height);
        for y in 0..height {
            for x in 0..width {
                let edge_fall = (height - 1 - y) as f64 * 2.0 + x as f64 * 0.3;
                elevation.push(120.0 + edge_fall);
            }
        }
        elevation[3 * width + 3] = 80.0;
        let cell_count = width * height;
        ScenarioInput {
            api_version: API_VERSION.to_string(),
            scenario_id: "core-test".to_string(),
            grid: GridInput {
                width,
                height,
                point_spacing_m: 100.0,
                cell_support_area_m2: 10_000.0,
                elevation_m: elevation,
            },
            climate: ClimateInput {
                annual_precipitation_mm: vec![1_100.0; cell_count],
                mean_temperature_c: vec![18.0; cell_count],
                relative_humidity_fraction: 0.68,
                wind_speed_m_s: 3.2,
                latitude_degrees: 32.0,
                day_of_year: 183,
            },
            surface: SurfaceInput {
                curve_number: vec![72.0; cell_count],
                hydraulic_conductivity_mm_h: vec![18.0; cell_count],
                available_water_capacity_mm: vec![160.0; cell_count],
                impervious_fraction: vec![0.08; cell_count],
                vegetation_fraction: vec![0.7; cell_count],
            },
            management: ManagementInput::default(),
            routing: RoutingInput {
                method: RoutingMethod::MultipleFlowDirection,
                ..RoutingInput::default()
            },
            subsurface: SubsurfaceInput::default(),
            geomorphology: GeomorphologyInput::default(),
            ecology: EcologyInput::default(),
            control: SimulationControl::default(),
            include_layers: true,
        }
    }

    #[test]
    fn rejects_mismatched_layers() {
        let mut input = scenario();
        input.surface.curve_number.pop();
        let error = validate_scenario(&input).expect_err("invalid layer must fail");
        assert_eq!(error.field, "surface.curveNumber");
    }

    #[test]
    fn rejects_invalid_process_controls() {
        let mut input = scenario();
        input.control.duration_days = 20;
        input.control.timestep_days = 400;
        let error = validate_scenario(&input).expect_err("invalid timestep must fail");
        assert_eq!(error.field, "control.timestepDays");

        let mut input = scenario();
        input.control.duration_days = 20;
        input.control.timestep_days = 30;
        validate_scenario(&input).expect("a final partial timestep is valid");

        let mut input = scenario();
        input.ecology.barrier_fraction = vec![0.2; input.grid.width * input.grid.height - 1];
        let error = validate_scenario(&input).expect_err("invalid barrier layer must fail");
        assert_eq!(error.field, "ecology.barrierFraction");
    }

    #[test]
    fn resolves_depressions_and_closes_water() {
        let input = scenario();
        let report = simulate(&input).expect("scenario should simulate");
        assert!(report.terrain.maximum_fill_depth_m > 30.0);
        assert!(report.summary.maximum_absolute_cell_residual_mm < 1e-8);
        assert!(report.water_budget.groundwater_recharge_m3 > 0.0);
        assert!(report.water_budget.generated_runoff_m3 > 0.0);
        assert!(report.subsurface_budget.baseflow_m3 > 0.0);
        assert!(report.sediment_budget.gross_detachment_kg > 0.0);
        assert!(report.ecology.patch_count > 0);
        assert_eq!(report.summary.failed_gate_count, 0);
        assert!(report.summary.process_integrity_index > 0.999);
    }

    #[test]
    fn routed_area_and_flow_fractions_close() {
        let input = scenario();
        let report = simulate(&input).expect("scenario should simulate");
        let layers = report.layers.expect("test requests layers");
        let mut outlet_area = 0.0;
        for index in 0..layers.flow_receiver.len() {
            let start = layers.flow_target_offsets[index];
            let end = layers.flow_target_offsets[index + 1];
            if start == end {
                outlet_area += layers.contributing_area_m2[index];
                continue;
            }
            let fraction_sum: f64 = layers.flow_target_fractions[start..end].iter().sum();
            assert!((fraction_sum - 1.0).abs() < 1e-10);
            for target in &layers.flow_target_indices[start..end] {
                assert!(
                    layers.filled_elevation_m[*target] <= layers.filled_elevation_m[index] + 1e-9
                );
            }
        }
        let expected_area =
            input.grid.cell_support_area_m2 * (input.grid.width * input.grid.height) as f64;
        assert!((outlet_area - expected_area).abs() / expected_area < 1e-12);
    }

    #[test]
    fn d8_remains_available_for_compatibility() {
        let mut input = scenario();
        input.routing.method = RoutingMethod::D8;
        let report = simulate(&input).expect("D8 scenario");
        let layers = report.layers.expect("layers");
        for index in 0..layers.flow_receiver.len() {
            let target_count =
                layers.flow_target_offsets[index + 1] - layers.flow_target_offsets[index];
            assert!(target_count <= 1);
        }
        assert_eq!(report.terrain.routing_method, "d8");
    }

    #[test]
    fn period_scaling_and_routed_fluxes_close() {
        let annual_input = scenario();
        let annual = simulate(&annual_input).expect("annual scenario");
        let mut monthly_input = scenario();
        monthly_input.control.duration_days = 30;
        monthly_input.control.timestep_days = 10;
        let monthly = simulate(&monthly_input).expect("monthly scenario");
        assert!(
            (monthly.water_budget.precipitation_m3 / annual.water_budget.precipitation_m3
                - 30.0 / 365.0)
                .abs()
                < 1e-12
        );
        assert!(
            (monthly.water_budget.groundwater_recharge_m3 - monthly.subsurface_budget.recharge_m3)
                .abs()
                < 1e-6
        );
        assert!(
            (monthly.ecology.mean_habitat_suitability - annual.ecology.mean_habitat_suitability)
                .abs()
                < 1e-12
        );
        assert!(
            (annual.water_budget.surface_runoff_outlet_m3
                - annual.water_budget.generated_runoff_m3)
                .abs()
                < 1e-6
        );
        assert!(
            (annual.water_budget.baseflow_outlet_m3 - annual.subsurface_budget.baseflow_m3).abs()
                < 1e-6
        );
    }

    #[test]
    fn simulation_is_deterministic() {
        let input = scenario();
        let first = simulate(&input).expect("first run");
        let second = simulate(&input).expect("second run");
        assert_eq!(
            first.water_budget.unresolved_residual_m3,
            second.water_budget.unresolved_residual_m3
        );
        assert_eq!(
            first.terrain.maximum_contributing_area_km2,
            second.terrain.maximum_contributing_area_km2
        );
    }
}
