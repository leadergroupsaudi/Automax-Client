import React, { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  AlertTriangle,
  Lock,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalDescription,
} from "../../ui/Modal";
import { useLocalizedField } from "../../../hooks/useLocalizedField";
import { useEoWorkflowStates } from "../../../hooks/useEoRecords";
import {
  useCreateEoField,
  useDeleteEoField,
  useEoTypeInheritedFields,
  useEoTypeOwnFields,
  useUpdateEoField,
} from "../../../hooks/useEoTypes";
import {
  eoFieldDestructiveChanges,
  eoRefusalMessage,
  eoServerRefusal,
  type EoFieldDestructiveChange,
} from "../../../lib/eoFields";
import {
  emptyEoFieldDraft,
  eoFieldDraftFrom,
  eoFieldRendersAsPlainText,
} from "../../../lib/eoFieldKinds";
import type { EoFieldDraft } from "../../../lib/eoFieldKinds";
import { EoFieldEditor } from "./EoFieldEditor";
import { EoRefusalBanner } from "./EoRefusalBanner";
import { EoDestructiveDialog } from "./EoDestructiveDialog";
import type {
  EoDestructiveConfirmation,
  EoFieldDefinition,
  EoFieldDefRequest,
  EoRecordType,
  EoRecordTypeDetail,
} from "../../../types/eoRecord";

const thClass =
  "px-4 py-2.5 ltr:text-left rtl:text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider";

const Badge: React.FC<{
  tone: "slate" | "blue" | "amber";
  children: React.ReactNode;
}> = ({ tone, children }) => {
  const tones = {
    slate:
      "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30",
    blue: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
    amber:
      "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${tones[tone]}`}
    >
      {children}
    </span>
  );
};

/** The requiredness of one field, as a phrase rather than an enum value. */
const useRequiredness = () => {
  const { t } = useTranslation();
  return useCallback(
    (field: EoFieldDefinition): { label: string; broken: boolean } => {
      switch (field.required_mode) {
        case "always":
          return {
            label: t("eo.requiredMode.always", "always"),
            broken: false,
          };
        case "conditional":
          // A conditional field with no rule is not merely unconfigured: it
          // makes services.ValidateRecordValues refuse EVERY save of EVERY
          // record of this type. The server stores it without complaint, so
          // the only place it can be reported is here.
          return {
            label: t("eo.requiredMode.conditional", "conditional"),
            broken: !field.required_rule?.trim(),
          };
        case "at_state":
          return {
            label: t("eo.requiredMode.at_state", "at states"),
            broken: (field.required_at_state_ids?.length ?? 0) === 0,
          };
        default:
          return {
            label: t("eo.requiredMode.never", "optional"),
            broken: false,
          };
      }
    },
    [t],
  );
};

/**
 * Configuration a stored field is missing, in a sentence — the same checks
 * the editor refuses on, applied to what is already saved. Eleven types and
 * 127 definitions were seeded by engineers before this screen existed, so the
 * list has to be able to report a field it did not create.
 */
const useConfigProblem = () => {
  const { t } = useTranslation();
  return useCallback(
    (field: EoFieldDefinition): string | null => {
      if (field.kind === "dropdown" || field.kind === "multi_select") {
        // A static list OR one of spec §7.3's five option sources. The
        // pilot's `eo_decision_record.keywords` has a source and no list, and
        // it is correctly configured; reading "no options" off it was the
        // check that locked it out of the designer entirely.
        const options = field.config?.options?.length ?? 0;
        const source =
          typeof field.config?.option_source === "string"
            ? field.config.option_source.trim()
            : "";
        if (options === 0 && !source)
          return t(
            "eo.types.field.problems.noOptions",
            "Neither options nor an option source — nothing can be chosen",
          );
        if (options > 0 && source)
          return t(
            "eo.types.field.problems.optionsAndSource",
            "Both a static option list and an option source — which one governs is whatever reads it first",
          );
      }
      if (field.provenance === "derived" && !field.formula?.trim())
        return t(
          "eo.types.field.problems.noFormula",
          "Derived, with no formula — it computes nothing",
        );
      if (field.required_mode === "conditional" && !field.required_rule?.trim())
        return t(
          "eo.types.field.problems.noRule",
          "Conditional, with no rule — every record save of this type is refused",
        );
      if (
        field.required_mode === "at_state" &&
        (field.required_at_state_ids?.length ?? 0) === 0
      )
        return t(
          "eo.types.field.problems.noStates",
          "Required at states, with no states — it is never required anywhere",
        );
      return null;
    },
    [t],
  );
};

