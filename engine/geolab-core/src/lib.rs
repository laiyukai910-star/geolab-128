use serde::{Deserialize, Serialize};
use std::cmp::{Ordering, Reverse};
use std::collections::{BinaryHeap, VecDeque};
use std::error::Error;
use std::f64::consts::PI;
use std::fmt::{Display, Formatter};

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
pub struct SimulationReport {
    pub api_version: String,
    pub engine: String,
    pub scenario_id: String,
    pub grid: GridSummary,
    pub terrain: TerrainSummary,
    pub water_budget: WaterBudget,
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationLayers {
    pub filled_elevation_m: Vec<f64>,
    pub fill_depth_m: Vec<f64>,
    pub slope_degrees: Vec<f64>,
    pub flow_receiver: Vec<i64>,
    pub contributing_area_m2: Vec<f64>,
    pub discharge_m3_year: Vec<f64>,
    pub reference_evapotranspiration_mm: Vec<f64>,
    pub actual_evapotranspiration_mm: Vec<f64>,
    pub runoff_depth_mm: Vec<f64>,
    pub groundwater_recharge_mm: Vec<f64>,
    pub soil_storage_change_mm: Vec<f64>,
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
    Ok(())
}

pub fn simulate(input: &ScenarioInput) -> Result<SimulationReport, ModelError> {
    validate_scenario(input)?;
    let cell_count = input.grid.width * input.grid.height;
    let cell_area_m2 = input.grid.cell_support_area_m2;
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
    let receivers = d8_receivers(
        &filled,
        &flood_parent,
        input.grid.width,
        input.grid.height,
        input.grid.point_spacing_m,
    );

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
        let precipitation = input.climate.annual_precipitation_mm[index];
        let irrigation = optional_value(&input.management.irrigation_mm, index);
        let requested_demand = optional_value(&input.management.requested_demand_mm, index);
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
            precipitation,
        );
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

