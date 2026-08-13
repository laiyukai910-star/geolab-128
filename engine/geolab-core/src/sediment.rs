use crate::routing::FlowNetwork;
use crate::{ScenarioInput, SedimentBudget, mean, optional_value};

pub(crate) struct SedimentResult {
    pub(crate) budget: SedimentBudget,
    pub(crate) gross_detachment_kg: Vec<f64>,
    pub(crate) deposition_kg: Vec<f64>,
    pub(crate) outflow_kg: Vec<f64>,
    pub(crate) transport_capacity_kg: Vec<f64>,
    pub(crate) capacity_score: f64,
}

pub(crate) fn simulate_sediment(
    input: &ScenarioInput,
    network: &FlowNetwork,
    slopes_degrees: &[f64],
    contributing_area_m2: &[f64],
    discharge_m3: &[f64],
) -> SedimentResult {
    let cell_count = slopes_degrees.len();
    let cell_area_m2 = input.grid.cell_support_area_m2;
    let duration_fraction = input.control.duration_days as f64 / 365.0;
    let mean_precipitation = mean(&input.climate.annual_precipitation_mm);
    let rainfall_erosivity = input
        .geomorphology
        .rainfall_erosivity_mj_mm_ha_h_year
        .unwrap_or((mean_precipitation * 0.55).clamp(20.0, 12_000.0));
    let mut gross_detachment_kg = vec![0.0; cell_count];
    let mut transport_capacity_kg = vec![0.0; cell_count];
    for index in 0..cell_count {
        let curve_number_signal =
            ((input.surface.curve_number[index] - 30.0) / 70.0).clamp(0.0, 1.0);
        let erodibility = if input.geomorphology.soil_erodibility_factor.is_empty() {
            0.012 + curve_number_signal * 0.036
        } else {
            optional_value(&input.geomorphology.soil_erodibility_factor, index)
        };
        let support_practice = if input.geomorphology.support_practice_factor.is_empty() {
            1.0
        } else {
            optional_value(&input.geomorphology.support_practice_factor, index)
        };
        let slope_radians = slopes_degrees[index].to_radians();
        let specific_catchment_m =
            contributing_area_m2[index] / input.grid.point_spacing_m.max(0.1);
        let length_factor = (specific_catchment_m / 22.13).max(0.01).powf(0.4);
        let steepness_factor = (slope_radians.sin() / 0.0896).max(0.01).powf(1.3);
        let length_steepness = (length_factor * steepness_factor).clamp(0.01, 60.0);
        let vegetation = input.surface.vegetation_fraction[index];
        let impervious = input.surface.impervious_fraction[index];
        let cover_management =
            ((-3.0 * vegetation).exp() * (1.0 - impervious) + impervious * 0.01).clamp(0.005, 1.0);
        let soil_loss_t_ha = (rainfall_erosivity
            * erodibility
            * length_steepness
            * cover_management
            * support_practice
            * duration_fraction)
            .clamp(0.0, 500.0 * duration_fraction.max(0.01));
        gross_detachment_kg[index] = soil_loss_t_ha * (cell_area_m2 / 10_000.0) * 1_000.0;

        let hydraulic_gradient = slope_radians.tan().max(0.0);
        let concentration_capacity_kg_m3 = (input.geomorphology.transport_capacity_coefficient
            * 1_000.0
            * hydraulic_gradient.sqrt()
            * (1.0 - vegetation * 0.55)
            * (1.0 + impervious * 0.15))
            .clamp(0.0, 80.0);
        transport_capacity_kg[index] = discharge_m3[index] * concentration_capacity_kg_m3;
    }

    let mut incoming_kg = vec![0.0; cell_count];
    let mut deposition_kg = vec![0.0; cell_count];
    let mut outflow_kg = vec![0.0; cell_count];
    let mut outlet_export_kg = 0.0;
    let mut capacity_passes = 0usize;
    for &index in &network.topological_order {
        let available = incoming_kg[index] + gross_detachment_kg[index];
        outflow_kg[index] = available.min(transport_capacity_kg[index]);
        deposition_kg[index] = (available - outflow_kg[index]).max(0.0);
        if outflow_kg[index] <= transport_capacity_kg[index] + 1e-6 {
            capacity_passes += 1;
        }
        if network.targets[index].is_empty() {
            outlet_export_kg += outflow_kg[index];
        } else {
            for target in &network.targets[index] {
                incoming_kg[target.index] += outflow_kg[index] * target.fraction;
            }
        }
    }

    let gross_detachment_total = gross_detachment_kg.iter().sum::<f64>();
    let deposited_total = deposition_kg.iter().sum::<f64>();
    let raw_residual_kg = gross_detachment_total - deposited_total - outlet_export_kg;
    let residual_tolerance_kg = (gross_detachment_total * 1e-12).max(1e-6);
    let residual_kg = if raw_residual_kg.abs() <= residual_tolerance_kg {
        0.0
    } else {
        raw_residual_kg
    };
    let total_area_ha = cell_area_m2 * cell_count as f64 / 10_000.0;
    let budget = SedimentBudget {
        gross_detachment_kg: gross_detachment_total,
        deposited_kg: deposited_total,
        outlet_export_kg,
        unresolved_residual_kg: residual_kg,
        residual_percent_of_detachment: if gross_detachment_total > 0.0 {
            residual_kg / gross_detachment_total * 100.0
        } else {
            0.0
        },
        sediment_delivery_ratio: if gross_detachment_total > 0.0 {
            outlet_export_kg / gross_detachment_total
        } else {
            0.0
        },
        mean_soil_loss_t_ha_period: if total_area_ha > 0.0 {
            gross_detachment_total / 1_000.0 / total_area_ha
        } else {
            0.0
        },
        maximum_transport_capacity_kg: transport_capacity_kg.iter().copied().fold(0.0, f64::max),
    };
    SedimentResult {
        budget,
        gross_detachment_kg,
        deposition_kg,
        outflow_kg,
        transport_capacity_kg,
        capacity_score: capacity_passes as f64 / cell_count.max(1) as f64,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{RoutingMethod, priority_flood, routing::build_flow_network, tests::scenario};

    #[test]
    fn sediment_mass_is_conserved() {
        let input = scenario();
        let (filled, parent) =
            priority_flood(&input.grid.elevation_m, input.grid.width, input.grid.height);
        let network = build_flow_network(
            &filled,
            &parent,
            input.grid.width,
            input.grid.height,
            input.grid.point_spacing_m,
            RoutingMethod::MultipleFlowDirection,
            1.1,
        )
        .expect("network");
        let count = filled.len();
        let result = simulate_sediment(
            &input,
            &network,
            &vec![8.0; count],
            &vec![input.grid.cell_support_area_m2; count],
            &vec![20_000.0; count],
        );
        assert!(result.budget.gross_detachment_kg > 0.0);
        assert!(result.budget.residual_percent_of_detachment.abs() < 1e-9);
    }
}
