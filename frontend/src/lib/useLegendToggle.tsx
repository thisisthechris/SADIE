import { useCallback, useState } from "react";

interface LegendClickPayload {
  dataKey?: string | number | ((obj: unknown) => unknown);
  value?: unknown;
}

/**
 * useLegendToggle: click-to-toggle behaviour for recharts Legend items.
 * Wire `onLegendClick` to <Legend onClick={...}>, pass `isHidden(key)` to
 * each series' `hide` prop, and spread `legendFormatter` into `formatter`
 * so hidden entries render faded/struck-through.
 */
export function useLegendToggle() {
  const [hidden, setHidden] = useState<Record<string, boolean>>({});

  const onLegendClick = useCallback((entry: LegendClickPayload) => {
    const key = entry?.dataKey;
    if (key == null || typeof key === "function") return;
    const k = String(key);
    setHidden((prev) => ({ ...prev, [k]: !prev[k] }));
  }, []);

  const isHidden = useCallback((key: string) => !!hidden[key], [hidden]);

  const legendFormatter = useCallback(
    (value: string, entry: LegendClickPayload) => {
      const key = entry?.dataKey != null ? String(entry.dataKey) : String(value);
      const off = !!hidden[key];
      return (
        <span
          style={{
            opacity: off ? 0.4 : 1,
            textDecoration: off ? "line-through" : "none",
          }}
        >
          {value}
        </span>
      );
    },
    [hidden]
  );

  return { isHidden, onLegendClick, legendFormatter };
}
