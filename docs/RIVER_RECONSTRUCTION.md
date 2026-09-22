# River Reconstruction

The scientific routing graph remains authoritative. Display reconstruction does not reroute receivers, excavate the DEM, or modify discharge and hydraulic arrays.

## Terrain Agreement

Each terrain quad uses the diagonal whose endpoint elevations have the smaller sum; ties retain the original top-right/bottom-left diagonal. This lower-saddle reconstruction avoids an artificial ridge across low diagonal drainage vertices. It changes interpolation between DEM samples, not measured or modeled vertex heights. It is a display assumption, not evidence of subgrid channels or erosion.

The terrain index buffer, river height sampling, placement sampling and camera collision share this rule. Dirty terrain tiles update their indices as well as positions and normals. The sea surface borrows these same terrain buffers, so its shoreline follows the reconstructed terrain.

## Cross Sections and Longitudinal Profile

Node stages use bed elevation plus the existing estimated channel depth, bounded below by sea level. Interior display stages interpolate between reach endpoints rather than following every terrain bump. Each section is horizontal across the channel.

The modeled channel width is an upper display bound. Bank searches stop at the first dry terrain sample on either side and refine that crossing by bisection. This is a sampled display intersection, not a surveyed flood extent; barriers narrower than the sampling interval can be missed.

Optical depth at each water vertex is the difference between its water stage and the reconstructed terrain, rather than a single centerline depth copied across the entire channel. Hydraulic depth and discharge arrays remain unchanged.

A smoothed centerline that intersects higher ground is replaced by a straight reach between its endpoints. If that also conflicts with the terrain, the reach is omitted from the water mesh and counted as `terrainBlockedEdges`. Such gaps identify incompatible terrain/routing/stage estimates; they are not interpreted as underground flow. Junctions retain shared water-surface connections for accepted reaches.

## Sea Outlets

Receiving sea cells have no channel hydraulic solution. Their zero-filled width must not narrow the mouth to a needle: the display inherits the dominant incoming width. Coastal reaches explicitly intersect the sampled coastline, meet the prescribed sea level there, and fade into the sea within approximately two channel widths. The visible blend is independent of DEM cell spacing. Dry inflows remain dry.

This is a geometric boundary transition, not a solution for estuary mixing or backwater. A prescribed receiving-water level is a boundary condition; calculating its upstream influence requires a hydraulic solver, as distinguished in the USACE [steady-flow data requirements](https://www.hec.usace.army.mil/confluence/rasdocs/ras1dtechref/6.2/basic-data-requirements/steady-flow-data).

## Diagnostics

`river3DStats` on the renderer and `window.__geoLabRiver3DStats` expose clipped sections, straightened reaches, omitted terrain conflicts, coastal connections and stage/energy rises. `risingWaterSurfaceEdges` and `risingHeadEdges` are distinct: total head includes velocity head, using alpha = 1. A downstream stage rise alone need not imply increasing total energy. Coastal edges are excluded from the head comparison because the receiving sea has no modeled channel velocity.

Regression coverage includes saddle drainage, rendered-triangle/raycast agreement, dirty-tile retriangulation, dry coastal inflow, sea levels above and below zero, optical bank depth, and nine generated cases spanning D8, MFD and D-infinity routing. In the tested 256-grid main-app scene, terrain-blocked reaches decreased from 197 to zero out of 1,862 edges, with 40 coastal connections. This result is specific to the tested scene, not a guarantee for arbitrary imported terrain and flow constraints.

## Physical Limits

Channel depths still use finite-width rectangular Manning normal-depth estimates with estimated roughness, width and design discharge. They are not a coupled backwater solution. Neither junction momentum losses, tidal forcing, flood-wave propagation nor surveyed bathymetry are solved by this display reconstruction. An energy-rise diagnostic identifies an inconsistency to investigate; it does not resolve it.

The distinction follows the US Army Corps of Engineers descriptions of [uniform-flow calculations](https://www.hec.usace.army.mil/confluence/rasdocs/ras1dtechref/6.6/stable-channel-design-functions/uniform-flow-computations) and [energy-based water-surface profiles](https://www.hec.usace.army.mil/confluence/rasdocs/ras1dtechref/6.3/theoretical-basis-for-one-dimensional-and-two-dimensional-hydrodynamic-calculations/1d-steady-flow-water-surface-profiles/equations-for-basic-profile-calculations). GeoLab does not implement the full HEC-RAS standard-step solver.
