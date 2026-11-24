import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  ChevronRight,
  FileStack,
  Loader2,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import {
  useEoTypeList,
  useEoTypeFieldCounts,
  useEoTypeRecordCounts,
  useCreateEoType,
} from "../../hooks/useEoTypes";
import { useLocalizedField } from "../../hooks/useLocalizedField";
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalDescription,
} from "../../components/ui/Modal";
import { eoFieldErrorMap, eoRefusalMessage } from "../../lib/eoFields";
import type {
  EoRecordType,
  EoRecordTypeRequest,
  EoReferenceMode,
} from "../../types/eoRecord";

const inputClass =
  "w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none";

const thClass =
  "px-6 py-3 ltr:text-left rtl:text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider";

const emptyForm: EoRecordTypeRequest = {
  key: "",
  name: "",
  name_ar: "",
  parent_type_id: null,
  is_abstract: false,
  reference_mode: "own",
  reference_prefix: "",
  reference_pattern: "",
};

/**
 * The record-type catalogue — the Executive Office platform's configuration
 * screen, and until now the one part of the module with no screen at all.
 *
 * Modelled on admin/GoalsPage.tsx: plain <table> in a bordered card, the same
 * three-state ternary, the same header block. A row opens the designer.
 */
export const EoTypesPage: React.FC = () => {
  const { t } = useTranslation();
  const localize = useLocalizedField();

  const typesQuery = useEoTypeList();
  const types = useMemo<EoRecordType[]>(
    () => typesQuery.data?.data ?? [],
    [typesQuery.data],
  );

  // Ancestors first, then by key, so inheritance reads top-down.
  const ordered = useMemo(() => {
    const depth = (t0: EoRecordType): number => {
      let n = 0;
      let cur: EoRecordType | undefined = t0;
      const seen = new Set<string>();
      while (cur?.parent_type_id && !seen.has(cur.id) && n < 32) {
        seen.add(cur.id);
        n += 1;
        cur = types.find((x) => x.id === cur?.parent_type_id);
      }
      return n;
    };
    return [...types].sort(
      (a, b) => depth(a) - depth(b) || a.key.localeCompare(b.key),
    );
  }, [types]);

  const { fieldCount, fieldCountFailed } = useEoTypeFieldCounts(types);
  const { recordCount, isNarrowed, isUnreadable } =
    useEoTypeRecordCounts(types);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<EoRecordTypeRequest>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const createType = useCreateEoType();

  const handleChange = <K extends keyof EoRecordTypeRequest>(
    field: K,
    value: EoRecordTypeRequest[K],
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field as string] && !prev.submit) return prev;
      const next = { ...prev };
      delete next[field as string];
      delete next.submit;
      return next;
    });
  };

  /**
   * The client-side half, which reproduces handlers.eoValidateTypeShape and
   * models.ValidateReferencePrefix's required checks ONLY. It deliberately
   * invents no rule of its own — a key format the server does not enforce
   * would refuse a key the server would have accepted — and the messages go
   * through t() so an Arabic reader gets Arabic for the common cases; the
   * server's own refusals are English-only by design and are shown verbatim.
   */
  const validateForm = (): Record<string, string> => {
    const next: Record<string, string> = {};
    if (!form.key.trim())
      next.key = t("eo.types.errors.keyRequired", "Key is required");
    if (!form.name.trim())
      next.name = t("eo.types.errors.nameRequired", "Name is required");
    if (!form.is_abstract && !form.reference_pattern?.trim())
      next.reference_pattern = t(
        "eo.types.errors.patternRequired",
        "A concrete record type needs a reference pattern",
      );
    if (
      !form.is_abstract &&
      form.reference_mode !== "parent" &&
      !form.reference_prefix?.trim()
    )
      next.reference_prefix = t(
        "eo.types.errors.prefixRequired",
        "A reference prefix is required unless the reference comes from the parent record",
      );
    return next;
  };

  const closeCreate = () => {
    setShowCreate(false);
    setForm(emptyForm);
    setErrors({});
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const clientErrors = validateForm();
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }
    try {
      await createType.mutateAsync({
        ...form,
        key: form.key.trim(),
        name: form.name.trim(),
        name_ar: form.name_ar?.trim() || "",
        reference_prefix: form.reference_prefix?.trim() || "",
        reference_pattern: form.reference_pattern?.trim() || "",
        parent_type_id: form.parent_type_id || null,
      });
      toast.success(t("eo.types.created", "Record type created"));
      closeCreate();
    } catch (error) {
      // `errors` is the authoritative per-field map; `error` is a headline
      // the server caps at three fields, so it goes to the toast and never
      // replaces a field's own message. Same mapping as
      // admin/IncidentCreatePage.tsx:913-938.
      const apiErrors = eoFieldErrorMap(error);
      setErrors((prev) => ({ ...prev, ...apiErrors }));
      toast.error(
        eoRefusalMessage(
          error,
          t("eo.types.createFailed", "Could not create that record type"),
        ),
      );
    }
  };

  if (typesQuery.error) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="rounded-xl border border-red-300 dark:border-red-700/60 bg-red-50 dark:bg-red-900/20 p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            <div>
              <h3 className="text-sm font-medium text-red-800 dark:text-red-300">
                {t("eo.types.failedToLoad", "Could not load the record types")}
              </h3>
              <p className="mt-1 text-sm text-red-700 dark:text-red-400">
                {eoRefusalMessage(
                  typesQuery.error,
                  t("eo.unexpectedError", "Something went wrong"),
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/10">
            <FileStack className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {t("eo.types.title", "EO record types")}
              </h1>
              {!typesQuery.isLoading && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
                  {types.length}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t(
                "eo.types.subtitle",
                "Define the registers the Executive Office keeps, and the fields each one carries.",
              )}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t("eo.types.new", "New record type")}
        </button>
      </div>

      {/* Two different failures of the count, said separately. `isNarrowed`
          is true for every caller who is not a super admin and needs no query
          to fail — which is the whole point, because the restricted designer
          it warns is answered 200 with a filtered zero, never an error. */}
      {isNarrowed && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
          <p className="text-sm text-amber-800 dark:text-amber-300">
            {t(
              "eo.types.countsNarrowed",
              "Record counts are taken from your own view of the registers and may be lower than what the server holds. The server, not this count, decides whether an edit is refused.",
            )}
          </p>
        </div>
      )}
      {isUnreadable && (
        <div className="rounded-xl border border-red-300 dark:border-red-700/60 bg-red-50 dark:bg-red-900/20 px-4 py-3">
          <p className="text-sm text-red-800 dark:text-red-300">
            {t(
              "eo.types.countsUnreadable",
              "Some record counts could not be read and are shown as —. Treat a missing count as unknown, not as zero.",
            )}
          </p>
        </div>
      )}

      {/* Table card */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/80 overflow-hidden">
        {typesQuery.isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : ordered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <FileStack className="w-10 h-10 text-slate-400 dark:text-slate-500 mb-3" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              {t("eo.types.empty", "No record types are configured")}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
              {t(
                "eo.types.emptyHint",
                "Create one to open its first register.",
              )}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800">
                  <th className={thClass}>{t("eo.types.table.key", "Key")}</th>
                  <th className={thClass}>
                    {t("eo.types.table.name", "Name")}
                  </th>
                  <th className={thClass}>
                    {t("eo.types.table.kind", "Kind")}
                  </th>
                  <th className={thClass}>
                    {t("eo.types.table.pattern", "Reference pattern")}
                  </th>
                  <th className={thClass}>
                    {t("eo.types.table.fields", "Own fields")}
                  </th>
                  <th className={thClass}>
                    {t("eo.types.table.records", "Records")}
                  </th>
                  <th className="px-6 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {ordered.map((rt) => {
                  const records = recordCount(rt.id);
                  const fields = fieldCount(rt.id);
                  return (
                    <tr
                      key={rt.id}
                      className="border-t border-slate-200 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <Link
                          to={`/admin/eo-record-types/${rt.id}`}
                          className="text-sm font-medium font-mono text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {rt.key}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-900 dark:text-white">
                          {localize(
                            rt as unknown as Record<string, unknown>,
                            "name",
                          ) || rt.name}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {rt.is_abstract ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                            {t("eo.types.abstract", "Abstract")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/30">
                            {t("eo.types.concrete", "Register")}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-mono text-slate-700 dark:text-slate-300">
                          {rt.reference_pattern || "-"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {/* Three states, not two: a count, a REFUSAL, and a
                            wait. Rendering the spinner for everything that
                            is not a number left it turning for ever on a
                            failed /:id/fields, once per row. */}
                        {fields !== undefined ? (
                          <span className="text-sm tabular-nums text-slate-700 dark:text-slate-300">
                            {fields}
                          </span>
                        ) : fieldCountFailed(rt.id) ? (
                          <span className="text-sm text-slate-400 dark:text-slate-500">
                            {t("eo.types.recordsUnknown", "—")}
                          </span>
                        ) : (
                          <Loader2 className="w-3.5 h-3.5 animate-spin inline text-slate-400 dark:text-slate-500" />
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {records === undefined ? (
                          <span className="text-sm text-slate-400 dark:text-slate-500">
                            {t("eo.types.recordsUnknown", "—")}
                          </span>
                        ) : records > 0 ? (
                          <span
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium tabular-nums bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                            title={t(
                              "eo.types.holdsRecordsHint",
                              "This type or a type beneath it holds records, so some changes need confirmation.",
                            )}
                          >
                            {records}
                          </span>
                        ) : (
                          <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400">
                            0
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          to={`/admin/eo-record-types/${rt.id}`}
                          className="inline-flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          aria-label={t("eo.types.open", "Open designer")}
                        >
                          <ChevronRight className="w-4 h-4 rtl:-rotate-180" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create */}
      <Modal isOpen={showCreate} onClose={closeCreate} size="2xl">
        <form onSubmit={handleCreate}>
          <ModalHeader>
            <ModalTitle>{t("eo.types.new", "New record type")}</ModalTitle>
            <ModalDescription>
              {t(
                "eo.types.newHint",
                "The type appears in the Executive Office at once — no restart. Its fields are added next, in the designer.",
              )}
            </ModalDescription>
          </ModalHeader>
          <ModalBody>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t("eo.types.fields.key", "Key")}{" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className={`${inputClass} font-mono`}
                  value={form.key}
                  onChange={(e) => handleChange("key", e.target.value)}
                  placeholder="eo_memorandum"
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t(
                    "eo.types.fields.keyHint",
                    "Used in the register URL and in the per-type permission codes. It cannot be changed once records exist.",
                  )}
                </p>
                {errors.key && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {errors.key}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t("eo.types.fields.parent", "Inherits from")}
                </label>
                <select
                  className={inputClass}
                  value={form.parent_type_id ?? ""}
                  onChange={(e) =>
                    handleChange("parent_type_id", e.target.value || null)
                  }
                >
                  <option value="">
                    {t("eo.types.fields.noParent", "Nothing")}
                  </option>
                  {types.map((rt) => (
                    <option key={rt.id} value={rt.id}>
                      {(localize(
                        rt as unknown as Record<string, unknown>,
                        "name",
                      ) || rt.name) + ` (${rt.key})`}
                    </option>
                  ))}
                </select>
                {errors.parent_type_id && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {errors.parent_type_id}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t("eo.types.fields.name", "Name")}{" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className={inputClass}
                  value={form.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {errors.name}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t("eo.types.fields.nameAr", "Name (Arabic)")}
                </label>
                <input
                  type="text"
                  dir="rtl"
                  className={inputClass}
                  value={form.name_ar ?? ""}
                  onChange={(e) => handleChange("name_ar", e.target.value)}
                />
                {errors.name_ar && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {errors.name_ar}
                  </p>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                    checked={form.is_abstract}
                    onChange={(e) =>
                      handleChange("is_abstract", e.target.checked)
                    }
                  />
                  {t(
                    "eo.types.fields.isAbstract",
                    "Abstract — holds fields for other types to inherit, and keeps no register of its own",
                  )}
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t("eo.types.fields.referenceMode", "Reference mode")}
                </label>
                <select
                  className={inputClass}
                  value={form.reference_mode ?? "own"}
                  onChange={(e) =>
                    handleChange(
                      "reference_mode",
                      e.target.value as EoReferenceMode,
                    )
                  }
                >
                  <option value="own">
                    {t("eo.types.referenceMode.own", "Its own sequence")}
                  </option>
                  <option value="parent">
                    {t(
                      "eo.types.referenceMode.parent",
                      "Derived from the parent record",
                    )}
                  </option>
                </select>
                {errors.reference_mode && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {errors.reference_mode}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t("eo.types.fields.referencePrefix", "Reference prefix")}
                  {!form.is_abstract && form.reference_mode !== "parent" && (
                    <span className="text-red-500"> *</span>
                  )}
                </label>
                <input
                  type="text"
                  className={`${inputClass} font-mono`}
                  value={form.reference_prefix ?? ""}
                  onChange={(e) =>
                    handleChange("reference_prefix", e.target.value)
                  }
                  placeholder="MEM"
                />
                {errors.reference_prefix && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {errors.reference_prefix}
                  </p>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t("eo.types.fields.referencePattern", "Reference pattern")}
                  {!form.is_abstract && (
                    <span className="text-red-500"> *</span>
                  )}
                </label>
                <input
                  type="text"
                  className={`${inputClass} font-mono`}
                  value={form.reference_pattern ?? ""}
                  onChange={(e) =>
                    handleChange("reference_pattern", e.target.value)
                  }
                  placeholder="MEM-YYYY-NNNN"
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t(
                    "eo.types.fields.referencePatternHint",
                    "YYYY is the year and a run of N is the sequence, as in MEM-YYYY-NNNN.",
                  )}
                </p>
                {errors.reference_pattern && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {errors.reference_pattern}
                  </p>
                )}
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <button
              type="button"
              onClick={closeCreate}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors"
            >
              {t("common.cancel", "Cancel")}
            </button>
            <button
              type="submit"
              disabled={createType.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {createType.isPending && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              {t("eo.types.create", "Create record type")}
            </button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  );
};

export default EoTypesPage;
