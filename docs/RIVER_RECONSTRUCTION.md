# River Reconstruction

The scientific routing graph remains authoritative. Display reconstruction does not reroute receivers, excavate the DEM, or modify discharge and hydraulic arrays.

## Cross Sections and Longitudinal Profile

Node stages use bed elevation plus the existing estimated channel depth, bounded below by sea level. Interior display stages interpolate between reach endpoints rather than following every terrain bump. Each section is horizontal across the channel.

The modeled channel width is an upper display bound. Bank searches stop at the first dry terrain sample on either side and refine that crossing by bisection. This is a sampled display intersection, not a surveyed flood extent; barriers narrower than the sampling interval can be missed.

A smoothed centerline that intersects higher ground is replaced by a straight reach between its endpoints. If that also conflicts with the terrain, the reach is omitted from the water mesh and counted as `terrainBlockedEdges`. Such gaps identify incompatible terrain/routing/stage estimates; they are not interpreted as underground flow. Junctions retain shared water-surface connections for accepted reaches.

## Diagnostics

`river3DStats` on the renderer and `window.__geoLabRiver3DStats` expose clipped sections, straightened reaches, omitted terrain conflicts and stage/energy rises. `risingWaterSurfaceEdges` and `risingHeadEdges` are distinct: total head includes velocity head, using alpha = 1. A downstream stage rise alone need not imply increasing total energy.

## Physical Limits

Channel depths still use finite-width rectangular Manning normal-depth estimates with estimated roughness, width and design discharge. They are not a coupled backwater solution. Neither junction momentum losses, tidal forcing, flood-wave propagation nor surveyed bathymetry are solved by this display reconstruction. An energy-rise diagnostic identifies an inconsistency to investigate; it does not resolve it.

The distinction follows the US Army Corps of Engineers descriptions of [uniform-flow calculations](https://www.hec.usace.army.mil/confluence/rasdocs/ras1dtechref/6.6/stable-channel-design-functions/uniform-flow-computations) and [energy-based water-surface profiles](https://www.hec.usace.army.mil/confluence/rasdocs/ras1dtechref/6.3/theoretical-basis-for-one-dimensional-and-two-dimensional-hydrodynamic-calculations/1d-steady-flow-water-surface-profiles/equations-for-basic-profile-calculations). GeoLab does not implement the full HEC-RAS standard-step solver.
