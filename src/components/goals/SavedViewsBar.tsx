import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { useSavedViews, sanitizeFilters } from "../../hooks/useSavedViews";
import type { GoalFilter } from "../../types/goal";

interface SavedViewsBarProps {
  filters: GoalFilter;
  onApply: (filters: GoalFilter) => void;
}

/** Deep-equal JSON-serializable objects (sufficient for GoalFilter shape). */
function shallowFilterEqual(a: GoalFilter, b: GoalFilter): boolean {
  const ka = Object.keys(a) as (keyof GoalFilter)[];
  const kb = Object.keys(b) as (keyof GoalFilter)[];
  // Strip undefined keys before counting.
  const va = ka.filter((k) => a[k] !== undefined);
  const vb = kb.filter((k) => b[k] !== undefined);
  if (va.length !== vb.length) return false;
  for (const k of va) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

export const SavedViewsBar: React.FC<SavedViewsBarProps> = ({
  filters,
  onApply,
}) => {
  const { t } = useTranslation();
  const { views, saveView, deleteView, seedDefaults } = useSavedViews();
  const [showSavePopover, setShowSavePopover] = useState(false);
  const [name, setName] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Seed defaults exactly once if the localStorage key was missing on mount.
  useEffect(() => {
    seedDefaults({
      activeHighPriorityName: t("goals.savedViews.defaults.activeHighPriority"),
      draftsName: t("goals.savedViews.defaults.drafts"),
    });
    // Run once — `seedDefaults` is internally guarded against repeats.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Click-outside / Escape to close the save popover.
  useEffect(() => {
    if (!showSavePopover) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setShowSavePopover(false);
        setName("");
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowSavePopover(false);
        setName("");
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [showSavePopover]);

  // Auto-focus the name input when the popover opens.
  useEffect(() => {
    if (showSavePopover) {
      inputRef.current?.focus();
    }
  }, [showSavePopover]);

  // Comparison key used for the active-pill highlight. Re-derive once per
  // filter change so each pill render is O(views) rather than O(views * filter
  // shape).
  const sanitizedCurrent = useMemo(() => sanitizeFilters(filters), [filters]);
  const activeViewId = useMemo(() => {
    const match = views.find((v) =>
      shallowFilterEqual(sanitizeFilters(v.filters), sanitizedCurrent),
    );
    return match?.id ?? null;
  }, [views, sanitizedCurrent]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    saveView(trimmed, filters);
    setName("");
    setShowSavePopover(false);
  };

  const handleApply = (filters: GoalFilter) => {
    onApply({ ...filters });
  };

  const handleDelete = (
    e: React.MouseEvent,
    id: string,
    viewName: string,
  ) => {
    e.stopPropagation();
    if (window.confirm(t("goals.savedViews.deleteConfirm", { name: viewName }))) {
      deleteView(id);
    }
  };

  const hasViews = views.length > 0;

  return (
    <div className="flex items-start gap-2">
      {/* Saved views strip */}
      {hasViews && (
        <div className="flex-1 min-w-0 overflow-x-auto">
          <div className="flex items-center gap-2 pb-1">
            <span className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">
              {t("goals.savedViews.title")}:
            </span>
            {views.map((view) => {
              const isActive = view.id === activeViewId;
              return (
                <span
                  key={view.id}
                  className={`group inline-flex items-center rounded-full text-xs font-medium transition-colors cursor-pointer ${
                    isActive
                      ? "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700/50 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleApply(view.filters)}
                    className="ps-2.5 py-1 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-full"
                  >
                    {view.name}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, view.id, view.name)}
                    aria-label={t("goals.savedViews.delete")}
                    title={t("goals.savedViews.delete")}
                    className={`ms-1 me-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity ${
                      isActive
                        ? "hover:bg-blue-700 dark:hover:bg-blue-700"
                        : "hover:bg-slate-300 dark:hover:bg-slate-600"
                    }`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Save view button + popover */}
      <div className="relative shrink-0 ms-auto" ref={popoverRef}>
        <button
          type="button"
          onClick={() => setShowSavePopover((v) => !v)}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-full hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors"
        >
          <Plus className="w-3 h-3" />
          {t("goals.savedViews.save")}
        </button>
        {showSavePopover && (
          <div className="absolute end-0 mt-1 z-30 w-64 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg p-3">
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSave();
                }
              }}
              placeholder={t("goals.savedViews.namePlaceholder")}
              className="w-full px-2.5 py-1.5 text-sm rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={60}
            />
            <div className="flex items-center justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  setShowSavePopover(false);
                  setName("");
                }}
                className="px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60 rounded-md transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!name.trim()}
                className="px-2.5 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
              >
                {t("goals.savedViews.save")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SavedViewsBar;
