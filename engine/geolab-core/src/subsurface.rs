use crate::{ScenarioInput, SubsurfaceBudget, mean};

pub(crate) struct SubsurfaceResult {
    pub(crate) budget: SubsurfaceBudget,
    pub(crate) storage_mm: Vec<f64>,
    pub(crate) saturation_fraction: Vec<f64>,
    pub(crate) baseflow_mm: Vec<f64>,
    pub(crate) water_table_depth_m: Vec<f64>,
    pub(crate) residual_mm: Vec<f64>,
}

pub(crate) fn simulate_subsurface(
    input: &ScenarioInput,
    period_recharge_mm: &[f64],
    cell_area_m2: f64,
) -> SubsurfaceResult {
    let cell_count = period_recharge_mm.len();
    let duration_days = input.control.duration_days as f64;
    let mut storage_mm = vec![0.0; cell_count];
    let mut initial_storage_mm = vec![0.0; cell_count];
    let mut capacity_mm = vec![0.0; cell_count];
    let mut soil_depth_m = vec![0.0; cell_count];
    let mut aquifer_thickness_m = vec![0.0; cell_count];
    let mut saturation_fraction = vec![0.0; cell_count];
    let mut baseflow_mm = vec![0.0; cell_count];
    let mut overflow_mm = vec![0.0; cell_count];
    let mut water_table_depth_m = vec![0.0; cell_count];
    let mut residual_mm = vec![0.0; cell_count];

    for index in 0..cell_count {
        let conductivity = input.surface.hydraulic_conductivity_mm_h[index];
        let conductivity_signal = (conductivity.ln_1p() / 80.0_f64.ln_1p()).clamp(0.0, 1.0);
        let soil_depth = layer_or(
            &input.subsurface.soil_depth_m,
            index,
            (input.surface.available_water_capacity_mm[index] / 150.0).clamp(0.25, 4.0),
        );
        let thickness = layer_or(
            &input.subsurface.aquifer_thickness_m,
            index,
            8.0 + conductivity_signal * 42.0,
        );
        let specific_yield = layer_or(
            &input.subsurface.specific_yield_fraction,
            index,
            0.06 + conductivity_signal * 0.2,
        )
        .clamp(0.01, 0.45);
        let initial_fraction = layer_or(
            &input.subsurface.initial_storage_fraction,
            index,
            0.28 + input.surface.vegetation_fraction[index] * 0.18,
        )
        .clamp(0.0, 1.0);
        soil_depth_m[index] = soil_depth;
        aquifer_thickness_m[index] = thickness;
        capacity_mm[index] = thickness * specific_yield * 1_000.0;
        initial_storage_mm[index] = capacity_mm[index] * initial_fraction;
        storage_mm[index] = initial_storage_mm[index];
        water_table_depth_m[index] = soil_depth + thickness * (1.0 - initial_fraction);
    }

    let mut elapsed_days = 0.0;
    let mut timestep_count = 0usize;
    while elapsed_days < duration_days - 1e-9 {
        let step_days = (input.control.timestep_days as f64).min(duration_days - elapsed_days);
        let annual_recession = input.subsurface.annual_baseflow_recession_fraction;
        let storage_decay = (1.0 - annual_recession).powf(step_days / 365.0);
        let decay_exponent = -storage_decay.ln();
        let inflow_retained_fraction = if decay_exponent <= 1e-12 {
            1.0
        } else {
            (1.0 - storage_decay) / decay_exponent
        };
        for index in 0..cell_count {
            let inflow = period_recharge_mm[index] * step_days / duration_days;
            let storage_before_capacity =
                storage_mm[index] * storage_decay + inflow * inflow_retained_fraction;
            let outflow = (storage_mm[index] + inflow - storage_before_capacity).max(0.0);
            let overflow = (storage_before_capacity - capacity_mm[index]).max(0.0);
            storage_mm[index] = storage_before_capacity.min(capacity_mm[index]);
            baseflow_mm[index] += outflow;
            overflow_mm[index] += overflow;
        }
        elapsed_days += step_days;
        timestep_count += 1;
    }

    for index in 0..cell_count {
        let total_recharge = period_recharge_mm[index];
        let raw_residual = initial_storage_mm[index] + total_recharge
            - baseflow_mm[index]
            - overflow_mm[index]
            - storage_mm[index];
        residual_mm[index] = if raw_residual.abs() <= 1e-9 {
            0.0
        } else {
            raw_residual
        };
        saturation_fraction[index] =
            (storage_mm[index] / capacity_mm[index].max(f64::EPSILON)).clamp(0.0, 1.0);
        water_table_depth_m[index] =
            soil_depth_m[index] + aquifer_thickness_m[index] * (1.0 - saturation_fraction[index]);
    }

    let depth_to_volume = |values: &[f64]| values.iter().sum::<f64>() / 1_000.0 * cell_area_m2;
    let initial_storage_m3 = depth_to_volume(&initial_storage_mm);
    let recharge_m3 = depth_to_volume(period_recharge_mm);
    let unresolved_residual_m3 = depth_to_volume(&residual_mm);
    let total_input_m3 = initial_storage_m3 + recharge_m3;
    let budget = SubsurfaceBudget {
        initial_storage_m3,
        recharge_m3,
        baseflow_m3: depth_to_volume(&baseflow_mm),
        capacity_overflow_m3: depth_to_volume(&overflow_mm),
        final_storage_m3: depth_to_volume(&storage_mm),
        unresolved_residual_m3,
        residual_percent_of_input: if total_input_m3 > 0.0 {
            unresolved_residual_m3 / total_input_m3 * 100.0
        } else {
            0.0
        },
        mean_saturation_fraction: mean(&saturation_fraction),
        mean_water_table_depth_m: mean(&water_table_depth_m),
        timestep_count,
    };
    SubsurfaceResult {
        budget,
        storage_mm,
        saturation_fraction,
        baseflow_mm,
        water_table_depth_m,
        residual_mm,
    }
}

