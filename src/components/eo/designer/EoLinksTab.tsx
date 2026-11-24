import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  ArrowRight,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Modal,
  ModalBody,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "../../ui/Modal";
import { useLocalizedField } from "../../../hooks/useLocalizedField";
import {
  useCreateEoLinkType,
  useDeleteEoLinkType,
  useEoLinkTypes,
  useUpdateEoLinkType,
} from "../../../hooks/useEoTypes";
import {
  eoFieldErrorMap,
  eoRefusalMessage,
  eoServerRefusal,
} from "../../../lib/eoFields";
import {
  EO_ANY_TYPE,
  emptyEoLinkTypeRequest,
  eoLinkEndpoints,
  eoLinkTouchesType,
  eoLinkTypeRequestFrom,
} from "../../../lib/eoLinks";
import { EoRefusalBanner } from "./EoRefusalBanner";
import type {
  EoLinkType,
  EoLinkTypeRequest,
  EoRecordType,
  EoRecordTypeDetail,
} from "../../../types/eoRecord";

const inputClass =
  "w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none";
const labelClass =
  "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5";
const thClass =
  "px-4 py-2.5 ltr:text-left rtl:text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider";

const FieldError: React.FC<{ message?: string; testId?: string }> = ({
  message,
  testId,
}) =>
  message ? (
    <p
      data-testid={testId}
      className="mt-1 text-sm text-red-600 dark:text-red-400"
    >
      {message}
    </p>
  ) : null;

const Pill: React.FC<{
  tone?: "slate" | "blue" | "amber";
  children: React.ReactNode;
}> = ({ tone = "slate", children }) => {
  const tones = {
    slate:
      "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30",
    blue: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
    amber:
      "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30",
  } as const;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${tones[tone]}`}
    >
      {children}
    </span>
  );
};

const Switch: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
  testId: string;
}> = ({ checked, onChange, label, hint, testId }) => (
  <div className="flex items-start gap-3">
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
        checked ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
          checked
            ? "ltr:translate-x-6 rtl:-translate-x-6"
            : "ltr:translate-x-1 rtl:-translate-x-1"
        }`}
      />
    </button>
    <div>
      <div className="text-sm font-medium text-slate-900 dark:text-white">
        {label}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
        {hint}
      </p>
    </div>
  </div>
);

/** Which request attributes a server field-error key belongs to. */
const ATTRIBUTES = [
  "key",
  "label",
  "label_ar",
  "source_type_ids",
  "target_type_ids",
  "cardinality",
  "deadline_offset_days",
  "blocks_parent_transition_key",
] as const;

// ── endpoint picker ──────────────────────────────────────────────────────

const EndpointPicker: React.FC<{
  idPrefix: string;
  value: string[];
  onChange: (next: string[]) => void;
  types: EoRecordType[];
  nameOf: (t: EoRecordType) => string;
}> = ({ idPrefix, value, onChange, types, nameOf }) => {
  const { t } = useTranslation();
  const known = new Set(types.map((x) => x.id));
  const unknown = value.filter((v) => v !== EO_ANY_TYPE && !known.has(v));
  const toggle = (id: string) =>
    onChange(
      value.includes(id) ? value.filter((v) => v !== id) : [...value, id],
    );
  return (
    <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-300 dark:border-slate-600 divide-y divide-slate-100 dark:divide-slate-700/60">
      <label className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer bg-slate-50 dark:bg-slate-800/60">
        <input
          type="checkbox"
          data-testid={`${idPrefix}-any`}
          checked={value.includes(EO_ANY_TYPE)}
          onChange={() => toggle(EO_ANY_TYPE)}
        />
        <span className="font-medium">
          {t("eo.types.link.anyType", "Any record type")}
        </span>
      </label>
      {types.map((x) => (
        <label
          key={x.id}
          className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer"
        >
          <input
            type="checkbox"
            data-testid={`${idPrefix}-${x.key}`}
            checked={value.includes(x.id)}
            onChange={() => toggle(x.id)}
          />
          <span>{nameOf(x)}</span>
          <span className="text-xs font-mono text-slate-500">{x.key}</span>
        </label>
      ))}
      {unknown.map((id) => (
        <label
          key={id}
          className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer text-amber-800 dark:text-amber-300"
        >
          <input type="checkbox" checked onChange={() => toggle(id)} />
          <span>
            {t("eo.types.link.unknownType", "Unknown record type")}{" "}
            <span className="font-mono text-xs">{id}</span>
          </span>
        </label>
      ))}
    </div>
  );
};

