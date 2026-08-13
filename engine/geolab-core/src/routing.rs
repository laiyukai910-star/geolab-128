use crate::{ModelError, RoutingMethod, neighbors};
use std::collections::VecDeque;

#[derive(Debug, Clone, Copy)]
pub(crate) struct FlowTarget {
    pub(crate) index: usize,
    pub(crate) fraction: f64,
}

#[derive(Debug, Clone)]
pub(crate) struct FlowNetwork {
    pub(crate) targets: Vec<Vec<FlowTarget>>,
    pub(crate) dominant_receivers: Vec<isize>,
    pub(crate) topological_order: Vec<usize>,
}

impl FlowNetwork {
    pub(crate) fn outlet_count(&self) -> usize {
        self.targets
            .iter()
            .filter(|targets| targets.is_empty())
            .count()
    }

    pub(crate) fn divergent_cell_fraction(&self) -> f64 {
        let routed = self
            .targets
            .iter()
            .filter(|targets| !targets.is_empty())
            .count();
        if routed == 0 {
            return 0.0;
        }
        self.targets
            .iter()
            .filter(|targets| targets.len() > 1)
            .count() as f64
            / routed as f64
    }

    pub(crate) fn outlet_sum(&self, values: &[f64]) -> f64 {
        self.targets
            .iter()
            .enumerate()
            .filter_map(|(index, targets)| targets.is_empty().then_some(values[index]))
            .sum()
    }

    pub(crate) fn flattened_targets(&self) -> (Vec<usize>, Vec<usize>, Vec<f64>) {
        let mut offsets = Vec::with_capacity(self.targets.len() + 1);
        let mut indices = Vec::new();
        let mut fractions = Vec::new();
        offsets.push(0);
        for targets in &self.targets {
            for target in targets {
                indices.push(target.index);
                fractions.push(target.fraction);
            }
            offsets.push(indices.len());
        }
        (offsets, indices, fractions)
    }
}

pub(crate) fn build_flow_network(
    filled: &[f64],
    flood_parent: &[isize],
    width: usize,
    height: usize,
    point_spacing_m: f64,
    method: RoutingMethod,
    mfd_exponent: f64,
) -> Result<FlowNetwork, ModelError> {
    let mut targets = vec![Vec::new(); filled.len()];
    for index in 0..filled.len() {
        let x = index % width;
        let y = index / width;
        if x == 0 || y == 0 || x + 1 == width || y + 1 == height {
            continue;
        }
        let mut candidates = Vec::with_capacity(8);
        for neighbor in neighbors(index, width, height) {
            let dx = (neighbor % width) as isize - x as isize;
            let dy = (neighbor / width) as isize - y as isize;
            let distance = (dx as f64).hypot(dy as f64) * point_spacing_m;
            let slope = (filled[index] - filled[neighbor]) / distance.max(0.1);
            if slope > 1e-12 {
                candidates.push((neighbor, slope));
            }
        }
        if candidates.is_empty() {
            let parent = flood_parent[index];
            if parent >= 0 {
                targets[index].push(FlowTarget {
                    index: parent as usize,
                    fraction: 1.0,
                });
            }
            continue;
        }
        match method {
            RoutingMethod::D8 => {
                candidates.sort_by(|left, right| {
                    right
                        .1
                        .total_cmp(&left.1)
                        .then_with(|| left.0.cmp(&right.0))
                });
                targets[index].push(FlowTarget {
                    index: candidates[0].0,
                    fraction: 1.0,
                });
            }
            RoutingMethod::MultipleFlowDirection => {
                let denominator: f64 = candidates
                    .iter()
                    .map(|(_, slope)| slope.powf(mfd_exponent))
                    .sum();
                candidates.sort_by_key(|candidate| candidate.0);
                for (target, slope) in candidates {
                    targets[index].push(FlowTarget {
                        index: target,
                        fraction: slope.powf(mfd_exponent) / denominator.max(f64::EPSILON),
                    });
                }
            }
        }
    }

    let topological_order = topological_order(&targets)?;
    let dominant_receivers = targets
        .iter()
        .map(|cell_targets| {
            cell_targets
                .iter()
                .max_by(|left, right| {
                    left.fraction
                        .total_cmp(&right.fraction)
                        .then_with(|| right.index.cmp(&left.index))
                })
                .map(|target| target.index as isize)
                .unwrap_or(-1)
        })
        .collect();
    Ok(FlowNetwork {
        targets,
        dominant_receivers,
        topological_order,
    })
}

fn topological_order(targets: &[Vec<FlowTarget>]) -> Result<Vec<usize>, ModelError> {
    let mut upstream_count = vec![0usize; targets.len()];
    for cell_targets in targets {
        for target in cell_targets {
            upstream_count[target.index] += 1;
        }
    }
    let mut queue: VecDeque<usize> = upstream_count
        .iter()
        .enumerate()
        .filter_map(|(index, count)| (*count == 0).then_some(index))
        .collect();
    let mut order = Vec::with_capacity(targets.len());
    while let Some(index) = queue.pop_front() {
        order.push(index);
        for target in &targets[index] {
            upstream_count[target.index] -= 1;
            if upstream_count[target.index] == 0 {
                queue.push_back(target.index);
            }
        }
    }
    if order.len() != targets.len() {
        return Err(ModelError::new(
            "routing",
            "flow-fraction graph contains a cycle",
        ));
    }
    Ok(order)
}

pub(crate) fn route_accumulation(
    network: &FlowNetwork,
    cell_area_m2: f64,
    local_runoff_m3: &[f64],
) -> (Vec<f64>, Vec<f64>) {
    let mut area = vec![cell_area_m2; network.targets.len()];
    let mut discharge = local_runoff_m3.to_vec();
    for &index in &network.topological_order {
        for target in &network.targets[index] {
            area[target.index] += area[index] * target.fraction;
            discharge[target.index] += discharge[index] * target.fraction;
        }
    }
    (area, discharge)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mfd_fractions_close() {
        let filled = vec![
            10.0, 9.0, 8.0, //
            10.0, 9.0, 7.0, //
            10.0, 8.0, 6.0,
        ];
        let parent = vec![-1; 9];
        let network = build_flow_network(
            &filled,
            &parent,
            3,
            3,
            10.0,
            RoutingMethod::MultipleFlowDirection,
            1.1,
        )
        .expect("network");
        assert!(network.targets[4].len() > 1);
        let sum: f64 = network.targets[4]
            .iter()
            .map(|target| target.fraction)
            .sum();
        assert!((sum - 1.0).abs() < 1e-12);
    }
}
