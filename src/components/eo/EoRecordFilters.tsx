import React from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import { useLocalizedField } from "../../hooks/useLocalizedField";
import type { EoRecordFilter, EoRecordType } from "../../types/eoRecord";

interface EoRecordFiltersProps {
  filters: EoRecordFilter;
  // eslint-disable-next-line no-unused-vars
  onChange: (updated: EoRecordFilter) => void;
  /** Selectable (non-abstract) record types. */
  recordTypes: EoRecordType[];
  /** Hidden when the register is already scoped to one type by its route. */
  showTypeFilter?: boolean;
}

const PRIORITIES = ["normal", "high", "urgent"];

const inputClass =
  "w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none";

export const EoRecordFilters: React.FC<EoRecordFiltersProps> = ({
  filters,
  onChange,
  recordTypes,
  showTypeFilter = true,
}) => {
  const { t } = useTranslation();
  const localize = useLocalizedField();

  // Every filter change resets to page 1, as GoalFilters does.
  const updateFilter = (key: keyof EoRecordFilter, value?: string) => {
    const next: EoRecordFilter = { ...filters, page: 1 };
    if (key === "search") {
      next.search = value || undefined;
    } else {
      // The array-valued filters each hold a single selection in this UI.
      (next as Record<string, unknown>)[key] = value ? [value] : undefined;
    }
    onChange(next);
  };

  const clearFilters = () =>
    onChange({
      page: 1,
      limit: filters.limit,
      record_type_id: filters.record_type_id,
    });

  const typeValue = showTypeFilter ? (filters.record_type_id?.[0] ?? "") : "";
  const priorityValue = filters.priority?.[0] ?? "";

  const hasActiveFilters = !!(
    filters.search ||
    priorityValue ||
    (showTypeFilter && typeValue)
  );

  type ActiveChip = { key: keyof EoRecordFilter; label: string; value: string };
  const activeChips: ActiveChip[] = [];
  if (filters.search) {
    activeChips.push({
      key: "search",
      label: t("common.search"),
      value: filters.search,
    });
  }
  if (showTypeFilter && typeValue) {
    const rt = recordTypes.find((r) => r.id === typeValue);
    activeChips.push({
      key: "record_type_id",
      label: t("eo.filters.recordType", "Type"),
      value: rt
        ? localize(rt as unknown as Record<string, unknown>, "name") || rt.name
        : typeValue,
    });
  }
  if (priorityValue) {
    activeChips.push({
      key: "priority",
      label: t("common.priority"),
      value: t(`eo.priority.${priorityValue}`, priorityValue),
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/80 p-4 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {/* Search */}
        <div className="flex-1 min-w-[220px]">
          <label
            htmlFor="eo-filter-search"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            {t("common.search")}
          </label>
          <div className="relative">
            <Search className="absolute ltr:left-3 rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="eo-filter-search"
              type="text"
              value={filters.search ?? ""}
              onChange={(e) => updateFilter("search", e.target.value)}
              placeholder={t(
                "eo.filters.searchPlaceholder",
                "Reference or subject…",
              )}
              className={`${inputClass} ltr:pl-10 rtl:pr-10`}
            />
          </div>
        </div>

        {/* Record type */}
        {showTypeFilter && (
          <div className="min-w-[200px]">
            <label
              htmlFor="eo-filter-type"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              {t("eo.filters.recordType", "Type")}
            </label>
            <select
              id="eo-filter-type"
              value={typeValue}
              onChange={(e) => updateFilter("record_type_id", e.target.value)}
              className={inputClass}
            >
              <option value="">{t("eo.filters.allTypes", "All types")}</option>
              {recordTypes.map((rt) => (
                <option key={rt.id} value={rt.id}>
                  {localize(rt as unknown as Record<string, unknown>, "name") ||
                    rt.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Priority */}
        <div className="min-w-[150px]">
          <label
            htmlFor="eo-filter-priority"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            {t("common.priority")}
          </label>
          <select
            id="eo-filter-priority"
            value={priorityValue}
            onChange={(e) => updateFilter("priority", e.target.value)}
            className={inputClass}
          >
            <option value="">
              {t("eo.filters.allPriorities", "All priorities")}
            </option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(`eo.priority.${p}`, p)}
              </option>
            ))}
          </select>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
            {t("common.clear", "Clear")}
          </button>
        )}
      </div>

      {/* Active filter chips */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeChips.map((chip) => (
            <span
              key={String(chip.key)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-700 dark:text-blue-300"
            >
              <span className="opacity-70">{chip.label}:</span>
              {chip.value}
              <button
                type="button"
                onClick={() => updateFilter(chip.key, undefined)}
                className="hover:opacity-70"
                aria-label={t("common.remove", "Remove")}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default EoRecordFilters;
