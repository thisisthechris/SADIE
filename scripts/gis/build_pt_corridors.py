#!/usr/bin/env python3
"""Build Plymouth public-transport corridors GeoJSON from OpenStreetMap.

Part of the GIS data assembly for the postcode-area pathway map. Queries the
Overpass API for bus / rail / ferry route relations within a Plymouth bounding
box plus park & ride sites, and writes a GeoJSON FeatureCollection to
``frontend/public/data/plymouth-pt-corridors.geojson``.

Feature shapes
--------------
* Routes  -> (Multi)LineString features, ``properties.mode`` in {bus, rail, ferry}
* Park&Ride -> Point features, ``properties.mode == "park_ride"``

Common ``properties``: ``mode``, ``name``, ``ref``, ``operator``, ``osm_id``.

Data source
-----------
OpenStreetMap via the Overpass API. Data is © OpenStreetMap contributors,
licensed under the Open Database License (ODbL). Attribution is required — see
``scripts/gis/README.md``.

Usage
-----
    python scripts/gis/build_pt_corridors.py

Dependencies: requests (see requirements-dev.txt).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Mirrors tried in order if the primary endpoint is unavailable.
OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

# Overpass blocks requests without a descriptive User-Agent.
HTTP_HEADERS = {"User-Agent": "SADIE-GIS/1.0 (postcode-area pathway map)"}

# Plymouth-area bounding box: (south, west, north, east).
DEFAULT_BBOX = (50.30, -4.25, 50.47, -3.95)

DEFAULT_OUT = (
    Path(__file__).resolve().parents[2]
    / "frontend"
    / "public"
    / "data"
    / "plymouth-pt-corridors.geojson"
)

# Normalise OSM route values to the four modes the frontend legend supports.
ROUTE_TO_MODE = {
    "bus": "bus",
    "trolleybus": "bus",
    "minibus": "bus",
    "train": "rail",
    "light_rail": "rail",
    "subway": "rail",
    "tram": "rail",
    "ferry": "ferry",
}


def _build_query(bbox: tuple[float, float, float, float]) -> str:
    s, w, n, e = bbox
    b = f"{s},{w},{n},{e}"
    return f"""