// ── editor ───────────────────────────────────────────────────────────────

interface EditorProps {
  initial: EoLinkTypeRequest;
  linkTypeId?: string;
  types: EoRecordType[];
  nameOf: (t: EoRecordType) => string;
  isSaving: boolean;
  saveError: unknown;
  onSubmit: (data: EoLinkTypeRequest) => Promise<void>;
  onClose: () => void;
}

const LinkTypeEditor: React.FC<EditorProps> = ({
  initial,
  linkTypeId,
  types,
  nameOf,
  isSaving,
  saveError,
  onSubmit,
  onClose,
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<EoLinkTypeRequest>(initial);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  // What the server said about each attribute, kept until the operator
  // touches that attribute again.
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<unknown>(null);

  const set = <K extends keyof EoLinkTypeRequest>(
    k: K,
    v: EoLinkTypeRequest[K],
  ) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setServerErrors((e) => (k in e ? { ...e, [k]: "" } : e));
    setClientErrors((e) => (k in e ? { ...e, [k]: "" } : e));
  };

  const errorFor = (k: string) => clientErrors[k] || serverErrors[k];

  // The refusal that is not about one attribute: the server's sentence when
  // there is no field map, or a 403.
  const refusal = eoServerRefusal(submitError ?? saveError);
  const unmapped = useMemo(() => {
    const err = submitError ?? saveError;
    if (!err || refusal) return "";
    const map = eoFieldErrorMap(err);
    const stray = Object.keys(map).filter(
      (k) => !(ATTRIBUTES as readonly string[]).includes(k),
    );
    if (Object.keys(map).length > 0 && stray.length === 0) return "";
    return eoRefusalMessage(
      err,
      t("eo.types.link.saveFailed", "Could not save that link type"),
    );
  }, [submitError, saveError, refusal, t]);

  const submit = async () => {
    const problems: Record<string, string> = {};
    const nonEmpty = (l: string[]) => l.length > 0;
    if (!nonEmpty(draft.source_type_ids))
      problems.source_type_ids = t(
        "eo.types.link.sourceRequired",
        "Pick at least one source type. The server would store a link type with none, but nothing could ever be linked with it.",
      );
    if (!nonEmpty(draft.target_type_ids))
      problems.target_type_ids = t(
        "eo.types.link.targetRequired",
        "Pick at least one target type. The server would store a link type with none, but nothing could ever be linked with it.",
      );
    setClientErrors(problems);
    setServerErrors({});
    setSubmitError(null);
    if (Object.keys(problems).length > 0) return;
    try {
      await onSubmit({
        ...draft,
        key: draft.key.trim(),
        label: draft.label.trim(),
        blocks_parent_transition_key: draft.blocks_parent_transition_key.trim(),
        deadline_offset_days: draft.derive_deadline_from_parent
          ? Number(draft.deadline_offset_days) || 0
          : 0,
      });
    } catch (error) {
      setSubmitError(error);
      setServerErrors(eoFieldErrorMap(error));
    }
  };

  return (
    <Modal isOpen onClose={onClose} size="2xl">
      <ModalHeader>
        <ModalTitle>
          {linkTypeId
            ? t("eo.types.link.editTitle", "Edit link type")
            : t("eo.types.link.addTitle", "Add link type")}
        </ModalTitle>
        <ModalDescription>
          {t(
            "eo.types.link.editorHint",
            "A link type says which kinds of record may be linked, in which direction, and what the link does to the records at either end.",
          )}
        </ModalDescription>
      </ModalHeader>
      <ModalBody className="space-y-5">
        {refusal && (
          <EoRefusalBanner refusal={refusal} testId="eo-link-refusal" />
        )}
        {unmapped && (
          <div
            data-testid="eo-link-submit-error"
            className="rounded-lg border border-red-300 dark:border-red-700/60 bg-red-50 dark:bg-red-900/20 px-4 py-3"
          >
            <p className="text-sm text-red-800 dark:text-red-300">{unmapped}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className={labelClass} htmlFor="eo-link-key">
              {t("eo.types.link.key", "Key")}{" "}
              <span className="text-red-500">*</span>
            </label>
            <input
              id="eo-link-key"
              className={`${inputClass} font-mono ${linkTypeId ? "opacity-70" : ""}`}
              value={draft.key}
              readOnly={!!linkTypeId}
              onChange={(e) => set("key", e.target.value)}
            />
            <FieldError message={errorFor("key")} testId="eo-link-error-key" />
            {linkTypeId && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {t(
                  "eo.types.link.keyLocked",
                  "Existing links name this key, so it cannot be changed.",
                )}
              </p>
            )}
          </div>
          <div>
            <label className={labelClass} htmlFor="eo-link-cardinality">
              {t("eo.types.link.cardinality", "Cardinality")}
            </label>
            <select
              id="eo-link-cardinality"
              className={inputClass}
              value={draft.cardinality}
              onChange={(e) => set("cardinality", e.target.value)}
            >
              <option value="one">
                {t("eo.types.link.cardOne", "One — at most one outgoing link")}
              </option>
              <option value="many">
                {t("eo.types.link.cardMany", "Many — no limit")}
              </option>
            </select>
            <FieldError
              message={errorFor("cardinality")}
              testId="eo-link-error-cardinality"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="eo-link-label">
              {t("eo.types.link.label", "Label")}{" "}
              <span className="text-red-500">*</span>
            </label>
            <input
              id="eo-link-label"
              className={inputClass}
              value={draft.label}
              onChange={(e) => set("label", e.target.value)}
            />
            <FieldError
              message={errorFor("label")}
              testId="eo-link-error-label"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="eo-link-label-ar">
              {t("eo.types.link.labelAr", "Label (Arabic)")}
            </label>
            <input
              id="eo-link-label-ar"
              dir="rtl"
              className={inputClass}
              value={draft.label_ar}
              onChange={(e) => set("label_ar", e.target.value)}
            />
            <FieldError message={errorFor("label_ar")} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <span className={labelClass}>
              {t(
                "eo.types.link.source",
                "Source — the record the link starts from",
              )}{" "}
              <span className="text-red-500">*</span>
            </span>
            <EndpointPicker
              idPrefix="eo-link-source"
              value={draft.source_type_ids}
              onChange={(v) => set("source_type_ids", v)}
              types={types}
              nameOf={nameOf}
            />
            <FieldError
              message={errorFor("source_type_ids")}
              testId="eo-link-error-source_type_ids"
            />
          </div>
          <div>
            <span className={labelClass}>
              {t("eo.types.link.target", "Target — the record it points at")}{" "}
              <span className="text-red-500">*</span>
            </span>
            <EndpointPicker
              idPrefix="eo-link-target"
              value={draft.target_type_ids}
              onChange={(v) => set("target_type_ids", v)}
              types={types}
              nameOf={nameOf}
            />
            <FieldError
              message={errorFor("target_type_ids")}
              testId="eo-link-error-target_type_ids"
            />
          </div>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2">
          {t(
            "eo.types.link.matchHint",
            "A type is matched by its own id: choosing a parent type does not also permit the types that inherit from it. For a child-to-parent link, the source is the child and the target is the parent, and the rules below act on the parent.",
          )}
        </p>

        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
            {t("eo.types.link.rules", "What the link does")}
          </h4>
          <Switch
            testId="eo-link-derive"
            checked={draft.derive_deadline_from_parent}
            onChange={(v) => set("derive_deadline_from_parent", v)}
            label={t(
              "eo.types.link.derive",
              "Derive the deadline from the parent",
            )}
            hint={t(
              "eo.types.link.deriveHint",
              "When a record is created with this link, its due date is set to the parent's due date minus the offset below, replacing whatever was entered. A parent with no due date leaves the record's own date alone.",
            )}
          />
          {draft.derive_deadline_from_parent && (
            <div className="ms-14 max-w-xs">
              <label className={labelClass} htmlFor="eo-link-offset">
                {t("eo.types.link.offset", "Days before the parent's deadline")}
              </label>
              <input
                id="eo-link-offset"
                type="number"
                className={inputClass}
                value={draft.deadline_offset_days}
                onChange={(e) =>
                  set("deadline_offset_days", Number(e.target.value))
                }
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {t(
                  "eo.types.link.offsetHint",
                  "Calendar days. A negative number moves the deadline later than the parent's.",
                )}
              </p>
              <FieldError message={errorFor("deadline_offset_days")} />
            </div>
          )}
          <Switch
            testId="eo-link-blocks-closure"
            checked={draft.blocks_parent_closure}
            onChange={(v) => set("blocks_parent_closure", v)}
            label={t(
              "eo.types.link.blocksClosure",
              "Open children block closing the parent",
            )}
            hint={t(
              "eo.types.link.blocksClosureHint",
              "While a record linked this way is still open, its parent cannot be closed — why a letter cannot close while a referral is open.",
            )}
          />
          <div>
            <label className={labelClass} htmlFor="eo-link-block-transition">
              {t(
                "eo.types.link.blocksTransition",
                "Block one parent transition, by key",
              )}
            </label>
            <input
              id="eo-link-block-transition"
              className={`${inputClass} font-mono max-w-xs`}
              value={draft.blocks_parent_transition_key}
              onChange={(e) =>
                set("blocks_parent_transition_key", e.target.value)
              }
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t(
                "eo.types.link.blocksTransitionHint",
                "Optional. The parent cannot take the workflow transition with this key while an open child is linked this way. Independent of the switch above: a link can block closing, this transition, both or neither.",
              )}
            </p>
            <FieldError message={errorFor("blocks_parent_transition_key")} />
          </div>
          <Switch
            testId="eo-link-cascade"
            checked={draft.cascade_sensitivity}
            onChange={(v) => set("cascade_sensitivity", v)}
            label={t(
              "eo.types.link.cascade",
              "Cascade the parent's sensitivity",
            )}
            hint={t(
              "eo.types.link.cascadeHint",
              "A record created with this link takes the parent's sensitivity label, overriding what was entered — a confidential parent's children are confidential.",
            )}
          />
        </div>
      </ModalBody>
      <ModalFooter>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors"
        >
          {t("common.cancel", "Cancel")}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={isSaving}
          data-testid="eo-link-save"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
          {t("common.save", "Save")}
        </button>
      </ModalFooter>
    </Modal>
  );
};

