import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useQuery } from "@tanstack/react-query";
import { Select } from "../ui/SelectInput";
import { MultiSelect } from "../ui/MultiSelect";
import { TreeSelect } from "../ui/TreeSelect";
import { MultiTreeSelect } from "../ui/MultiTreeSelect";
import { EoRecordPicker } from "./EoRecordPicker";
import { EoFileField } from "./EoFileField";
import { userApi, departmentApi } from "../../api/admin";
import { useLocalizedField } from "../../hooks/useLocalizedField";
import {
  useEoFieldOptions,
  type EoResolvedOptions,
} from "../../hooks/useLookupValues";
import { isReadOnlyField, toFileIdList } from "../../lib/eoFields";
import type { EoFieldDefinition } from "../../types/eoRecord";
import type { Department, User } from "../../types";
import type { TreeSelectNode } from "../../utils/treeUtils";
import type { TreeNode } from "../ui/HierarchicalTreeSelect";

interface EoFieldInputProps {
  field: EoFieldDefinition;
  value: unknown;
  // eslint-disable-next-line no-unused-vars
  onChange: (key: string, value: unknown) => void;
  error?: string;
  disabled?: boolean;
  /**
   * The record being edited, when there is one. `file` / `multi_file` need it:
   * POST /eo-records/:id/files files into THAT record's Documenta folder, so
   * on a create form there is nothing to upload against.
   */
  recordId?: string;
  /**
   * The value the SAVED record holds for this field. An attachment is only
   * readable once the record stores its id, so the upload control uses this
   * to decide which files already have a working download link.
   */
  persistedValue?: unknown;
}

/**
 * What to say under a dropdown whose choices are not simply there. Silence is
 * the defect this exists to prevent: an empty picker that says nothing reads
 * as "nothing to choose", never as "this field is misconfigured".
 */
const optionsNoticeText = (
  t: TFunction,
  r: EoResolvedOptions,
  kind: string,
): { text: string; tone: "info" | "problem" } | null => {
  if (kind !== "dropdown" && kind !== "multi_select") return null;
  const code = r.code;
  switch (r.status) {
    case "ready":
      return r.conflict
        ? {
            tone: "problem",
            text: t(
              "eo.form.options.conflict",
              "This field declares both a fixed option list and an option source. The fixed list is being used; ask an administrator to keep one.",
            ),
          }
        : null;
    case "loading":
      return {
        tone: "info",
        text: t("eo.form.options.loading", "Loading the available choices…"),
      };
    case "missing":
      return {
        tone: "problem",
        text: t(
          "eo.form.options.missing",
          'The list this field draws its choices from ("{{code}}") does not exist. Ask an administrator to create it or correct the field.',
          { code },
        ),
      };
    case "inactive":
      return {
        tone: "problem",
        text: t(
          "eo.form.options.inactive",
          'The list this field draws its choices from ("{{code}}") is switched off. Ask an administrator to activate it.',
          { code },
        ),
      };
    case "empty":
      return {
        tone: "problem",
        text: t(
          "eo.form.options.empty",
          'The list this field draws its choices from ("{{code}}") exists but has no active values yet. Ask an administrator to add some.',
          { code },
        ),
      };
    case "unverified":
      return {
        tone: "problem",
        text: t(
          "eo.form.options.unverified",
          'No choices were returned for the list "{{code}}". It may not exist or may have no values; ask an administrator to check it.',
          { code },
        ),
      };
    case "error":
      return {
        tone: "problem",
        text: t(
          "eo.form.options.error",
          "The choices for this field could not be loaded. Try again shortly.",
        ),
      };
    case "noCode":
      return {
        tone: "problem",
        text: t(
          "eo.form.options.noCode",
          "This field is set to draw its choices from a list but names no list. Ask an administrator to correct it.",
        ),
      };
    case "unsupported":
      return {
        tone: "problem",
        text: t(
          "eo.form.options.unsupported",
          "This field draws its choices from a source the form cannot read yet.",
        ),
      };
    case "noOptions":
      return {
        tone: "problem",
        text: t(
          "eo.form.options.noOptions",
          "This field has no choices configured. Ask an administrator to add some.",
        ),
      };
  }
};