export interface EoFieldsTabProps {
  recordType: EoRecordTypeDetail;
  /** The whole catalogue, for the ancestor walk and for link targets. */
  types: EoRecordType[];
}

/**
 * The designer's Fields tab: what this record type carries, and the only
 * screen from which an administrator can add to it.
 *
 * TWO LISTS, AND THE SPLIT IS THE POINT. A type's own definitions are the
 * only ones the three write routes address — they are scoped `:id/fields`, so
 * an ancestor's definition is not addressable from a descendant's designer at
 * all. The inherited ones are shown because a record of this type carries
 * them and an administrator deciding what to add has to see what is already
 * there; they are rendered as rows with no controls, from a query that is
 * separate from the editable one, rather than as disabled copies of an
 * editable row. A `disabled` attribute is a request; a row with no edit path
 * is a fact.
 *
 * Where an own field redeclares an inherited key, that is an OVERRIDE and not
 * a collision — services.ResolveEffectiveFields replaces the ancestor's
 * definition at the ancestor's position — so both rows are shown and each
 * says what the other does to it.
 */
export const EoFieldsTab: React.FC<EoFieldsTabProps> = ({
  recordType,
  types,
}) => {
  const { t } = useTranslation();
  const localize = useLocalizedField();
  const requiredness = useRequiredness();
  const configProblem = useConfigProblem();

  const ownQuery = useEoTypeOwnFields(recordType.id);
  const own = useMemo<EoFieldDefinition[]>(() => {
    const defs = ownQuery.data?.data ?? [];
    return [...defs].sort((a, b) =>
      a.sort_order !== b.sort_order
        ? a.sort_order - b.sort_order
        : a.key.localeCompare(b.key),
    );
  }, [ownQuery.data]);

  const inherited = useEoTypeInheritedFields(recordType.id, types);

  const statesQuery = useEoWorkflowStates(recordType.workflow_id);
  const states = useMemo(
    () => statesQuery.data?.data ?? [],
    [statesQuery.data],
  );
  /**
   * A state-based requirement needs states to name, and there are two
   * different reasons there might be none. They are reported separately
   * because only one of them is anybody's mistake: a type with no workflow is
   * the designer's own gap (a type created on this screen gets no workflow
   * and there is no attributes editor to set one — Task F1's carry-forward),
   * while a workflow whose states this user may not read is a permission the
   * EO module does not imply.
   */
  const statesAvailable = !!recordType.workflow_id && states.length > 0;
  let statesUnavailableReason: string | undefined;
  if (!recordType.workflow_id) {
    statesUnavailableReason = t(
      "eo.types.field.noWorkflow",
      "This record type has no workflow, so it has no states to require a field at. A type created in this designer has none until one is set, which no screen can do yet.",
    );
  } else if (statesQuery.isLoading) {
    statesUnavailableReason = t(
      "eo.types.field.statesLoading",
      "Reading this record type's workflow states…",
    );
  } else if (statesQuery.isError) {
    statesUnavailableReason = t(
      "eo.types.field.statesForbidden",
      "This record type's workflow states could not be read — listing them needs the workflows permission, which the Executive Office does not imply.",
    );
  } else if (states.length === 0) {
    statesUnavailableReason = t(
      "eo.types.field.statesEmpty",
      "This record type's workflow declares no states.",
    );
  }

  const ownKeys = useMemo(() => own.map((f) => f.key), [own]);
  const inheritedOwners = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of inherited.fields) map.set(row.field.key, row.owner.key);
    return map;
  }, [inherited.fields]);

  const createField = useCreateEoField();
  const updateField = useUpdateEoField();
  const deleteField = useDeleteEoField();

  const [editing, setEditing] = useState<{
    draft: EoFieldDraft;
    fieldId?: string;
  } | null>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [deleting, setDeleting] = useState<EoFieldDefinition | null>(null);
  const [deleteError, setDeleteError] = useState<unknown>(null);

  // The confirmation under way, if any. It is one of two shapes because the
  // two destructive routes differ: an edit (PUT) carries the confirmation in
  // its attribute set, so the request is kept to be re-sent; a removal
  // (DELETE) carries it in an optional body and needs nothing kept.
  const [lastRequest, setLastRequest] = useState<EoFieldDefRequest | null>(
    null,
  );
  const [confirming, setConfirming] = useState<{
    via: "edit" | "delete";
    changes: EoFieldDestructiveChange[];
  } | null>(null);
  const [confirmError, setConfirmError] = useState<unknown>(null);

  const closeConfirmation = () => {
    setConfirming(null);
    setConfirmError(null);
  };

  const nextSortOrder =
    own.reduce((max, f) => Math.max(max, f.sort_order), 0) + 1;

  const openAdd = () => {
    setSaveError(null);
    setEditing({ draft: emptyEoFieldDraft(nextSortOrder) });
  };

  const openEdit = (field: EoFieldDefinition) => {
    setSaveError(null);
    setEditing({ draft: eoFieldDraftFrom(field), fieldId: field.id });
  };

  // What a confirmation would have to name for the edit currently refused. An
  // edit that is not of a stored field (an addition) has none.
  const editChanges = (): EoFieldDestructiveChange[] => {
    const stored = own.find((f) => f.id === editing?.fieldId);
    return stored && lastRequest
      ? eoFieldDestructiveChanges(stored, lastRequest)
      : [];
  };

  const handleSubmit = async (data: EoFieldDefRequest) => {
    setSaveError(null);
    setLastRequest(data);
    try {
      if (editing?.fieldId) {
        await updateField.mutateAsync({
          typeId: recordType.id,
          fieldId: editing.fieldId,
          data,
        });
        toast.success(t("eo.types.field.saved", "Field saved"));
      } else {
        await createField.mutateAsync({ typeId: recordType.id, data });
        toast.success(t("eo.types.field.created", "Field added"));
      }
      setEditing(null);
    } catch (error) {
      // The editor maps the per-attribute map onto its controls; the §7.14
      // refusal has no attribute to sit under and is passed back whole, so
      // the dialog stays open with the server's sentence on it.
      setSaveError(error);
      // The banner already carries the server's sentence; a toast repeating
      // it would be the same words twice. Keyed on "a banner was shown", not
      // on "it was destructive", so a map-less 400 of any other kind still
      // reaches the operator.
      if (!eoServerRefusal(error)) {
        toast.error(
          eoRefusalMessage(
            error,
            t("eo.types.field.saveFailed", "Could not save that field"),
          ),
        );
      }
      throw error;
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteError(null);
    try {
      await deleteField.mutateAsync({
        typeId: recordType.id,
        fieldId: deleting.id,
      });
      toast.success(t("eo.types.field.deleted", "Field removed"));
      setDeleting(null);
    } catch (error) {
      setDeleteError(error);
    }
  };

  const deleteRefusal = eoServerRefusal(deleteError);

  const handleConfirm = async (confirmation: EoDestructiveConfirmation) => {
    if (!confirming) return;
    setConfirmError(null);
    try {
      if (confirming.via === "delete" && deleting) {
        await deleteField.mutateAsync({
          typeId: recordType.id,
          fieldId: deleting.id,
          confirm: confirmation,
        });
        toast.success(t("eo.types.field.deleted", "Field removed"));
        setDeleting(null);
        setDeleteError(null);
      } else if (editing?.fieldId && lastRequest) {
        await updateField.mutateAsync({
          typeId: recordType.id,
          fieldId: editing.fieldId,
          data: { ...lastRequest, confirm_destructive: confirmation },
        });
        toast.success(t("eo.types.field.saved", "Field saved"));
        setEditing(null);
        setSaveError(null);
      }
      closeConfirmation();
    } catch (error) {
      setConfirmError(error);
    }
  };

  return (
    <div className="space-y-8">
      {/* ── own fields ────────────────────────────────────────────── */}
      <section>
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              {t("eo.types.field.ownTitle", "Fields of this type")}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {t(
                "eo.types.field.ownHint",
                "Declared here and editable here. Records of this type and of every type beneath it carry them.",
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={openAdd}
            data-testid="eo-add-field"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            {t("eo.types.field.add", "Add field")}
          </button>
        </div>

        {ownQuery.isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : ownQuery.isError ? (
          <div className="rounded-lg border border-red-300 dark:border-red-700/60 bg-red-50 dark:bg-red-900/20 px-4 py-3">
            <p className="text-sm text-red-800 dark:text-red-300">
              {eoRefusalMessage(
                ownQuery.error,
                t(
                  "eo.types.field.loadFailed",
                  "Could not read this type's fields",
                ),
              )}
            </p>
          </div>
        ) : own.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 px-4 py-8 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t(
                "eo.types.field.ownEmpty",
                "This type declares no fields of its own.",
              )}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className={thClass}>
                    {t("eo.types.field.table.field", "Field")}
                  </th>
                  <th className={thClass}>
                    {t("eo.types.field.table.kind", "Kind")}
                  </th>
                  <th className={thClass}>
                    {t("eo.types.field.table.required", "Required")}
                  </th>
                  <th className={thClass}>
                    {t("eo.types.field.table.filledBy", "Filled by")}
                  </th>
                  <th className={`${thClass} w-24`} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {own.map((field) => {
                  const req = requiredness(field);
                  const problem = configProblem(field);
                  const overrides = inheritedOwners.get(field.key);
                  return (
                    <tr
                      key={field.id}
                      data-testid={`eo-own-field-${field.key}`}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-3 align-top">
                        <div className="text-sm font-medium text-slate-900 dark:text-white">
                          {localize(
                            field as unknown as Record<string, unknown>,
                            "label",
                          ) || field.label}
                        </div>
                        <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                          {field.key}
                        </div>
                        {overrides && (
                          <div className="mt-1">
                            <Badge tone="blue">
                              {t("eo.types.field.overrides", {
                                owner: overrides,
                                defaultValue: `Overrides ${overrides}`,
                              })}
                            </Badge>
                          </div>
                        )}
                        {problem && (
                          <div className="mt-1 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>{problem}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className="text-sm text-slate-700 dark:text-slate-300">
                          {t(`eo.kind.${field.kind}`, field.kind)}
                        </span>
                        {eoFieldRendersAsPlainText(field) && (
                          <div className="mt-1">
                            <Badge tone="amber">
                              {t("eo.types.field.plainText", "Plain text box")}
                            </Badge>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span
                          className={`text-sm ${
                            req.broken
                              ? "text-amber-700 dark:text-amber-400"
                              : "text-slate-700 dark:text-slate-300"
                          }`}
                        >
                          {req.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className="text-sm text-slate-700 dark:text-slate-300">
                          {t(
                            `eo.provenance.${field.provenance || "user"}`,
                            field.provenance || "user",
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            type="button"
                            aria-label={t("eo.types.field.edit", "Edit field")}
                            data-testid={`eo-edit-field-${field.key}`}
                            onClick={() => openEdit(field)}
                            className="p-2 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            aria-label={t(
                              "eo.types.field.remove",
                              "Remove field",
                            )}
                            data-testid={`eo-delete-field-${field.key}`}
                            onClick={() => {
                              setDeleteError(null);
                              setDeleting(field);
                            }}
                            className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── inherited fields ──────────────────────────────────────── */}
      <section>
        <div className="mb-3">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            {t("eo.types.field.inheritedTitle", "Inherited fields")}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t(
              "eo.types.field.inheritedHint",
              "Declared by a type this one inherits from. They are carried by every record here and can only be changed on the type that declares them.",
            )}
          </p>
        </div>

        {inherited.isUnreadable && (
          <div className="mb-3 rounded-lg border border-red-300 dark:border-red-700/60 bg-red-50 dark:bg-red-900/20 px-4 py-3">
            <p className="text-sm text-red-800 dark:text-red-300">
              {t(
                "eo.types.field.inheritedUnreadable",
                "An ancestor type's fields could not be read, so this list is incomplete. Records of this type may carry fields that are not shown.",
              )}
            </p>
          </div>
        )}

        {inherited.isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : inherited.fields.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 px-4 py-8 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {recordType.parent_type_id
                ? t(
                    "eo.types.field.inheritedEmpty",
                    "The types this one inherits from declare no fields.",
                  )
                : t(
                    "eo.types.field.inheritsNothing",
                    "This type inherits from nothing, so it has no inherited fields.",
                  )}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30">
            <table className="w-full">
              <thead className="bg-slate-100/80 dark:bg-slate-800/60">
                <tr>
                  <th className={thClass}>
                    {t("eo.types.field.table.field", "Field")}
                  </th>
                  <th className={thClass}>
                    {t("eo.types.field.table.kind", "Kind")}
                  </th>
                  <th className={thClass}>
                    {t("eo.types.field.table.required", "Required")}
                  </th>
                  <th className={thClass}>
                    {t("eo.types.field.table.declaredBy", "Declared by")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {inherited.fields.map(({ field, owner }) => {
                  const req = requiredness(field);
                  const replaced = ownKeys.includes(field.key);
                  return (
                    <tr
                      key={`${owner.id}-${field.id}`}
                      data-testid={`eo-inherited-field-${field.key}`}
                      className="text-slate-600 dark:text-slate-400"
                    >
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-1.5">
                          <Lock
                            className="w-3.5 h-3.5 shrink-0 text-slate-400"
                            aria-hidden="true"
                          />
                          <span className="text-sm font-medium">
                            {localize(
                              field as unknown as Record<string, unknown>,
                              "label",
                            ) || field.label}
                          </span>
                        </div>
                        <div className="text-xs font-mono ms-5">
                          {field.key}
                        </div>
                        {replaced && (
                          <div className="mt-1 ms-5">
                            <Badge tone="blue">
                              {t(
                                "eo.types.field.replacedHere",
                                "Replaced by this type's own definition",
                              )}
                            </Badge>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-sm">
                        {t(`eo.kind.${field.kind}`, field.kind)}
                      </td>
                      <td className="px-4 py-3 align-top text-sm">
                        {req.label}
                      </td>
                      <td className="px-4 py-3 align-top text-sm">
                        <Link
                          to={`/admin/eo-record-types/${owner.id}?tab=fields`}
                          className="font-mono text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {owner.key}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700">
              {t(
                "eo.types.field.readOnlyNote",
                "Read-only here: the field routes address one type's own definitions, so an inherited field is edited on the type that declares it.",
              )}
            </p>
          </div>
        )}
      </section>

      {editing && (
        <EoFieldEditor
          isOpen={!confirming}
          onClose={() => {
            setEditing(null);
            setSaveError(null);
          }}
          draft={editing.draft}
          fieldId={editing.fieldId}
          typeKey={recordType.key}
          siblingKeys={own
            .filter((f) => f.id !== editing.fieldId)
            .map((f) => f.key)}
          inheritedKeyOwners={inheritedOwners}
          types={types}
          states={states}
          statesAvailable={statesAvailable}
          statesUnavailableReason={statesUnavailableReason}
          onSubmit={handleSubmit}
          onConfirmDestructive={
            editChanges().length > 0
              ? () => {
                  setConfirmError(null);
                  setConfirming({ via: "edit", changes: editChanges() });
                }
              : undefined
          }
          isSaving={createField.isPending || updateField.isPending}
          saveError={saveError}
        />
      )}

      {/* The removal confirmation. The §7.14 refusal lands INSIDE it, because
          that is where the operator is when it arrives and where Task F5's
          "confirm it anyway, and state the rule" step attaches. */}
      <Modal
        isOpen={!!deleting && !confirming}
        onClose={() => {
          setDeleting(null);
          setDeleteError(null);
        }}
        size="lg"
      >
        <ModalHeader>
          <ModalTitle>
            {t("eo.types.field.removeTitle", "Remove this field?")}
          </ModalTitle>
          <ModalDescription>{deleting?.key}</ModalDescription>
        </ModalHeader>
        <ModalBody className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {t(
              "eo.types.field.removeHint",
              "Records already saved keep whatever they stored under this key, and nothing will know what it means. While this type, or any type beneath it, holds records the server refuses the removal unless you confirm it and state the rule for those records.",
            )}
          </p>
          {deleteRefusal ? (
            <EoRefusalBanner
              refusal={deleteRefusal}
              testId="eo-field-delete-refusal"
              onConfirm={() => {
                setConfirmError(null);
                setConfirming({
                  via: "delete",
                  changes: [
                    { change: "field_removed", fieldKey: deleting?.key ?? "" },
                  ],
                });
              }}
            />
          ) : deleteError ? (
            <div className="rounded-lg border border-red-300 dark:border-red-700/60 bg-red-50 dark:bg-red-900/20 px-4 py-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
                <p className="text-sm text-red-800 dark:text-red-300">
                  {eoRefusalMessage(
                    deleteError,
                    t(
                      "eo.types.field.deleteFailed",
                      "Could not remove that field",
                    ),
                  )}
                </p>
              </div>
            </div>
          ) : null}
        </ModalBody>
        <ModalFooter>
          <button
            type="button"
            onClick={() => {
              setDeleting(null);
              setDeleteError(null);
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors"
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteField.isPending}
            data-testid="eo-confirm-delete-field"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
          >
            {deleteField.isPending && (
              <Loader2 className="w-4 h-4 animate-spin" />
            )}
            {t("eo.types.field.remove", "Remove field")}
          </button>
        </ModalFooter>
      </Modal>

      {confirming && (
        <EoDestructiveDialog
          isOpen
          typeKey={recordType.key}
          change={confirming.changes[0]}
          changeCount={confirming.changes.length}
          isSaving={updateField.isPending || deleteField.isPending}
          error={confirmError}
          onConfirm={handleConfirm}
          onCancel={closeConfirmation}
        />
      )}
    </div>
  );
};

export default EoFieldsTab;
