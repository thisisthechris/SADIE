"""Geocoding utilities for postcodes using postcodes.io API."""

import logging
from typing import Optional

import requests

from .models import PostcodeGeo

logger = logging.getLogger(__name__)

POSTCODES_IO_BULK_URL = "https://api.postcodes.io/postcodes"
POSTCODES_IO_LOOKUP_URL = "https://api.postcodes.io/postcodes/"

# Cluster privacy settings (tunable)
DEFAULT_CLUSTER_RADIUS_METERS = 400  # ~0.25 miles / 400m cell
DEFAULT_MIN_POSTCODES_PER_CLUSTER = 3  # k-anonymity threshold
DEFAULT_MIN_INTERACTIONS_PER_CLUSTER = 5  # suppress very sparse clusters

# Fallback centroids for Plymouth-area postcode districts (LNG, LAT).
# Used when API can't geocode partial postcodes (sectors/outcodes).
# Mirrors existing POSTCODE_CENTROIDS in viz_views.py.
OUTCODE_CENTROIDS = {
    "PL1": (-4.1427, 50.3714),
    "PL2": (-4.1620, 50.3680),
    "PL3": (-4.1520, 50.3830),
    "PL4": (-4.1300, 50.3760),
    "PL5": (-4.1700, 50.3950),
    "PL6": (-4.1350, 50.4050),
    "PL7": (-4.0850, 50.3850),
    "PL8": (-4.0650, 50.3480),
    "PL9": (-4.0900, 50.3580),
    "PL10": (-4.2050, 50.3650),
    "PL11": (-4.2200, 50.3620),
    "PL12": (-4.2000, 50.3850),
    "PL13": (-4.4700, 50.3600),
    "PL14": (-4.3800, 50.4500),
    "PL15": (-4.3500, 50.5400),
    "PL17": (-5.0730, 50.2180),   # Penzance area
    "PL18": (-4.7600, 50.3350),   # St Austell area
    "PL19": (-4.1000, 50.4200),   # Mid-Devon area
    "PL20": (-4.0800, 50.5100),
    "PL21": (-3.9600, 50.3870),
    "TQ3": (-3.5900, 50.4500),    # Totnes area
    "TQ7": (-3.7600, 50.5300),    # East Devon/Torquay area
    "EX8": (-3.9000, 50.6200),    # North Devon
}


def normalize_postcode(postcode: str) -> str:
    """
    Normalize a UK postcode: strip whitespace, uppercase, ensure single space.
    
    Examples:
      'PL4 0AB' → 'PL4 0AB'
      'PL40AB'  → 'PL4 0AB'
      'pl4 0ab' → 'PL4 0AB'
      'PL4'     → 'PL4' (outward code only)
      'PL4 0'   → 'PL4 0' (sector)
    """
    if not postcode or not isinstance(postcode, str):
        return ""
    
    pc = postcode.strip().upper()
    
    # If it looks like a full postcode without space (7 chars), insert space before last 3
    # UK postcodes are: 1-2 letters + 0-1 digit + 0-1 letter + space + 1 digit + 2 letters
    # Full format = max 7 chars before normalization: AN/ANN/AAN/AANN [SPACE] N/AN/NAA
    if len(pc) == 7 and ' ' not in pc:
        # Insert space before last 3 chars
        pc = f"{pc[:-3]} {pc[-3:]}"
    elif len(pc) == 5 and ' ' not in pc and not pc[-1].isdigit():
        # E.g. 'PL45AB' (missing space)
        pc = f"{pc[:-2]} {pc[-2:]}"
    
    # Normalize multiple spaces to single
    pc = ' '.join(pc.split())
    
    return pc


def _extract_outcode(postcode: str) -> str:
    """
    Extract outward code from a postcode.
    
    Examples:
      'PL4 7' → 'PL4'
      'PL1 4AP' → 'PL1'
      'PL21' → 'PL21'
    """
    pc = postcode.strip().upper()
    if ' ' in pc:
        return pc.split()[0]
    # For codes without space, return first 2-3 chars (outcode is 1-3 chars + digits)
    # Most UK outcodes are 2-3 chars + 0-2 digits, e.g., 'PL4', 'SW1', 'M1', 'B33'
    # If we have 'PL21' (5 chars), extract 'PL2' or 'PL21'?
    # postcodes.io format is: [2-4 letters][0-2 digits][optional space][1 digit][2 letters]
    # Outcode = [2-4 letters][0-2 digits], so:
    i = 0
    while i < len(pc) and pc[i].isalpha():
        i += 1
    while i < len(pc) and pc[i].isdigit():
        i += 1
    return pc[:i] if i > 0 else pc


