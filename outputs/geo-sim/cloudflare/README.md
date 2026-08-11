# GeoLab 128 Cloudflare Data Proxy

This optional Worker supports the browser prototype when authoritative data services block direct browser access.

Endpoints:

- `GET /health` returns service status.
- `GET /plan?lat=37.8651&lon=-119.5383&sizeKm=128&startYear=2020&endYear=2024&gageSite=11266500` returns source URLs and field requirements for DEM, soil hydrology, land cover/vegetation, meteorology, and USGS calibration.
- `GET /proxy?url=<encoded source URL>` streams allowed authoritative source responses with CORS headers.
- `GET /tnm/dem-products?lat=37.8651&lon=-119.5383&sizeKm=128` searches USGS TNM products for 3DEP 1 m DEM GeoTIFF candidates, falls back to 1/3 arc-second products, and returns ranked download metadata for DEM import and mosaicking.
- `GET /daymet/grid-sample?lat=37.8651&lon=-119.5383&sizeKm=128&startYear=2020&endYear=2024&grid=3` samples Daymet single-pixel daily weather across the AOI, aggregates precipitation and temperature into a GeoLab meteorology grid, and preserves daily forcing rows for hydrograph calibration diagnostics.
- `GET /osm/infrastructure?lat=37.8651&lon=-119.5383&sizeKm=128&limit=900` queries Overpass for OSM settlements, roads, rail, buildings, landuse, civic amenities, power facilities, reservoirs, dams, and canals, then returns GeoLab-ready infrastructure GeoJSON with `infrastructure_type`, hydrologic feedback fields, and building height/floor metadata.
- `GET /usgs/gages?lat=37.8651&lon=-119.5383&sizeKm=128&start=2020-01-01&end=2024-12-31` searches the USGS Site Service for streamgages with daily discharge (`00060`) in the AOI, ranks candidates by distance, drainage-area metadata, and AOI area screening, and returns direct `/usgs/daily-values` URLs for the selected calibration period.
- `GET /usgs/daily-values?site=11266500&start=2020-01-01&end=2024-12-31` fetches USGS daily mean discharge (`00060`, `00003`) and returns GeoLab-ready calibration JSON with cfs-to-m3/s conversion, site metadata, drainage area where USGS provides it, annual means, and P10/P50/P90 flow-duration summaries.

Allowed upstream hosts:

- `tnmaccess.nationalmap.gov`
- `hydro.nationalmap.gov`
- `daymet.ornl.gov`
- `waterservices.usgs.gov`
- `api.waterdata.usgs.gov`
- `overpass-api.de`

The proxy intentionally does not allow arbitrary hosts. Large source responses are streamed back to the browser instead of being buffered in memory.

The normalized USGS, Daymet, and OSM endpoints intentionally limit each request to bounded date windows, response sizes, or feature counts so the Worker can parse the response safely. They are meant for calibration forcing and screening workflows, not bulk hydrograph, NetCDF, or planet-scale OSM extraction.

The `/plan` response includes `dataRequirements` so a downstream GIS or ETL script knows to prepare fields such as `ksat_mm_hr`, `awc_mm`, `root_depth_m`, `impervious_fraction`, `canopy_height_m`, `lai`, infrastructure feedback fields, and discharge columns before importing into GeoLab.