/**
 * Token-based control styling (bg-[hsl(var(--…))]) rather than hard-coded
 * slate, so every control is dark-mode correct without a `dark:` twin — the
 * idiom of components/common/DynamicLookupField.tsx, which this component is
 * the EO counterpart of.
 */
const controlClasses =
  "w-full px-4 py-2.5 bg-[hsl(var(--background))] border-2 border-[hsl(var(--border))] rounded-xl text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.2)] focus:border-[hsl(var(--primary))] transition-all disabled:opacity-60";

const errorRing = "border-red-500 focus:ring-red-500/20 focus:border-red-500";

const asString = (v: unknown): string =>
  v === null || v === undefined ? "" : String(v);

const asStringArray = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v.trim())
    return v.split(",").map((s) => s.trim());
  return [];
};

/** "2026-12-20T00:00:00Z" | "2026-12-20" → "2026-12-20" for <input type=date>. */
const toDateInput = (v: unknown): string => {
  const s = asString(v);
  if (!s) return "";
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
};

/** "2026-12-20T09:30:00Z" → "2026-12-20T09:30" for <input type=datetime-local>. */
const toDateTimeInput = (v: unknown): string => {
  const s = asString(v);
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Departments arrive as a Department tree; TreeSelect wants TreeSelectNode. */
const toTreeNodes = (depts: Department[]): TreeSelectNode[] =>
  depts.map((d) => ({
    id: d.id,
    name: d.name,
    name_ar: d.name_ar,
    type: d.type,
    children: d.children ? toTreeNodes(d.children) : undefined,
  }));

const flattenDepartments = (depts: Department[]): Department[] =>
  depts.flatMap((d) => [d, ...flattenDepartments(d.children ?? [])]);

/**
 * Renders ONE server-defined EO field as an input, switching on `field.kind`.
 *
 * 19 kinds exist across the pilot's 127 field definitions. The engine-filled
 * ones (auto_number, workflow_state, and anything of `auto`/`derived`
 * provenance) render as a disabled note rather than a control. `link` is a
 * record picker — see EoRecordPicker.
 */
export const EoFieldInput: React.FC<EoFieldInputProps> = ({
  field,
  value,
  onChange,
  error,
  disabled = false,
  recordId,
  persistedValue,
}) => {
  const { t } = useTranslation();
  const localize = useLocalizedField();

  const label = localize(field as unknown as Record<string, unknown>, "label");
  const help = localize(
    field as unknown as Record<string, unknown>,
    "help_text",
  );
  const required = field.required_mode === "always";
  const readOnly = isReadOnlyField(field);

  const needsUsers = field.kind === "user";
  const needsDepartments =
    field.kind === "org_unit" ||
    field.kind === "multi_org_unit" ||
    field.kind === "external_body";

  const usersQuery = useQuery({
    queryKey: ["admin", "users", "eo-picker"],
    queryFn: () => userApi.list(1, 200),
    enabled: needsUsers,
    staleTime: 5 * 60 * 1000,
  });

  const departmentsQuery = useQuery({
    queryKey: ["admin", "departments", "tree", "eo-picker"],
    queryFn: () => departmentApi.getTree(),
    enabled: needsDepartments,
    staleTime: 5 * 60 * 1000,
  });

  const userOptions = useMemo(
    () =>
      ((usersQuery.data?.data ?? []) as User[]).map((u) => ({
        value: u.id,
        label:
          `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.username,
        description: u.email,
      })),
    [usersQuery.data],
  );

  const departmentTree = useMemo(
    () => toTreeNodes(departmentsQuery.data?.data ?? []),
    [departmentsQuery.data],
  );

  const externalBodyOptions = useMemo(
    () =>
      flattenDepartments(departmentsQuery.data?.data ?? [])
        .filter((d) => d.type === "external")
        .map((d) => ({
          value: d.id,
          label:
            localize(d as unknown as Record<string, unknown>, "name") || d.name,
        })),
    [departmentsQuery.data, localize],
  );

  const resolved = useEoFieldOptions(
    field,
    field.kind === "multi_select"
      ? asStringArray(value)
      : asString(value)
        ? [asString(value)]
        : [],
  );
  const dropdownOptions = resolved.options;
  const optionsLoading = resolved.status === "loading";
  const optionsNotice = optionsNoticeText(t, resolved, field.kind);

  const set = (v: unknown) => onChange(field.key, v);

  const Label = (
    <label
      htmlFor={`eo-field-${field.key}`}
      className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1.5"
    >
      {label || field.key}
      {required && <span className="text-red-500 ms-1">*</span>}
    </label>
  );

  const Footer = (
    <>
      {optionsNotice && (
        <p
          role="status"
          className={`mt-1 text-xs ${optionsNotice.tone === "problem" ? "text-amber-700 dark:text-amber-400" : "text-[hsl(var(--muted-foreground))]"}`}
        >
          {optionsNotice.text}
        </p>
      )}
      {help && (
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
          {help}
        </p>
      )}
      {error && (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </>
  );

  const wrap = (control: React.ReactNode) => (
    <div>
      {Label}
      {control}
      {Footer}
    </div>
  );

  if (readOnly) {
    return wrap(
      <p className="px-4 py-2.5 rounded-xl border-2 border-dashed border-[hsl(var(--border))] text-sm text-[hsl(var(--muted-foreground))]">
        {t("eo.form.systemManaged", "Set automatically by the system")}
      </p>,
    );
  }

  const cls = `${controlClasses} ${error ? errorRing : ""}`;

  switch (field.kind) {
    case "long_text":
      return wrap(
        <textarea
          id={`eo-field-${field.key}`}
          rows={4}
          disabled={disabled}
          value={asString(value)}
          onChange={(e) => set(e.target.value)}
          className={`${cls} resize-y`}
        />,
      );

    case "number":
      return wrap(
        <input
          id={`eo-field-${field.key}`}
          type="number"
          disabled={disabled}
          value={asString(value)}
          onChange={(e) =>
            set(e.target.value === "" ? "" : Number(e.target.value))
          }
          className={cls}
        />,
      );

    case "percent":
      return wrap(
        <div className="relative">
          <input
            id={`eo-field-${field.key}`}
            type="number"
            min={0}
            max={100}
            disabled={disabled}
            value={asString(value)}
            onChange={(e) =>
              set(e.target.value === "" ? "" : Number(e.target.value))
            }
            className={`${cls} pe-10`}
          />
          <span className="absolute inset-y-0 end-4 flex items-center text-sm text-[hsl(var(--muted-foreground))] pointer-events-none">
            %
          </span>
        </div>,
      );

    case "yes_no":
      return (
        <div>
          {Label}
          <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-[hsl(var(--border))] bg-[hsl(var(--background))] cursor-pointer">
            <input
              id={`eo-field-${field.key}`}
              type="checkbox"
              disabled={disabled}
              checked={value === true || value === "true"}
              onChange={(e) => set(e.target.checked)}
              className="rounded border-[hsl(var(--border))] text-[hsl(var(--primary))]"
            />
            <span className="text-sm text-[hsl(var(--foreground))]">
              {value === true || value === "true"
                ? t("common.yes", "Yes")
                : t("common.no", "No")}
            </span>
          </label>
          {Footer}
        </div>
      );

    case "date":
      return wrap(
        <input
          id={`eo-field-${field.key}`}
          type="date"
          disabled={disabled}
          value={toDateInput(value)}
          // The API stores RFC3339; send midnight UTC the way GoalCreatePage does.
          onChange={(e) =>
            set(e.target.value ? `${e.target.value}T00:00:00Z` : "")
          }
          className={cls}
        />,
      );

    case "date_time":
      return wrap(
        <input
          id={`eo-field-${field.key}`}
          type="datetime-local"
          disabled={disabled}
          value={toDateTimeInput(value)}
          onChange={(e) =>
            set(e.target.value ? new Date(e.target.value).toISOString() : "")
          }
          className={cls}
        />,
      );

    case "dropdown":
      return (
        <div>
          {Label}
          <Select
            options={dropdownOptions}
            value={asString(value)}
            onChange={set}
            disabled={disabled}
            searchable={dropdownOptions.length > 8}
            clearable={!required}
            placeholder={
              optionsLoading
                ? t("common.loading", "Loading…")
                : t("eo.form.selectPlaceholder", "Select…")
            }
            error={error}
          />
          {optionsNotice && (
            <p
              role="status"
              className={`mt-1 text-xs ${optionsNotice.tone === "problem" ? "text-amber-700 dark:text-amber-400" : "text-[hsl(var(--muted-foreground))]"}`}
            >
              {optionsNotice.text}
            </p>
          )}
          {help && (
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              {help}
            </p>
          )}
        </div>
      );

    case "multi_select":
      return (
        <div>
          {Label}
          <MultiSelect
            options={dropdownOptions}
            value={asStringArray(value)}
            onChange={set}
            disabled={disabled || optionsLoading}
            searchable
            placeholder={
              optionsLoading
                ? t("common.loading", "Loading…")
                : t("eo.form.selectPlaceholder", "Select…")
            }
          />
          {Footer}
        </div>
      );

    case "user":
      return (
        <div>
          {Label}
          <Select
            options={userOptions}
            value={asString(value)}
            onChange={set}
            disabled={disabled || usersQuery.isLoading}
            searchable
            clearable={!required}
            placeholder={
              usersQuery.isLoading
                ? t("common.loading", "Loading…")
                : t("eo.form.selectUser", "Select a user")
            }
            error={error}
          />
          {help && (
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              {help}
            </p>
          )}
        </div>
      );

    case "org_unit":
      return (
        <div>
          {Label}
          <TreeSelect
            data={departmentTree}
            value={asString(value)}
            onChange={(id) => set(id)}
            disabled={disabled || departmentsQuery.isLoading}
            placeholder={t(
              "eo.form.selectOrgUnit",
              "Select an organisational unit",
            )}
            error={error}
          />
          {help && (
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              {help}
            </p>
          )}
        </div>
      );

    case "multi_org_unit":
      return (
        <div>
          {Label}
          <MultiTreeSelect
            data={departmentTree as unknown as TreeNode[]}
            selectedIds={asStringArray(value)}
            onSelectionChange={set}
            placeholder={t(
              "eo.form.selectOrgUnits",
              "Select organisational units",
            )}
          />
          {Footer}
        </div>
      );

    case "external_body":
      return (
        <div>
          {Label}
          <Select
            options={externalBodyOptions}
            value={asString(value)}
            onChange={set}
            disabled={disabled || departmentsQuery.isLoading}
            searchable
            clearable={!required}
            placeholder={t(
              "eo.form.selectExternalBody",
              "Select an external body",
            )}
            error={error}
          />
          {help && (
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              {help}
            </p>
          )}
        </div>
      );

    case "file":
    case "multi_file":
      // Was a text box asking for a Documenta file id — a value no office
      // user has ever held. EoFileField uploads the file and keeps the id to
      // itself; see that file for the three contract facts behind its states.
      return wrap(
        <EoFileField
          id={`eo-field-${field.key}`}
          multiple={field.kind === "multi_file"}
          value={value}
          onChange={set}
          recordId={recordId}
          persistedIds={toFileIdList(persistedValue)}
          invalid={!!error}
          disabled={disabled}
        />,
      );

    case "link":
      // The target record type comes from config.target_type_key. It is absent
      // on the pilot's Directive.origin_record, whose config is `{}` — that is
      // "any type", not a misconfiguration, so the picker searches the whole
      // register and names each hit's type.
      return wrap(
        <EoRecordPicker
          id={`eo-field-${field.key}`}
          value={value}
          onChange={set}
          targetTypeKey={field.config?.target_type_key}
          invalid={!!error}
          disabled={disabled}
        />,
      );

    case "text":
    default:
      return wrap(
        <input
          id={`eo-field-${field.key}`}
          type="text"
          disabled={disabled}
          value={asString(value)}
          onChange={(e) => set(e.target.value)}
          className={cls}
        />,
      );
  }
};

export default EoFieldInput;