// ── tab ──────────────────────────────────────────────────────────────────

export interface EoLinksTabProps {
  recordType: EoRecordTypeDetail;
  /** The whole catalogue, to name the types at each end. */
  types: EoRecordType[];
}

/**
 * The designer's Links tab: every link type that has this record type at
 * either end, as source -> target with the rules it carries.
 *
 * Link types are global (they belong to no type), so editing one here edits
 * it for every type it touches; the list says so rather than implying the
 * link is this type's own. A link type whose endpoint list is "any" touches
 * every type and is listed on all of them, marked as such.
 */
export const EoLinksTab: React.FC<EoLinksTabProps> = ({
  recordType,
  types,
}) => {
  const { t } = useTranslation();
  const localize = useLocalizedField();
  const nameOf = (x: EoRecordType) =>
    localize(x as unknown as Record<string, unknown>, "name") || x.name;
  const typeById = useMemo(() => new Map(types.map((x) => [x.id, x])), [types]);

  const query = useEoLinkTypes();
  const mine = useMemo<EoLinkType[]>(
    () =>
      (query.data?.data ?? [])
        .filter((lt) => eoLinkTouchesType(lt, recordType.id))
        .sort((a, b) => a.key.localeCompare(b.key)),
    [query.data, recordType.id],
  );

  const createLink = useCreateEoLinkType();
  const updateLink = useUpdateEoLinkType();
  const deleteLink = useDeleteEoLinkType();

  const [editing, setEditing] = useState<{
    initial: EoLinkTypeRequest;
    id?: string;
  } | null>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [deleting, setDeleting] = useState<EoLinkType | null>(null);
  const [deleteError, setDeleteError] = useState<unknown>(null);

  const handleSubmit = async (data: EoLinkTypeRequest) => {
    setSaveError(null);
    try {
      if (editing?.id) {
        await updateLink.mutateAsync({ id: editing.id, data });
        toast.success(t("eo.types.link.saved", "Link type saved"));
      } else {
        await createLink.mutateAsync(data);
        toast.success(t("eo.types.link.created", "Link type added"));
      }
      setEditing(null);
    } catch (error) {
      setSaveError(error);
      throw error;
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteError(null);
    try {
      await deleteLink.mutateAsync(deleting.id);
      toast.success(t("eo.types.link.deleted", "Link type removed"));
      setDeleting(null);
    } catch (error) {
      setDeleteError(error);
    }
  };

  const endpoint = (raw: unknown) => {
    const e = eoLinkEndpoints(raw);
    if (!e.any && e.ids.length === 0)
      return (
        <Pill tone="amber">
          {t("eo.types.link.noEndpoint", "none — nothing can be linked")}
        </Pill>
      );
    return (
      <div className="flex flex-wrap gap-1.5">
        {e.any && (
          <Pill tone="blue">
            {t("eo.types.link.anyType", "Any record type")}
          </Pill>
        )}
        {e.ids.map((id) => {
          const x = typeById.get(id);
          if (!x)
            return (
              <Pill key={id} tone="amber">
                {t("eo.types.link.unknownType", "Unknown record type")}{" "}
                {id.slice(0, 8)}
              </Pill>
            );
          return id === recordType.id ? (
            <Pill key={id} tone="blue">
              {nameOf(x)}
            </Pill>
          ) : (
            <Link
              key={id}
              to={`/admin/eo-record-types/${id}?tab=links`}
              className="hover:opacity-80"
            >
              <Pill>{nameOf(x)}</Pill>
            </Link>
          );
        })}
      </div>
    );
  };

  const rules = (lt: EoLinkType) => {
    const out: string[] = [];
    if (lt.derive_deadline_from_parent) {
      // The server sets due = parent's due minus the offset
      // (services.DeriveDeadlineFromParent), so a positive offset is EARLIER
      // and a negative one LATER — the same direction the editor's hint says.
      const offset = lt.deadline_offset_days ?? 0;
      const days = Math.abs(offset);
      out.push(
        offset === 0
          ? t(
              "eo.types.link.ruleDeadlineSame",
              "Deadline: the same as the parent's",
            )
          : offset > 0
            ? t("eo.types.link.ruleDeadlineEarlier", {
                days,
                defaultValue: `Deadline: parent's, ${days} days earlier`,
              })
            : t("eo.types.link.ruleDeadlineLater", {
                days,
                defaultValue: `Deadline: parent's, ${days} days later`,
              }),
      );
    }
    if (lt.blocks_parent_closure)
      out.push(
        t(
          "eo.types.link.ruleBlocksClosure",
          "Open children block closing the parent",
        ),
      );
    if (lt.blocks_parent_transition_key)
      out.push(
        t("eo.types.link.ruleBlocksTransition", {
          key: lt.blocks_parent_transition_key,
          defaultValue: `Open children block the parent's "${lt.blocks_parent_transition_key}" transition`,
        }),
      );
    if (lt.cascade_sensitivity)
      out.push(
        t(
          "eo.types.link.ruleCascade",
          "Parent's sensitivity cascades to the child",
        ),
      );
    return out;
  };

  const deleteRefusal = eoServerRefusal(deleteError);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            {t("eo.types.link.title", "Link types touching this type")}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t(
              "eo.types.link.hint",
              "Link types belong to no one type: editing one here changes it for every type it connects.",
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setSaveError(null);
            setEditing({ initial: emptyEoLinkTypeRequest(recordType.id) });
          }}
          data-testid="eo-add-link"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          {t("eo.types.link.add", "Add link type")}
        </button>
      </div>

      {query.isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      ) : query.isError ? (
        <div className="rounded-lg border border-red-300 dark:border-red-700/60 bg-red-50 dark:bg-red-900/20 px-4 py-3">
          <p className="text-sm text-red-800 dark:text-red-300">
            {eoRefusalMessage(
              query.error,
              t("eo.types.link.loadFailed", "Could not read the link types"),
            )}
          </p>
        </div>
      ) : mine.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 px-4 py-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t(
              "eo.types.link.empty",
              "No link type has this record type at either end.",
            )}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <th className={thClass}>
                  {t("eo.types.link.table.link", "Link")}
                </th>
                <th className={thClass}>
                  {t("eo.types.link.table.pairing", "Source → target")}
                </th>
                <th className={thClass}>
                  {t("eo.types.link.table.rules", "Rules")}
                </th>
                <th className={`${thClass} w-24`} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {mine.map((lt) => {
                const r = rules(lt);
                return (
                  <tr
                    key={lt.id}
                    data-testid={`eo-link-${lt.key}`}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="text-sm font-medium text-slate-900 dark:text-white">
                        {localize(
                          lt as unknown as Record<string, unknown>,
                          "label",
                        ) || lt.label}
                      </div>
                      <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                        {lt.key}
                      </div>
                      <div className="mt-1">
                        <Pill>
                          {lt.cardinality === "many"
                            ? t("eo.types.link.manyShort", "many")
                            : t("eo.types.link.oneShort", "one")}
                        </Pill>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center gap-2 flex-wrap">
                        {endpoint(lt.source_type_ids)}
                        <ArrowRight className="w-4 h-4 shrink-0 text-slate-400 rtl:-scale-x-100" />
                        {endpoint(lt.target_type_ids)}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {r.length === 0 ? (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {t(
                            "eo.types.link.noRules",
                            "No rules — a plain reference",
                          )}
                        </span>
                      ) : (
                        <ul className="text-xs text-slate-700 dark:text-slate-300 space-y-0.5 list-disc ps-4">
                          {r.map((x) => (
                            <li key={x}>{x}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          aria-label={t("common.edit", "Edit")}
                          data-testid={`eo-edit-link-${lt.key}`}
                          onClick={() => {
                            setSaveError(null);
                            setEditing({
                              initial: eoLinkTypeRequestFrom(lt),
                              id: lt.id,
                            });
                          }}
                          className="p-2 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-700/60"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={t("common.delete", "Delete")}
                          data-testid={`eo-delete-link-${lt.key}`}
                          onClick={() => {
                            setDeleteError(null);
                            setDeleting(lt);
                          }}
                          className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-700/60"
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

      {editing && (
        <LinkTypeEditor
          initial={editing.initial}
          linkTypeId={editing.id}
          types={types}
          nameOf={nameOf}
          isSaving={createLink.isPending || updateLink.isPending}
          saveError={saveError}
          onSubmit={handleSubmit}
          onClose={() => {
            setEditing(null);
            setSaveError(null);
          }}
        />
      )}

      <Modal
        isOpen={!!deleting}
        onClose={() => {
          setDeleting(null);
          setDeleteError(null);
        }}
        size="lg"
      >
        <ModalHeader>
          <ModalTitle>
            {t("eo.types.link.removeTitle", "Remove this link type?")}
          </ModalTitle>
          <ModalDescription>{deleting?.key}</ModalDescription>
        </ModalHeader>
        <ModalBody className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {t(
              "eo.types.link.removeHint",
              "The server does not check whether any record is already linked with this type. Links that exist keep naming a key that no longer resolves, and the rules above stop applying to them. This affects every type the link connects.",
            )}
          </p>
          {deleteRefusal ? (
            <EoRefusalBanner
              refusal={deleteRefusal}
              testId="eo-link-delete-refusal"
            />
          ) : deleteError ? (
            <div
              data-testid="eo-link-delete-error"
              className="rounded-lg border border-red-300 dark:border-red-700/60 bg-red-50 dark:bg-red-900/20 px-4 py-3"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
                <p className="text-sm text-red-800 dark:text-red-300">
                  {eoRefusalMessage(
                    deleteError,
                    t(
                      "eo.types.link.deleteFailed",
                      "Could not remove that link type",
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
            disabled={deleteLink.isPending}
            data-testid="eo-confirm-delete-link"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
          >
            {deleteLink.isPending && (
              <Loader2 className="w-4 h-4 animate-spin" />
            )}
            {t("eo.types.link.remove", "Remove link type")}
          </button>
        </ModalFooter>
      </Modal>
    </div>
  );
};

export default EoLinksTab;