[out:json][timeout:180];
(
  relation["type"="route"]["route"="bus"]({b});
  relation["type"="route"]["route"="trolleybus"]({b});
  relation["type"="route"]["route"="train"]({b});
  relation["type"="route"]["route"="light_rail"]({b});
  relation["type"="route"]["route"="tram"]({b});
  relation["type"="route"]["route"="subway"]({b});
  relation["type"="route"]["route"="ferry"]({b});
  way["route"="ferry"]({b});
);
out geom;
(
  node["amenity"="parking"]["park_ride"]({b});
  way["amenity"="parking"]["park_ride"]({b});
);
out center tags;
"""


# Coordinate precision: 5 dp ~= 1.1m, plenty for corridor overlays and keeps
# the GeoJSON payload small.
def _round(coord: list[float]) -> list[float]:
    return [round(coord[0], 5), round(coord[1], 5)]


def _clip_segment(p0, p1, bbox):
    """Liang-Barsky clip of one segment to the bbox. Returns clipped endpoints
    or None if the segment lies entirely outside."""
    s, w, n, e = bbox
    xmin, xmax, ymin, ymax = w, e, s, n
    x0, y0 = p0
    x1, y1 = p1
    dx, dy = x1 - x0, y1 - y0
    p = (-dx, dx, -dy, dy)
    q = (x0 - xmin, xmax - x0, y0 - ymin, ymax - y0)
    u0, u1 = 0.0, 1.0
    for pi, qi in zip(p, q):
        if pi == 0:
            if qi < 0:
                return None
        else:
            t = qi / pi
            if pi < 0:
                if t > u1:
                    return None
                u0 = max(u0, t)
            else:
                if t < u0:
                    return None
                u1 = min(u1, t)
    return (
        [x0 + u0 * dx, y0 + u0 * dy],
        [x0 + u1 * dx, y0 + u1 * dy],
    )


def _clip_line(coords, bbox):
    """Clip a polyline to the bbox, returning a list of sub-linestrings so that
    long-distance route tails (ferries to Spain, cross-country coaches) are
    trimmed to the Plymouth area."""
    out: list[list[list[float]]] = []
    cur: list[list[float]] = []
    for i in range(len(coords) - 1):
        seg = _clip_segment(coords[i], coords[i + 1], bbox)
        if seg is None:
            if len(cur) >= 2:
                out.append(cur)
            cur = []
            continue
        a, b = _round(seg[0]), _round(seg[1])
        if cur and cur[-1] == a:
            cur.append(b)
        else:
            if len(cur) >= 2:
                out.append(cur)
            cur = [a, b]
    if len(cur) >= 2:
        out.append(cur)
    return out


def _relation_feature(el: dict, bbox) -> dict | None:
    tags = el.get("tags", {})
    mode = ROUTE_TO_MODE.get(tags.get("route", ""))
    if not mode:
        return None
    lines: list[list[list[float]]] = []
    for member in el.get("members", []):
        geom = member.get("geometry")
        if member.get("type") != "way" or not geom:
            continue
        coords = [[pt["lon"], pt["lat"]] for pt in geom]
        if len(coords) >= 2:
            lines.extend(_clip_line(coords, bbox))
    if not lines:
        return None
    name = tags.get("name") or tags.get("ref") or f"{mode} route"
    props = {
        "mode": mode,
        "name": name,
        "ref": tags.get("ref", ""),
        "operator": tags.get("operator", ""),
        "osm_id": el.get("id"),
    }
    if len(lines) == 1:
        geometry = {"type": "LineString", "coordinates": lines[0]}
    else:
        geometry = {"type": "MultiLineString", "coordinates": lines}
    return {"type": "Feature", "properties": props, "geometry": geometry}


def _way_route_feature(el: dict, bbox) -> dict | None:
    """Ferry (and other) routes that are tagged directly on a way."""
    tags = el.get("tags", {})
    mode = ROUTE_TO_MODE.get(tags.get("route", ""))
    geom = el.get("geometry")
    if not mode or not geom:
        return None
    coords = [[pt["lon"], pt["lat"]] for pt in geom]
    lines = _clip_line(coords, bbox) if len(coords) >= 2 else []
    if not lines:
        return None
    name = tags.get("name") or tags.get("ref") or f"{mode} route"
    props = {
        "mode": mode,
        "name": name,
        "ref": tags.get("ref", ""),
        "operator": tags.get("operator", ""),
        "osm_id": el.get("id"),
    }
    if len(lines) == 1:
        geometry = {"type": "LineString", "coordinates": lines[0]}
    else:
        geometry = {"type": "MultiLineString", "coordinates": lines}
    return {"type": "Feature", "properties": props, "geometry": geometry}


def _park_ride_feature(el: dict) -> dict | None:
    tags = el.get("tags", {})
    if tags.get("park_ride", "no") == "no":
        return None
    if el.get("type") == "node":
        lon, lat = el.get("lon"), el.get("lat")
    else:  # way — Overpass returns a center for `out center`
        center = el.get("center", {})
        lon, lat = center.get("lon"), center.get("lat")
    if lon is None or lat is None:
        return None
    name = tags.get("name") or "Park & Ride"
    props = {
        "mode": "park_ride",
        "name": name,
        "ref": tags.get("ref", ""),
        "operator": tags.get("operator", ""),
        "osm_id": el.get("id"),
    }
    return {
        "type": "Feature",
        "properties": props,
        "geometry": {"type": "Point", "coordinates": _round([lon, lat])},
    }


def build(bbox: tuple[float, float, float, float], out: Path) -> None:
    try:
        import requests  # noqa: WPS433
    except ImportError:
        raise SystemExit(
            "requests is required. Install dev deps: pip install -r requirements-dev.txt"
        )

    query = _build_query(bbox)
    print(f"Querying Overpass for Plymouth transport routes (bbox={bbox}) …")
    last_err: Exception | None = None
    elements: list[dict] = []
    for url in OVERPASS_MIRRORS:
        try:
            resp = requests.post(
                url, data={"data": query}, headers=HTTP_HEADERS, timeout=200
            )
            resp.raise_for_status()
            elements = resp.json().get("elements", [])
            print(f"  ok via {url} ({len(elements)} elements)")
            break
        except Exception as err:  # noqa: BLE001 — try the next mirror
            print(f"  {url} failed: {err}", file=sys.stderr)
            last_err = err
    else:
        raise SystemExit(f"All Overpass mirrors failed. Last error: {last_err}")

    features: list[dict] = []
    counts = {"bus": 0, "rail": 0, "ferry": 0, "park_ride": 0}
    for el in elements:
        if el.get("type") == "relation":
            feat = _relation_feature(el, bbox)
        elif el.get("type") == "way" and el.get("tags", {}).get("route"):
            feat = _way_route_feature(el, bbox)
        else:
            feat = _park_ride_feature(el)
        if feat:
            features.append(feat)
            counts[feat["properties"]["mode"]] += 1

    if not features:
        raise SystemExit("Overpass returned no route/park&ride features.")

    fc = {"type": "FeatureCollection", "features": features}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(fc), encoding="utf-8")

    size_kb = out.stat().st_size / 1024
    print(
        f"Wrote {len(features)} features to {out} ({size_kb:.0f} KB): "
        f"bus={counts['bus']} rail={counts['rail']} "
        f"ferry={counts['ferry']} park_ride={counts['park_ride']}"
    )
    if size_kb > 2048:
        print("  Warning: file >2MB — consider tightening the bbox.", file=sys.stderr)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--bbox",
        type=float,
        nargs=4,
        metavar=("SOUTH", "WEST", "NORTH", "EAST"),
        default=list(DEFAULT_BBOX),
        help="Bounding box (default: Plymouth).",
    )
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="Output GeoJSON path.")
    args = parser.parse_args()
    build(tuple(args.bbox), args.out)


if __name__ == "__main__":
    main()
