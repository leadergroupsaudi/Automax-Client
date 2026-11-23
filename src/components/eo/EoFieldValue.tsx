import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Check, Minus } from "lucide-react";
import { userApi, departmentApi } from "../../api/admin";
import { useLocalizedField } from "../../hooks/useLocalizedField";
import { useEoRecord } from "../../hooks/useEoRecords";
import { eoRecordLabel, toFileIdList } from "../../lib/eoFields";
import { EoFileLinks } from "./EoFileField";
import type { EoFieldDefinition } from "../../types/eoRecord";
import type { Department, User } from "../../types";

interface EoFieldValueProps {
  field: EoFieldDefinition;
  value: unknown;
  /** Compact rendering for table cells — no wrapping, truncated. */
  compact?: boolean;
  /**
   * The record this value belongs to. `file` / `multi_file` need it to offer
   * a download: the read routes are scoped to the record that holds the id.
   */
  recordId?: string;
}

const flattenDepartments = (depts: Department[]): Department[] =>
  depts.flatMap((d) => [d, ...flattenDepartments(d.children ?? [])]);

const formatDate = (v: unknown, withTime = false): string => {
  const s = v === null || v === undefined ? "" : String(v);
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return withTime
    ? d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
};

/**
 * Read-only display of one EO field, switching on the same `kind` vocabulary
 * as EoFieldInput so a value is formatted identically on the detail page and
 * in a register cell.
 *
 * The id-bearing kinds (user, org_unit, external_body) resolve their label
 * from the shared users/departments queries — the same query keys the inputs
 * use, so a detail page that has already rendered a form hits the cache.
 */
export const EoFieldValue: React.FC<EoFieldValueProps> = ({
  field,
  value,
  compact = false,
  recordId,
}) => {
  const { t } = useTranslation();
  const localize = useLocalizedField();

  const needsUsers = field.kind === "user" || field.kind === "user_date";
  const needsDepartments =
    field.kind === "org_unit" ||
    field.kind === "multi_org_unit" ||
    field.kind === "external_body";

  const usersQuery = useQuery({
    queryKey: ["admin", "users", "eo-picker"],
    queryFn: () => userApi.list(1, 200),
    enabled: needsUsers && !!value,
    staleTime: 5 * 60 * 1000,
  });

  const departmentsQuery = useQuery({
    queryKey: ["admin", "departments", "tree", "eo-picker"],
    queryFn: () => departmentApi.getTree(),
    enabled: needsDepartments && !!value,
    staleTime: 5 * 60 * 1000,
  });

  /**
   * A `link` field stores a record id. Printing it raw gives the reader a UUID,
   * which is the whole reason the picker exists — so resolve it to
   * `reference — subject` through the same eoKeys.detail cache the detail page
   * fills. Disabled for every other kind, so no extra request is made.
   */
  const linkId =
    field.kind === "link" && typeof value === "string" ? value : "";
  const linkQuery = useEoRecord(linkId);

  const userById = useMemo(() => {
    const map = new Map<string, User>();
    for (const u of (usersQuery.data?.data ?? []) as User[]) map.set(u.id, u);
    return map;
  }, [usersQuery.data]);

  const deptById = useMemo(() => {
    const map = new Map<string, Department>();
    for (const d of flattenDepartments(departmentsQuery.data?.data ?? []))
      map.set(d.id, d);
    return map;
  }, [departmentsQuery.data]);

  const empty = (
    <span className="text-[hsl(var(--muted-foreground))]">
      <Minus
        className="w-3.5 h-3.5 inline-block"
        aria-label={t("common.none", "None")}
      />
    </span>
  );

  const isEmpty =
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0);

  if (isEmpty && field.kind !== "yes_no") return empty;

  const textClass = compact
    ? "text-sm text-[hsl(var(--foreground))] truncate block max-w-[22ch]"
    : "text-sm text-[hsl(var(--foreground))] whitespace-pre-wrap break-words";

  const resolveUser = (id: unknown): string => {
    const u = userById.get(String(id));
    if (!u) return String(id).slice(0, 8) + "…";
    return `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.username;
  };

  const resolveDept = (id: unknown): string => {
    const d = deptById.get(String(id));
    if (!d) return String(id).slice(0, 8) + "…";
    return localize(d as unknown as Record<string, unknown>, "name") || d.name;
  };

  switch (field.kind) {
    case "yes_no": {
      const on = value === true || value === "true";
      return (
        <span className={textClass}>
          {on ? (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <Check className="w-3.5 h-3.5" />
              {t("common.yes", "Yes")}
            </span>
          ) : (
            t("common.no", "No")
          )}
        </span>
      );
    }

    case "dropdown":
    case "multi_select": {
      const options = field.config?.options ?? [];
      const labelFor = (v: unknown) => {
        const opt = options.find((o) => o.value === String(v));
        return opt
          ? localize(opt as unknown as Record<string, unknown>, "label") ||
              opt.value
          : String(v);
      };
      const list = Array.isArray(value) ? value : [value];
      return (
        <span className="flex flex-wrap gap-1">
          {list.map((v, i) => (
            <span
              key={`${String(v)}-${i}`}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"
            >
              {labelFor(v)}
            </span>
          ))}
        </span>
      );
    }

    case "date":
      return <span className={textClass}>{formatDate(value)}</span>;

    case "date_time":
      return <span className={textClass}>{formatDate(value, true)}</span>;

    // `user_date` is the engine's "who and when" pair, and the column behind it
    // (created_by_id) holds the USER id — rendering it as a date prints a raw
    // UUID, which is what the first detail-page pass did.
    case "user_date":
      return <span className={textClass}>{resolveUser(value)}</span>;

    case "percent":
      return <span className={textClass}>{String(value)}%</span>;

    case "user":
      return <span className={textClass}>{resolveUser(value)}</span>;

    case "org_unit":
    case "external_body":
      return <span className={textClass}>{resolveDept(value)}</span>;

    case "multi_org_unit":
      return (
        <span className={textClass}>
          {(Array.isArray(value) ? value : [value]).map(resolveDept).join(", ")}
        </span>
      );

    case "link": {
      const rec = linkQuery.data?.data;
      if (!rec)
        return (
          <span className={`${textClass} text-[hsl(var(--muted-foreground))]`}>
            {linkQuery.isLoading
              ? t("eo.form.linkResolving", "Loading linked record…")
              : t("eo.form.linkUnresolved", "Linked record (not accessible)")}
          </span>
        );
      return <span className={textClass}>{eoRecordLabel(rec, localize)}</span>;
    }

    // Attachments are Documenta file ids. Printing one is printing a UUID at
    // a reader, so the detail page offers the file itself; a register cell
    // (compact, and with no record id) stays a count.
    case "file":
    case "multi_file":
      return (
        <EoFileLinks
          recordId={compact ? undefined : recordId}
          ids={toFileIdList(value)}
        />
      );

    default:
      return <span className={textClass}>{String(value)}</span>;
  }
};

export default EoFieldValue;
