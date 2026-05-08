import type { ReportFilter } from "@/types";

/**
 * Filters out report filters that don't have a valid value selected.
 * This prevents sending empty filter criteria to the API.
 */
export const getValidFilters = (filters: ReportFilter[]) => {
  return filters.filter((f) => {
    // Unary operators don't need a value
    if (f.operator === "is_empty" || f.operator === "is_not_empty") return true;

    // Handle null/undefined/empty string
    if (f.value === null || f.value === undefined || f.value === "")
      return false;

    // Handle empty arrays (multi-select)
    if (Array.isArray(f.value) && f.value.length === 0) return false;

    // Handle range objects (between)
    if (typeof f.value === "object" && f.value !== null) {
      const v = f.value as { from?: string; to?: string };
      // For range filters, at least one of from/to should be present
      if (!v.from && !v.to) return false;
    }

    return true;
  });
};