fn layer_or(values: &[f64], index: usize, fallback: f64) -> f64 {
    values.get(index).copied().unwrap_or(fallback)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::scenario;

    #[test]
    fn linear_reservoir_closes() {
        let mut input = scenario();
        let count = input.grid.width * input.grid.height;
        input.subsurface.initial_storage_fraction = vec![0.0; count];
        let result =
            simulate_subsurface(&input, &vec![120.0; count], input.grid.cell_support_area_m2);
        assert_eq!(result.budget.initial_storage_m3, 0.0);
        assert!(result.budget.baseflow_m3 > 0.0);
        assert!(result.budget.residual_percent_of_input.abs() < 1e-10);
        assert_eq!(result.budget.timestep_count, 13);
    }

    #[test]
    fn constant_recharge_is_timestep_stable() {
        let mut coarse = scenario();
        let count = coarse.grid.width * coarse.grid.height;
        coarse.subsurface.initial_storage_fraction = vec![0.2; count];
        coarse.control.timestep_days = 30;
        let mut daily = coarse.clone();
        daily.control.timestep_days = 1;
        let recharge = vec![120.0; count];
        let coarse_result =
            simulate_subsurface(&coarse, &recharge, coarse.grid.cell_support_area_m2);
        let daily_result = simulate_subsurface(&daily, &recharge, daily.grid.cell_support_area_m2);
        assert!(
            (coarse_result.budget.final_storage_m3 - daily_result.budget.final_storage_m3).abs()
                / daily_result.budget.final_storage_m3
                < 1e-12
        );
        assert!(
            (coarse_result.budget.baseflow_m3 - daily_result.budget.baseflow_m3).abs()
                / daily_result.budget.baseflow_m3
                < 1e-12
        );
    }
}