    let (contributing_area, discharge) =
        route_accumulation(&receivers, cell_area_m2, &local_runoff_m3)?;
    let water_budget = summarize_water(
        input,
        cell_area_m2,
        &allocated_demand,
        &unmet_demand,
        &actual_et,
        &runoff,
        &recharge,
        &storage,
        &residual,
        &receivers,
        &discharge,
    );
    let gates = build_gates(
        input,
        &filled,
        &receivers,
        &contributing_area,
        &reference_et,
        &actual_et,
        &residual,
    );
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
        outlet_count: receivers.iter().filter(|receiver| **receiver < 0).count(),
        maximum_contributing_area_km2: contributing_area.iter().copied().fold(0.0, f64::max)
            / 1_000_000.0,
    };
    let layers = input.include_layers.then(|| SimulationLayers {
        filled_elevation_m: filled,
        fill_depth_m: fill_depth,
        slope_degrees: slopes,
        flow_receiver: receivers.iter().map(|receiver| *receiver as i64).collect(),
        contributing_area_m2: contributing_area,
        discharge_m3_year: discharge,
        reference_evapotranspiration_mm: reference_et,
        actual_evapotranspiration_mm: actual_et,
        runoff_depth_mm: runoff,
        groundwater_recharge_mm: recharge,
        soil_storage_change_mm: storage,
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
        gates,
        summary,
        layers,
        methods: method_references(),
        limitations: vec![
            "The Rust core is an independent screening kernel, not a calibrated forecast.".to_string(),
            "Reference ET uses derived radiation and temperature range when station observations are absent.".to_string(),
            "Version 1 routing is depression-resolved D8, not a two-dimensional hydraulic solver.".to_string(),
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

fn d8_receivers(
    filled: &[f64],
    flood_parent: &[isize],
    width: usize,
    height: usize,
    cell_size_m: f64,
) -> Vec<isize> {
    let mut receivers = vec![-1; filled.len()];
    for index in 0..filled.len() {
        let x = index % width;
        let y = index / width;
        if x == 0 || y == 0 || x + 1 == width || y + 1 == height {
            continue;
        }
        let mut best_receiver = -1;
        let mut best_slope = 0.0;
        for neighbor in neighbors(index, width, height) {
            let dx = (neighbor % width) as isize - x as isize;
            let dy = (neighbor / width) as isize - y as isize;
            let distance = (dx as f64).hypot(dy as f64) * cell_size_m;
            let slope = (filled[index] - filled[neighbor]) / distance.max(0.1);
            if slope > best_slope + 1e-12 {
                best_slope = slope;
                best_receiver = neighbor as isize;
            }
        }
        receivers[index] = if best_receiver >= 0 {
            best_receiver
        } else {
            flood_parent[index]
        };
    }
    receivers
}

fn route_accumulation(
    receivers: &[isize],
    cell_area_m2: f64,
    local_runoff_m3: &[f64],
) -> Result<(Vec<f64>, Vec<f64>), ModelError> {
    let mut upstream_count = vec![0usize; receivers.len()];
    for receiver in receivers {
        if *receiver >= 0 {
            upstream_count[*receiver as usize] += 1;
        }
    }
    let mut queue: VecDeque<usize> = upstream_count
        .iter()
        .enumerate()
        .filter_map(|(index, count)| (*count == 0).then_some(index))
        .collect();
    let mut area = vec![cell_area_m2; receivers.len()];
    let mut discharge = local_runoff_m3.to_vec();
    let mut processed = 0usize;
    while let Some(index) = queue.pop_front() {
        processed += 1;
        let receiver = receivers[index];
        if receiver < 0 {
            continue;
        }
        let target = receiver as usize;
        area[target] += area[index];
        discharge[target] += discharge[index];
        upstream_count[target] -= 1;
        if upstream_count[target] == 0 {
            queue.push_back(target);
        }
    }
    if processed != receivers.len() {
        return Err(ModelError::new(
            "routing",
            "receiver graph contains a cycle",
        ));
    }
    Ok((area, discharge))
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
    cell_area_m2: f64,
    allocated_demand: &[f64],
    unmet_demand: &[f64],
    actual_et: &[f64],
    runoff: &[f64],
    recharge: &[f64],
    storage: &[f64],
    residual: &[f64],
    receivers: &[isize],
    discharge: &[f64],
) -> WaterBudget {
    let depth_to_volume = |values: &[f64]| values.iter().sum::<f64>() / 1_000.0 * cell_area_m2;
    let precipitation_m3 = depth_to_volume(&input.climate.annual_precipitation_mm);
    let irrigation_m3 = depth_to_volume(&input.management.irrigation_mm);
    let requested_demand_m3 = depth_to_volume(&input.management.requested_demand_mm);
    let unresolved_residual_m3 = depth_to_volume(residual);
    let total_input = precipitation_m3 + irrigation_m3;
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
        outlet_discharge_m3: receivers
            .iter()
            .enumerate()
            .filter_map(|(index, receiver)| (*receiver < 0).then_some(discharge[index]))
            .sum(),
    }
}

fn build_gates(
    input: &ScenarioInput,
    filled: &[f64],
    receivers: &[isize],
    contributing_area: &[f64],
    reference_et: &[f64],
    actual_et: &[f64],
    residual: &[f64],
) -> Vec<ProcessGate> {
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
    let mut routing_checks = 0usize;
    let mut routing_passes = 0usize;
    let mut accumulation_passes = 0usize;
    for (index, receiver) in receivers.iter().enumerate() {
        if *receiver < 0 {
            continue;
        }
        routing_checks += 1;
        let target = *receiver as usize;
        if filled[target] <= filled[index] + 1e-9 {
            routing_passes += 1;
        }
        if contributing_area[target] + 1e-6 >= contributing_area[index] {
            accumulation_passes += 1;
        }
    }
    let routing_score = if routing_checks > 0 {
        routing_passes as f64 / routing_checks as f64
    } else {
        1.0
    };
    let accumulation_score = if routing_checks > 0 {
        accumulation_passes as f64 / routing_checks as f64
    } else {
        1.0
    };
    let finite_score = [filled, reference_et, actual_et, residual]
        .iter()
        .flat_map(|values| values.iter())
        .filter(|value| value.is_finite())
        .count() as f64
        / (cell_count * 4) as f64;
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
            "D8 receivers do not route uphill",
            routing_score,
            "Every retained receiver follows an equal or lower depression-resolved elevation",
        ),
        gate(
            "accumulation-continuity",
            "Contributing area is non-decreasing downstream",
            accumulation_score,
            "Receiver accumulation includes the complete source contribution",
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
            id: "fao56-reference-et".to_string(),
            method: "FAO-56 Penman-Monteith structure with derived forcing".to_string(),
            role: "Reference atmospheric water demand".to_string(),
        },
        MethodReference {
            id: "nrcs-event-runoff".to_string(),
            method: "NRCS curve-number event-response constraint".to_string(),
            role: "Representative storm runoff tendency, not continuous infiltration".to_string(),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scenario() -> ScenarioInput {
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
    fn resolves_depressions_and_closes_water() {
        let input = scenario();
        let report = simulate(&input).expect("scenario should simulate");
        assert!(report.terrain.maximum_fill_depth_m > 30.0);
        assert!(report.summary.maximum_absolute_cell_residual_mm < 1e-8);
        assert!(report.water_budget.groundwater_recharge_m3 > 0.0);
        assert!(report.water_budget.generated_runoff_m3 > 0.0);
        assert_eq!(report.summary.failed_gate_count, 0);
        assert!(report.summary.process_integrity_index > 0.999);
    }

    #[test]
    fn routed_area_is_monotonic() {
        let input = scenario();
        let report = simulate(&input).expect("scenario should simulate");
        let layers = report.layers.expect("test requests layers");
        for (index, receiver) in layers.flow_receiver.iter().enumerate() {
            if *receiver < 0 {
                continue;
            }
            assert!(
                layers.filled_elevation_m[*receiver as usize]
                    <= layers.filled_elevation_m[index] + 1e-9
            );
            assert!(
                layers.contributing_area_m2[*receiver as usize]
                    >= layers.contributing_area_m2[index]
            );
        }
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
