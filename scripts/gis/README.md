# GIS data assembly

Reproducible pipeline for the map layers used by the postcode-area **Pathway
Map** (`/insights/postcode-areas`). Generated GeoJSON is committed to
`frontend/public/data/` and loaded by the frontend at runtime.

| Layer | Output file | Builder |
|-------|-------------|---------|
| PL postcode-district boundaries | `frontend/public/data/pl-postcode-districts.geojson` | `build_postcode_boundaries.py` |
| Plymouth transport corridors | `frontend/public/data/plymouth-pt-corridors.geojson` | `build_pt_corridors.py` |

## Prerequisites

```bash
pip install -r requirements-dev.txt   # geopandas, shapely, requests
```

## 1. Postcode-district boundaries

By default the builder downloads the OSM-derived, ODbL-licensed district
polygons for the `PL` area (no manual download needed):

```bash
python scripts/gis/build_postcode_boundaries.py
```

To build from a local Open Door Logistics **Districts** shapefile instead
(<https://www.opendoorlogistics.com/data/>):

```bash
python scripts/gis/build_postcode_boundaries.py \
  --source /path/to/Districts.shp --tolerance 0.0005
```

Filters to the `PL` area, reprojects to EPSG:4326, rounds/simplifies, and writes
the GeoJSON. Feature properties: `district`, `name`.

## 2. Transport corridors (bus / rail / ferry / park & ride)

Pulled live from the OpenStreetMap Overpass API (no download needed):

```bash
python scripts/gis/build_pt_corridors.py
```

Routes become `(Multi)LineString` features (`mode` = `bus` | `rail` | `ferry`);
park & ride sites become `Point` features (`mode` = `park_ride`). Adjust the
extent with `--bbox SOUTH WEST NORTH EAST`.

## Licensing & attribution (required)

Both datasets are **© their providers under the Open Database License (ODbL)**
and must be attributed wherever the map is published:

- Postcode boundaries: OSM-derived district polygons from
  `missinglink/uk-postcode-polygons` (or Open Door Logistics if using
  `--source`). © OpenStreetMap contributors / Open Door Logistics, ODbL.
- Transport corridors: © OpenStreetMap contributors, ODbL
  (<https://www.openstreetmap.org/copyright>).

## Roadmap (later phases)

These layers are static GeoJSON for now. Planned follow-up:

- Serve boundaries + corridors from PostGIS via DRF-GIS endpoints
  (`/api/analytics/boundaries/`, `/api/analytics/pt-corridors/`).
- k-anonymity aggregation on boundary geometries.
- GTFS (Bus Open Data Service) for schedules / frequencies.
