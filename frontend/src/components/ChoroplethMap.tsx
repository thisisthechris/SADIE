import React, { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import maplibregl from "maplibre-gl";
import { PostcodeAggregatesResponse, PostcodeDistrictGeoJSON } from "../lib/types";
import { useFilters } from "../lib/filters";

interface ChoroplethMapProps {
  /** Optional CSS classes */
  className?: string;
}

/**
 * ChoroplethMap: Visualizes postcode-district interaction counts using colour saturation.
 * Loads GeoJSON boundaries and backend aggregates, colors polygons by bin.
 */
export const ChoroplethMap: React.FC<ChoroplethMapProps> = ({
  className = "",
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const { org } = useFilters();

  // Fetch postcode aggregates
  const params = new URLSearchParams();
  if (org) params.append("org", String(org));

  const { data: aggregates } = useQuery<PostcodeAggregatesResponse>({
    queryKey: ["stats", "postcode-aggregates", org],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/stats/postcode-aggregates/?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch postcode aggregates");
      return res.json();
    },
  });

  // Fetch GeoJSON from public/data
  const { data: geojson } = useQuery<PostcodeDistrictGeoJSON>({
    queryKey: ["geojson", "pl-postcode-districts"],
    queryFn: async () => {
      // In Vite, public/ files are served at root, so /data/ resolves correctly
      const res = await fetch("/data/pl-postcode-districts.geojson");
      if (!res.ok) throw new Error("Failed to fetch GeoJSON");
      return res.json();
    },
  });

  // Initialize map and render choropleth
  useEffect(() => {
    if (!mapContainer.current) return;

    // Initialize map if not already done
    if (!map.current) {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: "https://demotiles.maplibre.org/style.json",
        center: [-4.14, 50.36],
        zoom: 11,
        attributionControl: false,
      });
    }

    // Wait for both GeoJSON and aggregates to load
    if (!geojson || !aggregates) return;

    // Wait for style to load before adding sources/layers
    const handleStyleLoad = () => {
      // Build lookup map from aggregates
      const areaToCount: Record<string, number> = {};
      aggregates.by_area.forEach((row) => {
        areaToCount[row.area] = row.total;
      });

      // Find color bins
      const counts = Object.values(areaToCount);
      const maxCount = Math.max(...counts, 1);
      const minCount = Math.min(...counts, 0);

      // Function to get colour based on count (saturation scale)
      const getColour = (count: number): string => {
        if (count === 0) return "rgba(200, 200, 200, 0.2)"; // Light gray for zero
        const normalized = (count - minCount) / (maxCount - minCount);
        // Gradient from light blue to dark blue
        const r = Math.round(59 + (0 - 59) * normalized); // 59 to 0
        const g = Math.round(130 + (0 - 130) * normalized); // 130 to 0
        const b = Math.round(246 + (0 - 246) * normalized); // 246 to 0
        return `rgba(${r}, ${g}, ${b}, 0.7)`;
      };

      // Add GeoJSON source if not already added
      if (!map.current!.getSource("postcode-districts")) {
        // Enhance GeoJSON with colours
        const enhancedGeoJSON = {
          ...geojson,
          features: geojson.features.map((feature) => ({
            ...feature,
            properties: {
              ...feature.properties,
              count:
                areaToCount[feature.properties.district] ||
                0,
              color: getColour(
                areaToCount[feature.properties.district] || 0
              ),
            },
          })),
        };

        map.current!.addSource("postcode-districts", {
          type: "geojson",
          data: enhancedGeoJSON as any,
        });

        // Add fill layer
        map.current!.addLayer({
          id: "postcode-fill",
          type: "fill",
          source: "postcode-districts",
          paint: {
            "fill-color": ["get", "color"],
            "fill-opacity": 0.7,
          },
        });

        // Add line layer for borders
        map.current!.addLayer({
          id: "postcode-line",
          type: "line",
          source: "postcode-districts",
          paint: {
            "line-color": "#333",
            "line-width": 1,
            "line-opacity": 0.8,
          },
        });

        // Add hover effect
        map.current!.on("mousemove", "postcode-fill", () => {
          map.current!.getCanvas().style.cursor = "pointer";
        });
        map.current!.on("mouseleave", "postcode-fill", () => {
          map.current!.getCanvas().style.cursor = "";
        });

        // Add popup on click
        map.current!.on("click", "postcode-fill", (e) => {
          const props = (e.features?.[0]?.properties || {}) as any;
          new maplibregl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(
              `<strong>${props.district}</strong><br/>${props.name}<br/>Interactions: ${props.count || 0}`
            )
            .addTo(map.current!);
        });
      }
    };

    // Check if style is already loaded
    if (map.current.isStyleLoaded()) {
      handleStyleLoad();
    } else {
      map.current.on("style.load", handleStyleLoad);
    }

    return () => {
      if (map.current) {
        map.current.off("style.load", handleStyleLoad);
      }
    };
  }, [geojson, aggregates]);

  return (
    <div className={`${className}`}>
      <div ref={mapContainer} className="w-full h-96 rounded-lg" />
      <div className="mt-4 p-4 bg-white border border-gray-200 rounded-lg">
        <div className="text-sm text-gray-600">
          <p className="font-semibold mb-2">Legend</p>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-4" style={{ backgroundColor: "rgba(59, 130, 246, 0.7)" }} />
            <span>High interactions</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4" style={{ backgroundColor: "rgba(200, 200, 200, 0.2)" }} />
            <span>No interactions</span>
          </div>
        </div>
      </div>
    </div>
  );
};
