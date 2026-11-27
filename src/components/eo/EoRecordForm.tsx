import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { EoFieldInput } from "./EoFieldInput";
import { useEoEffectiveFields } from "../../hooks/useEoRecords";
import { useLocalizedField } from "../../hooks/useLocalizedField";
import {
  buildValuesPayload,
  flattenRecordValues,
  isEmptyValue,
  seedFormValues,
  writableFields,
} from "../../lib/eoFields";
import type {
  EoFieldDefinition,
  EoRecord,
  EoRecordType,
  EoValues,
} from "../../types/eoRecord";

interface EoRecordFormProps {
  recordType: EoRecordType;
  /** Present when editing; absent when creating. */
  record?: EoRecord;
  submitLabel: string;
  isSubmitting: boolean;
  // eslint-disable-next-line no-unused-vars
  onSubmit: (values: EoValues) => Promise<unknown>;
  cancelTo: string;
}

/** Kinds that deserve the full row width. */
const WIDE_KINDS = new Set([
  "long_text",
  "multi_org_unit",
  "multi_select",
  // A dropzone plus a list of attachments does not fit a half-width cell.
  "file",
  "multi_file",
]);

/**
 * The dynamic EO form. Every control is generated from the record type's
 * effective field definitions — 11 types and 127 definitions in the pilot, so
 * nothing here is hand-coded per type.
 *
 * House pattern (admin/GoalCreatePage.tsx): useState form object +
 * `errors: Record<string,string>` + validateForm(), NOT react-hook-form.
 * API 400 `errors{}` are merged onto the same map exactly as
 * admin/IncidentCreatePage.tsx does, and shown verbatim — those messages are
 * English-only by backend design, so translating them is not attempted.
 */
export const EoRecordForm: React.FC<EoRecordFormProps> = ({
  recordType,
  record,
  submitLabel,
  isSubmitting,
  onSubmit,
  cancelTo,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const localize = useLocalizedField();
  const { fields, isLoading } = useEoEffectiveFields(recordType.id);

  const [form, setForm] = useState<EoValues | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [seedKey, setSeedKey] = useState<string | null>(null);

  // The field definitions arrive asynchronously, so the form can only be
  // seeded once they land — and it must be seeded for EVERY writable field at
  // once, or controls would flip from uncontrolled to controlled mid-life.
  //
  // This is the "adjust state when a prop changes" pattern (setState during
  // render, guarded by a key), not an effect: seeding in useEffect renders one
  // empty frame first and trips react-hooks/set-state-in-effect.
  const nextSeedKey = fields.length
    ? `${recordType.id}:${record?.id ?? "new"}:${fields.length}`
    : null;
  if (nextSeedKey && nextSeedKey !== seedKey) {
    setSeedKey(nextSeedKey);
    setForm(seedFormValues(fields, record));
  }

  const editable = useMemo(() => writableFields(fields), [fields]);

  /**
   * What the server currently stores, as opposed to what the form holds. Only
   * the attachment control needs it: a file id that is in the form but not yet
   * in the record cannot be downloaded, because the read routes answer from
   * the record's stored values.
   */
  const persisted = useMemo(
    () => (record ? flattenRecordValues(record) : {}),
    [record],
  );

  const handleChange = (key: string, value: unknown) => {
    setForm((prev) => ({ ...(prev ?? {}), [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined, submit: undefined }));
  };

  /**
   * Client-side required checks only — `always` required fields. `conditional`
   * and `at_state` requiredness is evaluated by the server's formula engine
   * against the whole record and is left to it.
   */
  const validateForm = (): Record<string, string> => {
    const next: Record<string, string> = {};
    for (const field of editable) {
      if (field.required_mode !== "always") continue;
      if (isEmptyValue(form?.[field.key])) {
        const label =
          localize(field as unknown as Record<string, unknown>, "label") ||
          field.key;
        next[field.key] = t("eo.create.errors.required", {
          field: label,
          defaultValue: `${label} is required`,
        });
      }
    }

    // Cross-field: due_date must be strictly after origin_date. Only fires on
    // types that declare both (Directive, today). String compare is safe here
    // because the date input emits ISO YYYY-MM-DD.
    const hasOrigin = editable.some((f) => f.key === "origin_date");
    const hasDue = editable.some((f) => f.key === "due_date");
    if (hasOrigin && hasDue) {
      const origin = form?.origin_date;
      const due = form?.due_date;
      if (
        typeof origin === "string" &&
        typeof due === "string" &&
        origin &&
        due &&
        due <= origin
      ) {
        next.due_date = t(
          "eo.create.errors.dueAfterOrigin",
          "Due date must be after Origin date",
        );
      }
    }

    return next;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clientErrors = validateForm();
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      toast.error(
        t("eo.create.fixErrors", "Fix the highlighted fields and try again"),
      );
      return;
    }
    setErrors({});
    try {
      await onSubmit(buildValuesPayload(fields, form ?? {}));
    } catch (error: unknown) {
      const res = (
        error as {
          response?: {
            data?: {
              errors?: Record<string, unknown>;
              message?: string;
              error?: string;
            };
          };
        }
      )?.response?.data;
      const apiErrors = res?.errors;
      if (apiErrors && typeof apiErrors === "object") {
        setErrors((prev) => ({
          ...prev,
          ...Object.fromEntries(
            Object.entries(apiErrors).map(([k, v]) => [k, String(v)]),
          ),
        }));
      }
      toast.error(
        res?.message ||
          res?.error ||
          t("eo.create.fixErrors", "Fix the highlighted fields and try again"),
      );
    }
  };

  if (isLoading || !form) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  // Errors the API reported for keys this form does not render (rare — an
  // engine-owned key, or a conditional rule naming a field of another type).
  const renderedKeys = new Set(editable.map((f) => f.key));
  const orphanErrors = Object.entries(errors).filter(
    ([k, v]) => v && k !== "submit" && !renderedKeys.has(k),
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {orphanErrors.length > 0 && (
        <div className="rounded-xl border border-red-300 dark:border-red-700/60 bg-red-50 dark:bg-red-900/20 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
              {orphanErrors.map(([k, v]) => (
                <li key={k}>
                  <span className="font-medium">{k}</span>: {v}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/80 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {editable.map((field: EoFieldDefinition) => (
            <div
              key={field.key}
              className={WIDE_KINDS.has(field.kind) ? "md:col-span-2" : ""}
            >
              <EoFieldInput
                field={field}
                value={form[field.key]}
                onChange={handleChange}
                error={errors[field.key]}
                disabled={isSubmitting}
                recordId={record?.id}
                persistedValue={persisted[field.key]}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => navigate(cancelTo)}
          disabled={isSubmitting}
          className="px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          {t("common.cancel")}
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {submitLabel}
        </button>
      </div>
    </form>
  );
};

export default EoRecordForm;
