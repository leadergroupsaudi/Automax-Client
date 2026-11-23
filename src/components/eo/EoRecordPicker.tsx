import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useEoRecord,
  useEoRecordSearch,
  useEoRecordTypes,
} from "../../hooks/useEoRecords";
import { useLocalizedField } from "../../hooks/useLocalizedField";
import { useDebounce } from "../../hooks/useDebounce";
import { eoRecordSubject } from "../../lib/eoFields";
import type { EoRecord, EoRecordSearchBody } from "../../types/eoRecord";

interface EoRecordPickerProps {
  /** Forwarded to the trigger so the field's <label htmlFor> still points at it. */
  id?: string;
  /** The stored value: a record id, or "" / null when nothing is linked. */
  value: unknown;
  // eslint-disable-next-line no-unused-vars
  onChange: (recordId: string) => void;
  /**
   * `config.target_type_key` from the field definition — the record type the
   * link must point at. Undefined means any type, which is what the pilot's
   * Directive.origin_record asks for (its config is `{}`).
   */
  targetTypeKey?: string;
  /** Red ring only; the field wrapper prints the message, so no text here. */
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

/** Enough rows to recognise one without scrolling the whole register. */
const PAGE_SIZE = 20;

/**
 * Picks ONE EO record for a `link` field.
 *
 * A link field stores a record id, and before this control the form asked the
 * user to type a UUID. The picker searches the register instead — by reference
 * or subject, through POST /eo-records/search, which is the only list route
 * that takes a body and therefore the only one that can send `record_type_id`
 * as the []string the filter declares — and shows each hit as
 * `reference — subject` in the reader's language. The value stored is still
 * the id, so nothing downstream changes.
 *
 * Styled on components/ui/SelectInput.tsx (trigger + absolutely positioned
 * panel, token colours so dark mode needs no `dark:` twin, logical properties
 * throughout so Arabic mirrors).
 */
export const EoRecordPicker: React.FC<EoRecordPickerProps> = ({
  id,
  value,
  onChange,
  targetTypeKey,
  invalid = false,
  disabled = false,
  placeholder,
}) => {
  const { t } = useTranslation();
  const localize = useLocalizedField();

  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const debouncedTerm = useDebounce(term, 300);
  /**
   * The record the user just chose. The search result that produced it is the
   * cheapest label source there is; without it the trigger would flash the id
   * until the by-id query came back.
   */
  const [picked, setPicked] = useState<EoRecord | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const currentId =
    typeof value === "string" ? value : value ? String(value) : "";

  // ── The type the link may point at ────────────────────────────────────────
  const typesQuery = useEoRecordTypes();
  const types = useMemo(() => typesQuery.data?.data ?? [], [typesQuery.data]);
  const targetTypeId = useMemo(
    () =>
      targetTypeKey
        ? types.find((rt) => rt.key === targetTypeKey)?.id
        : undefined,
    [types, targetTypeKey],
  );
  const typeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const rt of types) {
      map.set(
        rt.id,
        localize(rt as unknown as Record<string, unknown>, "name") || rt.key,
      );
    }
    return map;
  }, [types, localize]);

  // A configured target type we cannot resolve yet must NOT fall back to
  // searching every type — that would offer records the server will reject.
  const typeFilterPending = !!targetTypeKey && !targetTypeId;

  const searchBody = useMemo<EoRecordSearchBody>(
    () => ({
      search: debouncedTerm.trim() || undefined,
      record_type_id: targetTypeId ? [targetTypeId] : undefined,
      limit: PAGE_SIZE,
      page: 1,
    }),
    [debouncedTerm, targetTypeId],
  );

  const searchQuery = useEoRecordSearch(
    searchBody,
    open && !disabled && !typeFilterPending,
  );
  const results = searchQuery.data?.data ?? [];
  const totalItems = searchQuery.data?.total_items ?? results.length;

  // ── Resolve the label of an id that arrived from the server (edit mode) ───
  const needsResolve = !!currentId && picked?.id !== currentId;
  const resolveQuery = useEoRecord(needsResolve ? currentId : "");
  const selected: EoRecord | null =
    picked?.id === currentId
      ? picked
      : (results.find((r) => r.id === currentId) ??
        resolveQuery.data?.data ??
        null);

  const labelOf = (rec: EoRecord) => {
    const subject = eoRecordSubject(rec, localize);
    return { reference: rec.reference || "", subject };
  };

  // ── Close on outside click ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => searchRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const choose = (rec: EoRecord) => {
    setPicked(rec);
    onChange(rec.id);
    setOpen(false);
    setTerm("");
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPicked(null);
    // "" rather than null: the server's formula evaluator rejects a null in a
    // conditional required_rule — see lib/eoFields.ts on empty values.
    onChange("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if ((e.key === "Enter" || e.key === " ") && !open) {
      e.preventDefault();
      setOpen(true);
    }
  };

  const triggerText = () => {
    if (selected) {
      const { reference, subject } = labelOf(selected);
      return (
        <span className="truncate text-sm text-[hsl(var(--foreground))]">
          <span className="font-semibold">{reference}</span>
          {subject && (
            <span className="text-[hsl(var(--muted-foreground))]">
              {" — "}
              {subject}
            </span>
          )}
        </span>
      );
    }
    if (currentId) {
      // An id we hold but cannot name: no read access, or the record is gone.
      return (
        <span className="truncate text-sm text-[hsl(var(--muted-foreground))]">
          {resolveQuery.isLoading
            ? t("eo.form.linkResolving", "Loading linked record…")
            : t("eo.form.linkUnresolved", "Linked record (not accessible)")}
        </span>
      );
    }
    return (
      <span className="truncate text-sm text-[hsl(var(--muted-foreground))]">
        {placeholder ?? t("eo.form.linkPlaceholder", "Select a record")}
      </span>
    );
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* ── Trigger ── */}
      <div
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={id ? `${id}-listbox` : undefined}
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex items-center justify-between w-full px-4 py-2.5 rounded-xl border-2 cursor-pointer select-none transition-all",
          "bg-[hsl(var(--background))] text-start",
          "focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.2)] focus:border-[hsl(var(--primary))]",
          open &&
            "ring-2 ring-[hsl(var(--primary)/0.2)] border-[hsl(var(--primary))]",
          invalid
            ? "border-red-500 focus:ring-red-500/20 focus:border-red-500"
            : "border-[hsl(var(--border))]",
          disabled && "opacity-60 cursor-not-allowed",
        )}
      >
        <span className="flex-1 min-w-0">{triggerText()}</span>
        <span className="flex items-center gap-1 ms-2 shrink-0">
          {!!currentId && !disabled && (
            <button
              type="button"
              onClick={clear}
              aria-label={t("eo.form.linkClear", "Clear the linked record")}
              className="opacity-50 hover:opacity-90 transition-opacity rounded p-0.5 hover:bg-[hsl(var(--muted))]"
            >
              <X className="w-3.5 h-3.5 text-[hsl(var(--foreground))]" />
            </button>
          )}
          <ChevronDown
            className={cn(
              "w-4 h-4 text-[hsl(var(--muted-foreground))] transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </span>
      </div>

      {/* ── Panel ── */}
      {open && (
        <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-xl shadow-black/10 overflow-hidden">
          <div className="p-2 border-b border-[hsl(var(--border))]">
            <div className="relative">
              <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
              <input
                ref={searchRef}
                type="text"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder={t(
                  "eo.form.linkSearchPlaceholder",
                  "Search by reference or subject…",
                )}
                className="w-full ps-8 pe-8 py-1.5 text-sm rounded-md text-start bg-[hsl(var(--muted)/0.5)] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary)/0.3)] focus:border-[hsl(var(--primary))] transition-all"
              />
              {searchQuery.isFetching && (
                <Loader2 className="absolute end-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-[hsl(var(--muted-foreground))]" />
              )}
            </div>
            {targetTypeKey && (
              <p className="mt-1.5 px-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                {t("eo.form.linkScopedTo", "Showing {{type}} records only", {
                  type: targetTypeId
                    ? (typeNameById.get(targetTypeId) ?? targetTypeKey)
                    : targetTypeKey,
                })}
              </p>
            )}
          </div>

          <div
            id={id ? `${id}-listbox` : undefined}
            role="listbox"
            className="max-h-64 overflow-y-auto overscroll-contain py-1"
          >
            {searchQuery.isLoading || typeFilterPending ? (
              <div className="px-3 py-6 flex items-center justify-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("eo.form.linkSearching", "Searching…")}
              </div>
            ) : searchQuery.error ? (
              <div className="px-3 py-6 text-center text-sm text-red-600 dark:text-red-400">
                {t("eo.form.linkSearchFailed", "Could not search records")}
              </div>
            ) : results.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
                {t("eo.form.linkNoResults", "No matching records")}
              </div>
            ) : (
              results.map((rec) => {
                const { reference, subject } = labelOf(rec);
                const isSelected = rec.id === currentId;
                return (
                  <button
                    key={rec.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={(e) => {
                      e.stopPropagation();
                      choose(rec);
                    }}
                    className={cn(
                      "w-full px-3 py-2 text-start transition-colors focus:outline-none",
                      isSelected
                        ? "bg-[hsl(var(--primary)/0.08)]"
                        : "hover:bg-[hsl(var(--muted)/0.5)]",
                    )}
                  >
                    <span className="flex items-baseline gap-2 min-w-0">
                      <span
                        className={cn(
                          "text-sm font-semibold shrink-0",
                          isSelected
                            ? "text-[hsl(var(--primary))]"
                            : "text-[hsl(var(--foreground))]",
                        )}
                      >
                        {reference ||
                          t("eo.form.linkNoReference", "(no reference)")}
                      </span>
                      <span className="text-sm text-[hsl(var(--foreground))] truncate">
                        {subject && <span className="opacity-50">— </span>}
                        {subject}
                      </span>
                    </span>
                    {!targetTypeKey && (
                      <span className="block mt-0.5 text-xs text-[hsl(var(--muted-foreground))] truncate">
                        {typeNameById.get(rec.record_type_id) ?? ""}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {totalItems > results.length && results.length > 0 && (
            <div className="px-3 py-2 border-t border-[hsl(var(--border))] text-xs text-[hsl(var(--muted-foreground))] text-start">
              {t(
                "eo.form.linkMore",
                "Showing {{shown}} of {{total}} — refine the search",
                {
                  shown: results.length,
                  total: totalItems,
                },
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EoRecordPicker;
