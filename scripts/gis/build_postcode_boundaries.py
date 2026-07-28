#!/usr/bin/env python3
"""Build PL* postcode-district boundaries GeoJSON for the SADIE frontend.

Part of the GIS data assembly for the postcode-area pathway map. Produces
``frontend/public/data/pl-postcode-districts.geojson`` with one polygon per
Plymouth-area (``PL``) postcode district, in WGS84 (EPSG:4326), with
``properties.district`` (e.g. ``PL4``) and ``properties.name`` (human label).

Data sources
------------
Default: the OSM-derived, ODbL-licensed district polygons from
``missinglink/uk-postcode-polygons`` (downloaded per area, e.g. ``PL.geojson``).

Alternative: an Open Door Logistics (ODL) "Districts" shapefile/GeoPackage via
``--source path.shp`` (requires geopandas; also ODbL).

Attribution is required — see ``scripts/gis/README.md``.

Usage
-----
    # Download + transform the PL area (default):
    python scripts/gis/build_postcode_boundaries.py

    # From a local ODL shapefile instead:
    python scripts/gis/build_postcode_boundaries.py \
        --source /path/to/Districts.shp --tolerance 0.0005

Dependencies: requests (always); geopandas + shapely (only for shapefile input
or when --tolerance > 0). See requirements-dev.txt.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

MISSINGLINK_URL = "https://raw.githubusercontent.com/missinglink/uk-postcode-polygons/master/geojson/{area}.geojson"

DEFAULT_OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "data" / "pl-postcode-districts.geojson"

# Human-readable names for the Plymouth-area districts (best-effort; extend as
# needed). Districts without an entry fall back to the bare code.
DISTRICT_NAMES: dict[str, str] = {
    "PL1": "Plymouth City Centre",
    "PL2": "Keyham & Ford",
    "PL3": "Peverell & Hartley",
    "PL4": "St Jude's & Mount Gould",
    "PL5": "Honicknowle & Crownhill",
    "PL6": "Estover & Derriford",
    "PL7": "Plympton",
    "PL8": "Yealmpton & Newton Ferrers",
    "PL9": "Plymstock",
    "PL10": "Millbrook & Kingsand",
    "PL11": "Torpoint",
    "PL12": "Saltash",
    "PL13": "Looe",
    "PL14": "Liskeard",
    "PL15": "Launceston",
    "PL16": "Lifton",
    "PL17": "Callington",
    "PL18": "Gunnislake",
    "PL19": "Tavistock",
    "PL20": "Yelverton",
    "PL21": "Ivybridge",
    "PL22": "Lostwithiel",
    "PL23": "Fowey",
    "PL24": "Par",
    "PL25": "St Austell",
    "PL26": "St Austell (rural)",
    "PL27": "Wadebridge",
    "PL28": "Padstow",
    "PL29": "Port Isaac",
    "PL30": "Bodmin (rural)",
    "PL31": "Bodmin",
    "PL32": "Camelford",
    "PL33": "Delabole",
    "PL34": "Tintagel",
    "PL35": "Boscastle",
}

# District-code property candidates across the supported schemas.
_CODE_KEYS = ("district", "name", "Name", "pc_district", "code")


def _code_from_props(props: dict) -> str | None:
    for key in _CODE_KEYS:
        val = props.get(key)
        if val:
            return str(val).upper().strip()
    return None


def _round_ring(ring: list) -> list:
    return [[round(x, 5), round(y, 5)] for x, y in ring]


def _round_geometry(geom: dict) -> dict:
    """Round coordinates to 5 dp (~1m) to keep the payload small."""
    gtype = geom["type"]
    coords = geom["coordinates"]
    if gtype == "Polygon":
        coords = [_round_ring(r) for r in coords]
    elif gtype == "MultiPolygon":
        coords = [[_round_ring(r) for r in poly] for poly in coords]
    return {"type": gtype, "coordinates": coords}


def _load_geojson(source: Path | None, area: str) -> dict:
    if source and source.suffix.lower() in {".geojson", ".json"}:
        return json.loads(source.read_text(encoding="utf-8"))
    if source is None:
        import requests  # noqa: WPS433

        url = MISSINGLINK_URL.format(area=area)
        print(f"Downloading {url} …")
        resp = requests.get(url, headers={"User-Agent": "SADIE-GIS/1.0"}, timeout=60)
        resp.raise_for_status()
        return resp.json()
    # Shapefile / GeoPackage path via geopandas.
    import geopandas as gpd  # noqa: WPS433

    print(f"Reading {source} …")
    gdf = gpd.read_file(source)
    if gdf.crs is not None and gdf.crs.to_epsg() != 4326:
        gdf = gdf.to_crs(epsg=4326)
    return json.loads(gdf.to_json())


def _natural_key(code: str) -> tuple[str, int]:
    m = re.match(r"^([A-Z]+)(\d+)$", code)
    return (m.group(1), int(m.group(2))) if m else (code, 0)


def build(source: Path | None, area: str, tolerance: float, out: Path) -> None:
    area = area.upper()
    fc = _load_geojson(source, area)

    pattern = re.compile(rf"^{area}\d")
    features: list[dict] = []
    for ft in fc.get("features", []):
        props = ft.get("properties") or {}
        code = _code_from_props(props)
        if not code or not pattern.match(code):
            continue
        geom = ft.get("geometry")
        if not geom or geom.get("type") not in {"Polygon", "MultiPolygon"}:
            continue

        if tolerance > 0:
            try:
                from shapely.geometry import mapping, shape  # noqa: WPS433

                geom = mapping(shape(geom).simplify(tolerance, preserve_topology=True))
            except ImportError:
                print(
                    "  shapely not installed — skipping simplification.",
                    file=sys.stderr,
                )

        features.append(
            {
                "type": "Feature",
                "properties": {
                    "district": code,
                    "name": DISTRICT_NAMES.get(code, code),
                },
                "geometry": _round_geometry(geom),
            }
        )

    if not features:
        raise SystemExit(f"No districts matched area prefix {area!r}.")

    features.sort(key=lambda f: _natural_key(f["properties"]["district"]))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}),
        encoding="utf-8",
    )

    size_kb = out.stat().st_size / 1024
    print(f"Wrote {len(features)} {area} districts to {out} ({size_kb:.0f} KB)")
    if size_kb > 2048:
        print(
            "  Warning: file >2MB — raise --tolerance to simplify further.",
            file=sys.stderr,
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=None,
        help="Local GeoJSON or ODL shapefile. Omit to download the area GeoJSON.",
    )
    parser.add_argument("--area", default="PL", help="Postcode area prefix to keep (default: PL).")
    parser.add_argument(
        "--tolerance",
        type=float,
        default=0.0,
        help="Simplification tolerance in degrees (~0.0005≈50m). 0 disables.",
    )
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="Output GeoJSON path.")
    args = parser.parse_args()
    build(args.source, args.area, args.tolerance, args.out)


if __name__ == "__main__":
    main()
