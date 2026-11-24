import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "./usePermissions";
import { lookupApi } from "../api/admin";
import { useLocalizedField } from "./useLocalizedField";
import type { EoFieldDefinition } from "../types/eoRecord";
import type { LookupCategory, LookupValue } from "../types";

/**
 * The values of one lookup category, by code.
 *
 * GET /lookups/:code is authenticate-only (cmd/server/main.go, NOT behind
 * `lookups:view`), so an ordinary officer resolves an option source without a
 * new grant. The code is matched case-insensitively server-side, so the key is
 * upper-cased: two fields spelling one category differently share one request.
 *
 * THE ENDPOINT CANNOT TELL "no such category" FROM "category with no values":
 * both are `200 {"data":[]}`. Telling them apart takes the category list,
 * which IS behind `lookups:view` — see useLookupCategoryProbe.
 */
export const useLookupValues = (code: string | null | undefined) => {
  const normalized = (code ?? "").trim();
  return useQuery({
    queryKey: ["lookups", "values", normalized.toUpperCase()],
    queryFn: async () => (await lookupApi.getValuesByCode(normalized)).data,
    enabled: normalized !== "",
    staleTime: 5 * 60 * 1000,
  });
};

/** Only asked once a code has resolved to nothing, and only works with `lookups:view`. */
const useLookupCategoryProbe = (code: string, enabled: boolean) => {
  // The category list is behind `lookups:view`. A caller without it would be
  // refused, and that refusal is already decided: do not send the request.
  const { hasPermission } = usePermissions();
  const allowed = hasPermission("lookups:view");
  const q = useQuery({
    queryKey: ["lookups", "categories", "eo-probe"],
    queryFn: async () => (await lookupApi.listCategories()).data,
    enabled: enabled && allowed && code !== "",
    staleTime: 60 * 1000,
    retry: false,
  });
  return { ...q, allowed };
};

/**
 * Where a dropdown / multi_select's choices stand.
 *
 *  - ready        : there are options to choose from
 *  - loading      : a source is being fetched
 *  - noCode       : option_source is lookup_category with no category code
 *  - unsupported  : a §7.3 source with no agreed spelling (org units, users…)
 *  - missing      : the category does not exist
 *  - inactive     : the category exists but is switched off
 *  - empty        : the category exists and holds no active values
 *  - unverified   : nothing came back and this user cannot list categories,
 *                   so "missing" and "empty" cannot be told apart
 *  - error        : the request failed
 *  - noOptions    : neither a list nor a source (a defect of the field)
 */
export type EoOptionsStatus =
  | "ready"
  | "loading"
  | "noCode"
  | "unsupported"
  | "missing"
  | "inactive"
  | "empty"
  | "unverified"
  | "error"
  | "noOptions";

export interface EoResolvedOptions {
  options: { value: string; label: string; unrecognised?: boolean }[];
  status: EoOptionsStatus;
  /** The category code, for messages. */
  code: string;
  /** Both a static list and a source are declared — a defect (§7.3 / seed test). */
  conflict: boolean;
}

/**
 * Resolves a dropdown's options exactly as the designer reads §7.3
 * (lib/eoFieldKinds.ts, validateEoFieldDraft): a static `options` list OR an
 * `option_source`, never both; `lookup_category` is the one source with an
 * agreed spelling. When both are declared the static list governs and
 * `conflict` is set so the form can say so.
 */
export const useResolvedOptions = (
  field: EoFieldDefinition,
): EoResolvedOptions => {
  const localize = useLocalizedField();
  const staticOptions = useMemo(
    () => field.config?.options ?? [],
    [field.config],
  );
  const source =
    typeof field.config?.option_source === "string"
      ? field.config.option_source.trim()
      : "";
  const rawCode = (field.config as Record<string, unknown> | undefined)
    ?.lookup_category_code;
  const code = typeof rawCode === "string" ? rawCode.trim() : "";
  const useSource = staticOptions.length === 0 && source !== "";
  const isLookup = useSource && source === "lookup_category" && code !== "";

  const values = useLookupValues(isLookup ? code : null);
  const nothingBack =
    isLookup && values.isSuccess && (values.data ?? []).length === 0;
  const probe = useLookupCategoryProbe(code, nothingBack);

  const lookupOptions = useMemo(
    () =>
      ((values.data ?? []) as LookupValue[]).map((v) => ({
        value: v.code,
        label:
          localize(v as unknown as Record<string, unknown>, "name") || v.code,
      })),
    [values.data, localize],
  );

  const staticMapped = useMemo(
    () =>
      staticOptions.map((o) => ({
        value: o.value,
        label:
          localize(o as unknown as Record<string, unknown>, "label") || o.value,
      })),
    [staticOptions, localize],
  );

  const conflict = staticOptions.length > 0 && source !== "";
  const base = { code, conflict };

  if (staticOptions.length > 0)
    return { ...base, options: staticMapped, status: "ready" };
  if (!useSource) return { ...base, options: [], status: "noOptions" };
  if (source !== "lookup_category")
    return { ...base, options: [], status: "unsupported" };
  if (code === "") return { ...base, options: [], status: "noCode" };
  if (values.isLoading) return { ...base, options: [], status: "loading" };
  if (values.isError) return { ...base, options: [], status: "error" };
  if (lookupOptions.length > 0)
    return { ...base, options: lookupOptions, status: "ready" };

  // Nothing came back. Ask the category list, if this user may.
  if (probe.allowed && probe.isLoading)
    return { ...base, options: [], status: "loading" };
  if (!probe.isSuccess) return { ...base, options: [], status: "unverified" };
  const cat = ((probe.data ?? []) as LookupCategory[]).find(
    (c) => c.code.toUpperCase() === code.toUpperCase(),
  );
  if (!cat) return { ...base, options: [], status: "missing" };
  if (!cat.is_active) return { ...base, options: [], status: "inactive" };
  return { ...base, options: [], status: "empty" };
};

/**
 * `useResolvedOptions` plus the values the record ALREADY HOLDS that the
 * options do not know — a deactivated or deleted code, or any code while the
 * source is missing. They are appended flagged `unrecognised`, so a form can
 * show them (and let the officer remove them) and a detail view can say so,
 * instead of either hiding them or passing a slug off as a label. While the
 * options are still loading nothing is appended: the caller shows "loading".
 */
export const useEoFieldOptions = (
  field: EoFieldDefinition,
  selected: string[] = [],
): EoResolvedOptions => {
  const { t } = useTranslation();
  const r = useResolvedOptions(field);
  return useMemo(() => {
    if (r.status === "loading" || selected.length === 0) return r;
    const known = new Set(r.options.map((o) => o.value));
    const extra = selected
      .filter((v) => v !== "" && !known.has(v))
      .map((v) => ({
        value: v,
        label: t(
          "eo.form.options.unrecognisedValue",
          "{{value}} (unrecognised)",
          {
            value: v,
          },
        ),
        unrecognised: true,
      }));
    return extra.length ? { ...r, options: [...r.options, ...extra] } : r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, selected.join("\u0000"), t]);
};
