//! Boundary-connected seawater screening, not a salinity or lake-level solver.

pub const MAX_WATER_AXIS: usize = 4096;
pub const MAX_WATER_CELLS: usize = MAX_WATER_AXIS * MAX_WATER_AXIS;
pub const MARINE: u8 = 1;
pub const RIVER: u8 = 2;

pub fn classify_water_cells(
    width: usize,
    height: usize,
    sea_level: f64,
    elevation: &[f32],
    river_nodes: &[u32],
) -> Result<Vec<u8>, &'static str> {
    if width == 0 || height == 0 || width > MAX_WATER_AXIS || height > MAX_WATER_AXIS {
        return Err("water grid axes must be between 1 and 4096");
    }
    let count = width * height;
    if elevation.len() != count {
        return Err("elevation length must match water grid dimensions");
    }
    if !sea_level.is_finite() || elevation.iter().any(|value| !value.is_finite()) {
        return Err("water elevations and sea level must be finite");
    }
    if river_nodes.len() > count * 2 || river_nodes.iter().any(|&index| index as usize >= count) {
        return Err("river endpoints must fit the water grid");
    }

    let mut flags = vec![0_u8; count];
    for &index in river_nodes {
        flags[index as usize] |= RIVER;
    }
    let mut queue = Vec::with_capacity(count);
    let visit = |index: usize, flags: &mut [u8], queue: &mut Vec<u32>| {
        if flags[index] & MARINE == 0 && f64::from(elevation[index]) < sea_level {
            flags[index] |= MARINE;
            queue.push(index as u32);
        }
    };
    for x in 0..width {
        visit(x, &mut flags, &mut queue);
        visit((height - 1) * width + x, &mut flags, &mut queue);
    }
    for y in 0..height {
        visit(y * width, &mut flags, &mut queue);
        visit(y * width + width - 1, &mut flags, &mut queue);
    }
    let mut head = 0;
    while head < queue.len() {
        let index = queue[head] as usize;
        head += 1;
        let x = index % width;
        if x > 0 {
            visit(index - 1, &mut flags, &mut queue);
        }
        if x + 1 < width {
            visit(index + 1, &mut flags, &mut queue);
        }
        if index >= width {
            visit(index - width, &mut flags, &mut queue);
        }
        if index + width < count {
            visit(index + width, &mut flags, &mut queue);
        }
    }
    Ok(flags)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn excludes_diagonal_water_and_isolated_depressions() {
        let mut heights = vec![4.0; 25];
        heights[0] = -1.0;
        heights[6] = -1.0;
        heights[12] = -3.0;
        let flags = classify_water_cells(5, 5, 0.0, &heights, &[0, 7, 7, 8]).unwrap();
        assert_eq!(flags[0], MARINE | RIVER);
        assert_eq!(flags[6], 0);
        assert_eq!(flags[12], 0);
        assert_eq!(flags[7], RIVER);
        heights[1] = -1.0;
        let opened = classify_water_cells(5, 5, 0.0, &heights, &[]).unwrap();
        assert_eq!(opened[6], MARINE);
        assert_eq!(opened[12], 0);
    }

    #[test]
    fn handles_rectangular_and_single_axis_grids_without_row_wrap() {
        assert_eq!(
            classify_water_cells(1, 3, 0.0, &[-1.0, 0.0, -1.0], &[]).unwrap(),
            vec![1, 0, 1]
        );
        assert_eq!(
            classify_water_cells(3, 1, 0.0, &[-1.0, 0.0, -1.0], &[]).unwrap(),
            vec![1, 0, 1]
        );
        assert_eq!(
            classify_water_cells(1, 1, 1.0, &[0.0], &[0]).unwrap(),
            vec![3]
        );
        let mut heights = vec![3.0; 20];
        heights[3] = -1.0;
        heights[4] = -1.0;
        heights[9] = -1.0;
        assert_eq!(
            classify_water_cells(5, 4, 0.0, &heights, &[]).unwrap()[9],
            MARINE
        );
    }

    #[test]
    fn preserves_double_precision_sea_threshold() {
        assert_eq!(
            classify_water_cells(1, 1, 1.0 + f64::EPSILON, &[1.0], &[]).unwrap(),
            vec![MARINE]
        );
        assert_eq!(
            classify_water_cells(1, 1, 1.0, &[1.0], &[]).unwrap(),
            vec![0]
        );
    }

    #[test]
    fn rejects_invalid_inputs() {
        assert!(classify_water_cells(0, 1, 0.0, &[], &[]).is_err());
        assert!(classify_water_cells(4097, 1, 0.0, &[], &[]).is_err());
        assert!(classify_water_cells(2, 2, 0.0, &[0.0], &[]).is_err());
        assert!(classify_water_cells(1, 1, f64::NAN, &[0.0], &[]).is_err());
        assert!(classify_water_cells(1, 1, 0.0, &[f32::INFINITY], &[]).is_err());
        assert!(classify_water_cells(1, 1, 0.0, &[0.0], &[1]).is_err());
        assert!(classify_water_cells(1, 1, 0.0, &[0.0], &[0, 0, 0]).is_err());
    }
}
