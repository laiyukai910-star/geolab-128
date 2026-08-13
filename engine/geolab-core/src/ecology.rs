use crate::{EcologySummary, ScenarioInput, mean, neighbors, optional_value};
use std::collections::VecDeque;

pub(crate) struct EcologyResult {
    pub(crate) summary: EcologySummary,
    pub(crate) habitat_suitability: Vec<f64>,
    pub(crate) connectivity: Vec<f64>,
    pub(crate) patch_id: Vec<u32>,
    pub(crate) accounting_score: f64,
    pub(crate) bounds_score: f64,
}

pub(crate) fn simulate_ecology(
    input: &ScenarioInput,
    slopes_degrees: &[f64],
    reference_et_mm: &[f64],
) -> EcologyResult {
    let cell_count = slopes_degrees.len();
    let period_fraction = input.control.duration_days as f64 / 365.0;
    let mut suitability = vec![0.0; cell_count];
    let mut barrier = vec![0.0; cell_count];
    for index in 0..cell_count {
        let temperature_distance = (input.climate.mean_temperature_c[index]
            - input.ecology.preferred_temperature_c)
            / input.ecology.temperature_tolerance_c;
        let temperature_score = (-0.5 * temperature_distance.powi(2)).exp();
        let annualized_reference_et = reference_et_mm[index] / period_fraction.max(f64::EPSILON);
        let moisture_index =
            input.climate.annual_precipitation_mm[index] / annualized_reference_et.max(1.0);
        let moisture_distance = (moisture_index - input.ecology.preferred_moisture_index)
            / input.ecology.moisture_tolerance;
        let moisture_score = (-0.5 * moisture_distance.powi(2)).exp();
        let slope_ratio = slopes_degrees[index] / input.ecology.maximum_slope_degrees;
        let slope_score = (-0.5 * slope_ratio.powi(2)).exp();
        let vegetation_score = (0.08 + input.surface.vegetation_fraction[index] * 0.92).sqrt();
        barrier[index] = if input.ecology.barrier_fraction.is_empty() {
            input.surface.impervious_fraction[index]
        } else {
            optional_value(&input.ecology.barrier_fraction, index)
                .max(input.surface.impervious_fraction[index])
        }
        .clamp(0.0, 1.0);
        suitability[index] = (temperature_score * moisture_score * slope_score * vegetation_score)
            .powf(0.25)
            * (1.0 - barrier[index]);
    }

    let suitable: Vec<bool> = suitability
        .iter()
        .map(|value| *value >= input.ecology.habitat_threshold)
        .collect();
    let mut patch_id = vec![0u32; cell_count];
    let mut patch_areas = Vec::new();
    let mut next_patch_id = 1u32;
    for start in 0..cell_count {
        if !suitable[start] || patch_id[start] != 0 {
            continue;
        }
        let mut queue = VecDeque::from([start]);
        patch_id[start] = next_patch_id;
        let mut patch_cells = 0usize;
        while let Some(index) = queue.pop_front() {
            patch_cells += 1;
            for neighbor in neighbors(index, input.grid.width, input.grid.height) {
                if suitable[neighbor] && patch_id[neighbor] == 0 {
                    patch_id[neighbor] = next_patch_id;
                    queue.push_back(neighbor);
                }
            }
        }
        patch_areas.push(patch_cells as f64 * input.grid.cell_support_area_m2);
        next_patch_id += 1;
    }

    let mut connectivity = vec![0.0; cell_count];
    let mut barrier_edges = 0usize;
    let mut edge_count = 0usize;
    let mut corridor_bottleneck_count = 0usize;
    for index in 0..cell_count {
        let mut conductance_sum = 0.0;
        let mut neighbor_count = 0usize;
        let mut suitable_neighbors = 0usize;
        for neighbor in neighbors(index, input.grid.width, input.grid.height) {
            if neighbor <= index {
                continue;
            }
            let edge_barrier = barrier[index].max(barrier[neighbor]);
            if edge_barrier >= 0.65 {
                barrier_edges += 1;
            }
            edge_count += 1;
        }
        for neighbor in neighbors(index, input.grid.width, input.grid.height) {
            let edge_barrier = barrier[index].max(barrier[neighbor]);
            conductance_sum +=
                (suitability[index] * suitability[neighbor]).sqrt() * (1.0 - edge_barrier);
            neighbor_count += 1;
            if suitable[neighbor] {
                suitable_neighbors += 1;
            }
        }
        connectivity[index] = if neighbor_count > 0 {
            conductance_sum / neighbor_count as f64
        } else {
            0.0
        };
        if suitable[index] && suitable_neighbors == 2 && connectivity[index] < 0.62 {
            corridor_bottleneck_count += 1;
        }
    }

    let suitable_cell_count = suitable.iter().filter(|value| **value).count();
    let assigned_cell_count = patch_id.iter().filter(|value| **value > 0).count();
    let suitable_area_m2 = suitable_cell_count as f64 * input.grid.cell_support_area_m2;
    let effective_area_m2: f64 = suitability
        .iter()
        .zip(&suitable)
        .filter_map(|(value, included)| included.then_some(*value))
        .sum::<f64>()
        * input.grid.cell_support_area_m2;
    let largest_patch_m2 = patch_areas.iter().copied().fold(0.0, f64::max);
    let bounds_passes = suitability
        .iter()
        .chain(&connectivity)
        .filter(|value| value.is_finite() && **value >= 0.0 && **value <= 1.0)
        .count();
    EcologyResult {
        summary: EcologySummary {
            suitable_habitat_area_km2: suitable_area_m2 / 1_000_000.0,
            effective_habitat_area_km2: effective_area_m2 / 1_000_000.0,
            patch_count: patch_areas.len(),
            largest_patch_area_km2: largest_patch_m2 / 1_000_000.0,
            largest_patch_fraction: if suitable_area_m2 > 0.0 {
                largest_patch_m2 / suitable_area_m2
            } else {
                0.0
            },
            mean_habitat_suitability: mean(&suitability),
            mean_resistance_connectivity: mean(&connectivity),
            barrier_edge_fraction: if edge_count > 0 {
                barrier_edges as f64 / edge_count as f64
            } else {
                0.0
            },
            corridor_bottleneck_count,
        },
        habitat_suitability: suitability,
        connectivity,
        patch_id,
        accounting_score: if suitable_cell_count == 0 {
            1.0
        } else {
            1.0 - assigned_cell_count.abs_diff(suitable_cell_count) as f64
                / suitable_cell_count as f64
        },
        bounds_score: bounds_passes as f64 / (cell_count * 2).max(1) as f64,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::scenario;

    #[test]
    fn habitat_patches_account_for_suitable_cells() {
        let input = scenario();
        let count = input.grid.width * input.grid.height;
        let result = simulate_ecology(&input, &vec![4.0; count], &vec![900.0; count]);
        assert_eq!(result.accounting_score, 1.0);
        assert_eq!(result.bounds_score, 1.0);
        assert!(result.summary.patch_count > 0);
    }
}