def geocode_postcode_bulk(postcodes: list[str], skip_cached: bool = True) -> dict[str, tuple[float, float] | None]:
    """
    Bulk geocode postcodes using postcodes.io API with fallback to hardcoded centroids.
    
    Strategy:
    1. For full postcodes (7 chars like 'PL4 0AB'), try API first
    2. If API fails or returns null, fall back to outcode centroids
    3. Cache all results to avoid retrying
    
    Args:
        postcodes: list of postcodes to geocode (auto-normalized).
        skip_cached: if True, skip postcodes already in PostcodeGeo (status=success).
    
    Returns:
        dict mapping postcode → (lat, lng) or None on failure.
    
    Rate limits: up to 100 postcodes per request, 3000 queries/hour free tier.
    """
    if not postcodes:
        return {}
    
    # Normalize all
    normalized = [normalize_postcode(p) for p in postcodes]
    normalized = [p for p in normalized if p]  # filter empty
    
    if not normalized:
        return {}
    
    # Skip cached successes if requested
    to_geocode_postcodes = normalized
    if skip_cached:
        cached = PostcodeGeo.objects.filter(postcode__in=normalized, status="success").values_list('postcode', flat=True)
        cached_set = set(cached)
        to_geocode_postcodes = [p for p in normalized if p not in cached_set]
    
    if not to_geocode_postcodes:
        logger.debug("All %d postcodes already cached", len(normalized))
        # Return cached results
        cached_geos = PostcodeGeo.objects.filter(postcode__in=normalized, status="success")
        return {g.postcode: (g.latitude, g.longitude) if g.latitude is not None else None for g in cached_geos}
    
    result = {}
    
    # Separate full vs partial postcodes
    postcodes_for_api = []  # Full postcodes to send to API
    postcodes_for_fallback = []  # Partial postcodes to use fallback centroids
    
    for pc in to_geocode_postcodes:
        if len(pc) == 7 and ' ' in pc:  # Full postcode: e.g., 'PL4 0AB'
            postcodes_for_api.append(pc)
        else:  # Partial: sector 'PL4 7' or outcode 'PL21'
            postcodes_for_fallback.append(pc)
    
    logger.info(
        "Geocoding %d postcodes: %d via API, %d via fallback centroids",
        len(to_geocode_postcodes),
        len(postcodes_for_api),
        len(postcodes_for_fallback),
    )
    
    # Geocode full postcodes via API
    api_failed = []  # postcodes that failed API lookup
    for i in range(0, len(postcodes_for_api), 100):
        chunk = postcodes_for_api[i : i + 100]
        try:
            resp = requests.post(
                POSTCODES_IO_BULK_URL,
                json={"postcodes": chunk},
                timeout=10,
            )
            if resp.status_code != 200:
                logger.warning("postcodes.io bulk returned %s", resp.status_code)
                api_failed.extend(chunk)
                continue
            
            data = resp.json()
            if not isinstance(data.get("result"), list):
                logger.warning("Unexpected postcodes.io response: %s", data)
                api_failed.extend(chunk)
                continue
            
            # Process results
            for item in data["result"]:
                pc = item.get("query", "").strip().upper()
                result_data = item.get("result")
                
                if result_data and result_data.get("latitude") is not None:
                    lat = float(result_data["latitude"])
                    lng = float(result_data["longitude"])
                    result[pc] = (lat, lng)
                    PostcodeGeo.objects.update_or_create(
                        postcode=pc,
                        defaults={
                            "latitude": lat,
                            "longitude": lng,
                            "status": "success",
                            "geocoded_at": __import__("django.utils.timezone", fromlist=["now"]).now(),
                        },
                    )
                    logger.info("Geocoded '%s' (API) → (%.5f, %.5f)", pc, lat, lng)
                else:
                    # API returned null, try fallback
                    api_failed.append(pc)
        except requests.RequestException as exc:
            logger.warning("postcodes.io bulk request failed: %s", exc)
            api_failed.extend(chunk)
    
    # Add API failures to fallback list
    postcodes_for_fallback.extend(api_failed)
    
    # Handle postcodes via fallback centroids
    for pc in postcodes_for_fallback:
        oc = _extract_outcode(pc)
        if oc in OUTCODE_CENTROIDS:
            lng, lat = OUTCODE_CENTROIDS[oc]
            result[pc] = (lat, lng)
            PostcodeGeo.objects.update_or_create(
                postcode=pc,
                defaults={
                    "latitude": lat,
                    "longitude": lng,
                    "status": "success",
                    "geocoded_at": __import__("django.utils.timezone", fromlist=["now"]).now(),
                },
            )
            logger.info("Geocoded '%s' (fallback via outcode %s) → (%.5f, %.5f)", pc, oc, lat, lng)
        else:
            result[pc] = None
            PostcodeGeo.objects.update_or_create(
                postcode=pc,
                defaults={"status": "failed"},
            )
            logger.warning("No geocoding available for '%s' (outcode %s not in centroids)", pc, oc)
    
    return result


