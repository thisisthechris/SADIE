import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFilters } from "../lib/filters";
import { OrgRef, Paginated } from "../lib/types";

interface ViewSwitcherProps {
  /** Optional CSS classes */
  className?: string;
}

/**
 * ViewSwitcher: Toggle between city-wide view and org-specific view.
 * Displays a dropdown for org selection and a "View All" button for city-wide view.
 */
export const ViewSwitcher: React.FC<ViewSwitcherProps> = ({ className = "" }) => {
  const { org, set } = useFilters();
  const [isOpen, setIsOpen] = useState(false);

  // Fetch organisations list for dropdown
  const { data: orgsData } = useQuery<Paginated<OrgRef>>({
    queryKey: ["organisations"],
    queryFn: async () => {
      const res = await fetch("/api/organisations/?limit=100");
      if (!res.ok) throw new Error("Failed to fetch organisations");
      return res.json();
    },
  });

  const organisations = orgsData?.results || [];

  // Get current org name
  const currentOrgName =
    organisations.find((o) => o.id === Number(org))?.name || "City (all)";

  return (
    <div className={`flex gap-3 items-center ${className}`}>
      {/* Org dropdown */}
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          {currentOrgName} ▼
        </button>

        {/* Dropdown menu */}
        {isOpen && (
          <div className="absolute top-full mt-1 left-0 bg-white border border-gray-300 rounded-lg shadow-lg z-50 min-w-48">
            {organisations.length > 0 && (
              <div className="max-h-60 overflow-y-auto">
                {organisations.map((org_item) => (
                  <button
                    key={org_item.id}
                    onClick={() => {
                      set({ org: String(org_item.id) });
                      setIsOpen(false);
                    }}
                    className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                      org === String(org_item.id)
                        ? "bg-blue-50 text-blue-700 font-semibold"
                        : "text-gray-700"
                    }`}
                  >
                    {org_item.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* View All button */}
      <button
        onClick={() => {
          set({ org: "" });
          setIsOpen(false);
        }}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          !org
            ? "bg-blue-600 text-white"
            : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
        }`}
      >
        View All
      </button>
    </div>
  );
};