def cluster_points(
    points: list[dict],
    radius_meters: float = DEFAULT_CLUSTER_RADIUS_METERS,
    min_postcodes: int = DEFAULT_MIN_POSTCODES_PER_CLUSTER,
    min_interactions: int = DEFAULT_MIN_INTERACTIONS_PER_CLUSTER,
) -> list[dict]:
    """
    Cluster nearby geocoded postcode points for privacy preservation.
    
    Uses a grid-based approach: snap each point to a grid cell, then aggregate
    within cells. Suppresses clusters with fewer distinct postcodes or
    interactions than thresholds (k-anonymity).
    
    Args:
        points: list of dicts with keys: lat, lng, postcode, total (interaction count).
        radius_meters: approximate cell size in meters. Default ~400m ≈ 0.0036°.
        min_postcodes: suppress clusters with fewer than this many distinct postcodes.
        min_interactions: suppress clusters with fewer total interactions.
    
    Returns:
        list of clustered points, each with keys:
          lng, lat, total, postcode_count, postcodes (list of distinct codes)
    """
    if not points:
        return []
    
    # Simple grid-based clustering
    # 1 degree latitude ≈ 111 km, so convert radius_meters to degrees
    cell_size_deg = radius_meters / 111000
    
    # Grid map: (cell_x, cell_y) → {postcodes, total_interactions}
    grid: dict[tuple[int, int], dict] = {}
    
    for point in points:
        lat = point.get("lat")
        lng = point.get("lng")
        postcode = point.get("postcode", "unknown")
        total = point.get("total", 0)
        
        if lat is None or lng is None:
            logger.warning("Point missing lat/lng: %s", point)
            continue
        
        # Snap to grid
        cell_x = int(lng / cell_size_deg)
        cell_y = int(lat / cell_size_deg)
        key = (cell_x, cell_y)
        
        if key not in grid:
            grid[key] = {"postcodes": set(), "total": 0, "lat_sum": 0, "lng_sum": 0, "count": 0}
        
        grid[key]["postcodes"].add(postcode)
        grid[key]["total"] += total
        grid[key]["lat_sum"] += lat
        grid[key]["lng_sum"] += lng
        grid[key]["count"] += 1
    
    # Build output, apply privacy filters
    clustered = []
    for (cell_x, cell_y), cell_data in grid.items():
        postcode_count = len(cell_data["postcodes"])
        total_interactions = cell_data["total"]
        
        # Apply privacy thresholds
        if postcode_count < min_postcodes or total_interactions < min_interactions:
            logger.debug(
                "Suppressing cluster (cell %s, %s): %d postcodes, %d interactions (min %d, %d)",
                cell_x, cell_y, postcode_count, total_interactions, min_postcodes, min_interactions,
            )
            continue
        
        # Compute cluster centroid
        avg_lat = cell_data["lat_sum"] / cell_data["count"]
        avg_lng = cell_data["lng_sum"] / cell_data["count"]
        
        clustered.append({
            "lng": avg_lng,
            "lat": avg_lat,
            "total": total_interactions,
            "postcode_count": postcode_count,
            "postcodes": sorted(list(cell_data["postcodes"])),
        })
    
    return sorted(clustered, key=lambda x: x["total"], reverse=True)
