import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Info, Loader2, Plus, Trash2 } from "lucide-react";
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalDescription,
} from "../../ui/Modal";
import { useLocalizedField } from "../../../hooks/useLocalizedField";
import { eoFieldErrorMap, eoServerRefusal } from "../../../lib/eoFields";
import { EoRefusalBanner } from "./EoRefusalBanner";
import {
  EO_FIELD_KINDS,
  EO_PROVENANCES,
  EO_REQUIRED_MODES,
  eoFieldDraftToRequest,
  eoFieldDraftWarnings,
  eoKindConfigShape,
  validateEoFieldDraft,
} from "../../../lib/eoFieldKinds";
import type { EoFieldDraft } from "../../../lib/eoFieldKinds";
import type {
  EoFieldDefRequest,
  EoRecordType,
  EoWorkflowState,
} from "../../../types/eoRecord";

const inputClass =
  "w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none";

const labelClass =
  "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5";

const FieldError: React.FC<{ message?: string }> = ({ message }) =>
  message ? (
    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{message}</p>
  ) : null;

const Hint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{children}</p>
);

export interface EoFieldEditorProps {
  isOpen: boolean;
  onClose: () => void;
  /** The draft to edit — a new one, or a stored definition turned into one. */
  draft: EoFieldDraft;
  /** Set when editing an existing definition; absent when adding. */
  fieldId?: string;
  typeKey: string;
  /** Own keys the type already uses, excluding the one being edited. */
  siblingKeys: string[];
  /**
   * Inherited field key -> the ancestor type key that declares it.
   *
   * It is a MAP and not a resolved string because the key is being typed:
   * the hint has to answer for whatever is in the box right now. Resolving it
   * in the caller against the draft the editor opened with would have meant
   * the hint could never appear while ADDING a field — the opening draft's
   * key is empty — which is the case it exists for.
   */
  inheritedKeyOwners: Map<string, string>;
  types: EoRecordType[];
  /** The type's workflow states, for at-state requiredness and locking. */
  states: EoWorkflowState[];
  /** False when the type has no workflow, or its states could not be read. */
  statesAvailable: boolean;
  /** Why the states are unavailable, when they are. */
  statesUnavailableReason?: string;
  // eslint-disable-next-line no-unused-vars
  onSubmit: (data: EoFieldDefRequest) => Promise<void>;
  isSaving: boolean;
  /** The rejection of the last submit, if it was rejected. */
  saveError: unknown;
}

/**
 * The editor for ONE field definition.
 *
 * Its reason for existing is the configuration section: the server validates
 * a field's SHAPE — a non-empty key and label, a kind from the allow-list, an
 * allow-listed provenance and required_mode, and a formula on a derived field
 * — and has no opinion at all about `config`, `required_rule` or
 * `required_at_state_ids`. A dropdown with no options, a conditional
 * requiredness with no rule and an at-state requiredness with no states all
 * store cleanly and produce a field that is either unfillable or quietly
 * inert. This form refuses all three before the request goes out, and says
 * which one it is refusing.
 *
 * Validation runs over the MERGED configuration rather than over the
 * structured editors' state — see `eoDraftConfig` — so the checks fire for
 * the JSON a person can type as well as for the rows they can click.
 */
export const EoFieldEditor: React.FC<EoFieldEditorProps> = ({
  isOpen,
  onClose,
  draft: initialDraft,
  fieldId,
  typeKey,
  siblingKeys,
  inheritedKeyOwners,
  types,
  states,
  statesAvailable,
  statesUnavailableReason,
  onSubmit,
  isSaving,
  saveError,
}) => {
  const { t } = useTranslation();
  const localize = useLocalizedField();
  const [draft, setDraft] = useState<EoFieldDraft>(initialDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);

  // A fresh open is a fresh draft; the modal is not unmounted between rows.
  useEffect(() => {
    if (!isOpen) return;
    setDraft(initialDraft);
    setErrors({});
    setShowAdvanced(false);
  }, [isOpen, initialDraft]);

  const set = <K extends keyof EoFieldDraft>(
    key: K,
    value: EoFieldDraft[K],
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key as string] && !prev.submit) return prev;
      const next = { ...prev };
      delete next[key as string];
      delete next.submit;
      return next;
    });
  };

  const configShape = eoKindConfigShape(draft.kind);
  const overriddenFrom = inheritedKeyOwners.get(draft.key.trim());
  /**
   * The types the picker offers: a link points at RECORDS, and an abstract
   * type holds none of its own.
   */
  const targetable = useMemo(
    () => types.filter((x) => !x.is_abstract),
    [types],
  );
  /**
   * A stored `target_type_key` the PICKER cannot show — unknown to the
   * catalogue, or known and abstract. It gets an option of its own so that it
   * is visible and refusable instead of falling into the gap between the two:
   * before this, an abstract key passed validation and went out on the wire
   * while the select read "Any record type".
   */
  const unresolvedTarget =
    configShape === "target" &&
    draft.target_type_key.trim() &&
    !targetable.some((x) => x.key === draft.target_type_key.trim())
      ? draft.target_type_key.trim()
      : "";
  const unresolvedTargetIsAbstract = types.some(
    (x) => x.key === unresolvedTarget && x.is_abstract,
  );
  const translate = useMemo(
    () => (key: string, fallback: string) => t(key, fallback),
    [t],
  );
  const warnings = eoFieldDraftWarnings(draft, translate);

  const refusal = eoServerRefusal(saveError);

  const setOption = (
    index: number,
    key: "value" | "label" | "label_ar",
    value: string,
  ) => {
    setDraft((prev) => ({
      ...prev,
      options: prev.options.map((o, i) =>
        i === index ? { ...o, [key]: value } : o,
      ),
    }));
    setErrors((prev) => {
      if (!prev.config_options && !prev.submit) return prev;
      const next = { ...prev };
      delete next.config_options;
      delete next.submit;
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clientErrors = validateEoFieldDraft(draft, {
      siblingKeys,
      types,
      statesAvailable,
      t: translate,
    });
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }
    const body = eoFieldDraftToRequest(draft);
    if (!body) {
      // Unreachable: validateEoFieldDraft refuses both JSON sections first.
      // Kept because the conversion is the only other place that can decide
      // the draft is unusable, and a silent no-op submit is worse than a
      // message nobody should see.
      setErrors({
        submit: t(
          "eo.types.field.errors.configJson",
          "Configuration must be a JSON object, for example {}",
        ),
      });
      return;
    }
    try {
      await onSubmit(body);
    } catch (error) {
      // The per-attribute map is authoritative; the headline is capped at
      // three and goes to the banner. Same mapping as
      // admin/IncidentCreatePage.tsx:913-938.
      setErrors((prev) => ({ ...prev, ...eoFieldErrorMap(error) }));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="3xl">
      <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
        <ModalHeader>
          <ModalTitle>
            {fieldId
              ? t("eo.types.field.edit", "Edit field")
              : t("eo.types.field.add", "Add field")}
          </ModalTitle>
          <ModalDescription>
            {t("eo.types.field.onType", {
              key: typeKey,
              defaultValue: `On record type ${typeKey}`,
            })}
          </ModalDescription>
        </ModalHeader>

        <ModalBody className="space-y-5">
          {/* Not a field error — no attribute of the field is wrong — so it
              sits above the form in full. It is where Task F5's confirmation
              attaches. */}
          {refusal && (
            <EoRefusalBanner
              refusal={refusal}
              testId="eo-field-destructive-refusal"
            />
          )}
          {errors.submit && (
            <div className="rounded-lg border border-red-300 dark:border-red-700/60 bg-red-50 dark:bg-red-900/20 px-4 py-3">
              <p className="text-sm text-red-800 dark:text-red-300">
                {errors.submit}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass} htmlFor="eo-field-key">
                {t("eo.types.field.key", "Key")}{" "}
                <span className="text-red-500">*</span>
              </label>
              <input
                id="eo-field-key"
                className={`${inputClass} font-mono`}
                value={draft.key}
                onChange={(e) => set("key", e.target.value)}
              />
              <FieldError message={errors.key} />
              {overriddenFrom && (
                <Hint>
                  {t("eo.types.field.overridesHint", {
                    owner: overriddenFrom,
                    defaultValue: `This key is also declared by ${overriddenFrom}. This definition replaces it, in that type's position on every form.`,
                  })}
                </Hint>
              )}
            </div>

            <div>
              <label className={labelClass} htmlFor="eo-field-kind">
                {t("eo.types.field.kind", "Kind")}{" "}
                <span className="text-red-500">*</span>
              </label>
              <select
                id="eo-field-kind"
                className={inputClass}
                value={draft.kind}
                onChange={(e) =>
                  set("kind", e.target.value as EoFieldDraft["kind"])
                }
              >
                <option value="">
                  {t("eo.types.field.chooseKind", "Choose a kind…")}
                </option>
                {EO_FIELD_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`eo.kind.${kind}`, kind)}
                  </option>
                ))}
              </select>
              <FieldError message={errors.kind} />
            </div>

            <div>
              <label className={labelClass} htmlFor="eo-field-label">
                {t("eo.types.field.label", "Label")}{" "}
                <span className="text-red-500">*</span>
              </label>
              <input
                id="eo-field-label"
                className={inputClass}
                value={draft.label}
                onChange={(e) => set("label", e.target.value)}
              />
              <FieldError message={errors.label} />
            </div>

            <div>
              <label className={labelClass} htmlFor="eo-field-label-ar">
                {t("eo.types.field.labelAr", "Label (Arabic)")}
              </label>
              <input
                id="eo-field-label-ar"
                className={inputClass}
                dir="rtl"
                value={draft.label_ar}
                onChange={(e) => set("label_ar", e.target.value)}
              />
              <Hint>
                {t(
                  "eo.types.field.labelArHint",
                  "Left empty, forms fall back to the English label.",
                )}
              </Hint>
            </div>
          </div>

          {warnings.length > 0 && (
            <div className="rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/60 px-4 py-3 space-y-1.5">
              {warnings.map((warning) => (
                <div key={warning} className="flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 text-slate-500 dark:text-slate-400 mt-0.5" />
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {warning}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* ── configuration, per kind ─────────────────────────────── */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-3">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {t("eo.types.field.configuration", "Configuration")}
            </h4>

            {configShape === "options" && (
              <div data-testid="eo-field-options">
                {/* A static list or an option source, never both: spec §7.3
                    allows either, and declaring both leaves which one governs
                    up to whatever reads it first. A mode switch is what makes
                    the structured editor unable to produce that state. */}
                <label className={labelClass} htmlFor="eo-field-option-mode">
                  {t("eo.types.field.optionMode", "Choices come from")}
                </label>
                <select
                  id="eo-field-option-mode"
                  className={`${inputClass} mb-3`}
                  value={draft.option_mode}
                  onChange={(e) =>
                    set(
                      "option_mode",
                      e.target.value as EoFieldDraft["option_mode"],
                    )
                  }
                >
                  <option value="list">
                    {t("eo.types.field.optionModeList", "A list defined here")}
                  </option>
                  <option value="source">
                    {t(
                      "eo.types.field.optionModeSource",
                      "A source resolved at render time",
                    )}
                  </option>
                </select>

                {draft.option_mode === "source" ? (
                  <div
                    className="space-y-3"
                    data-testid="eo-field-option-source"
                  >
                    <div>
                      <label
                        className={labelClass}
                        htmlFor="eo-field-option-source"
                      >
                        {t("eo.types.field.optionSource", "Option source")}{" "}
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="eo-field-option-source"
                        className={`${inputClass} font-mono`}
                        dir="ltr"
                        value={draft.option_source}
                        onChange={(e) => set("option_source", e.target.value)}
                      />
                      <Hint>
                        {t(
                          "eo.types.field.optionSourceHint",
                          "Spec §7.3 allows a lookup category, org units, users by role, workflow states, or a query over records of a type. Only lookup_category has an agreed spelling today.",
                        )}
                      </Hint>
                    </div>
                    {draft.option_source.trim() === "lookup_category" && (
                      <div>
                        <label
                          className={labelClass}
                          htmlFor="eo-field-lookup-code"
                        >
                          {t(
                            "eo.types.field.lookupCategoryCode",
                            "Lookup category code",
                          )}{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="eo-field-lookup-code"
                          className={`${inputClass} font-mono`}
                          dir="ltr"
                          value={draft.lookup_category_code}
                          onChange={(e) =>
                            set("lookup_category_code", e.target.value)
                          }
                        />
                      </div>
                    )}
                    <FieldError message={errors.config_options} />
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                      {t(
                        "eo.types.field.optionsHint",
                        "The choices this field offers. The value is what is stored on the record; the label is what is shown.",
                      )}
                    </p>
                    <div className="space-y-2">
                      {draft.options.map((option, index) => (
                        <div
                          key={index}
                          className="flex items-start gap-2 flex-wrap sm:flex-nowrap"
                        >
                          <input
                            aria-label={t(
                              "eo.types.field.optionValue",
                              "Value",
                            )}
                            placeholder={t(
                              "eo.types.field.optionValue",
                              "Value",
                            )}
                            className={`${inputClass} font-mono sm:w-1/3`}
                            value={option.value}
                            onChange={(e) =>
                              setOption(index, "value", e.target.value)
                            }
                          />
                          <input
                            aria-label={t(
                              "eo.types.field.optionLabel",
                              "Label",
                            )}
                            placeholder={t(
                              "eo.types.field.optionLabel",
                              "Label",
                            )}
                            className={`${inputClass} sm:w-1/3`}
                            value={option.label}
                            onChange={(e) =>
                              setOption(index, "label", e.target.value)
                            }
                          />
                          <input
                            aria-label={t(
                              "eo.types.field.optionLabelAr",
                              "Label (Arabic)",
                            )}
                            placeholder={t(
                              "eo.types.field.optionLabelAr",
                              "Label (Arabic)",
                            )}
                            dir="rtl"
                            className={`${inputClass} sm:w-1/3`}
                            value={option.label_ar}
                            onChange={(e) =>
                              setOption(index, "label_ar", e.target.value)
                            }
                          />
                          <button
                            type="button"
                            aria-label={t(
                              "eo.types.field.removeOption",
                              "Remove option",
                            )}
                            onClick={() =>
                              set(
                                "options",
                                draft.options.filter((_, i) => i !== index),
                              )
                            }
                            className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      data-testid="eo-field-add-option"
                      onClick={() =>
                        set("options", [
                          ...draft.options,
                          { value: "", label: "", label_ar: "" },
                        ])
                      }
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      {t("eo.types.field.addOption", "Add option")}
                    </button>
                    <FieldError message={errors.config_options} />
                  </>
                )}
              </div>
            )}

            {configShape === "target" && (
              <div data-testid="eo-field-target">
                <label className={labelClass} htmlFor="eo-field-target">
                  {t("eo.types.field.targetType", "Target record type")}
                </label>
                <select
                  id="eo-field-target"
                  className={inputClass}
                  value={draft.target_type_key}
                  onChange={(e) => set("target_type_key", e.target.value)}
                >
                  <option value="">
                    {t(
                      "eo.types.field.targetAny",
                      "Any record type — not narrowed",
                    )}
                  </option>
                  {/* A stored target the picker cannot show: a type that was
                      deleted or re-keyed, or an ABSTRACT one, which holds no
                      records of its own and so can never be pointed at.
                      Without an option of its own the select rendered blank
                      and read as "Any record type", so neither case was
                      distinguishable from a field nobody had narrowed — and
                      the abstract one went out on the wire. */}
                  {unresolvedTarget && (
                    <option value={unresolvedTarget}>
                      {unresolvedTargetIsAbstract
                        ? t("eo.types.field.targetAbstractOption", {
                            key: unresolvedTarget,
                            defaultValue: `${unresolvedTarget} — abstract, holds no records`,
                          })
                        : t("eo.types.field.targetUnknownOption", {
                            key: unresolvedTarget,
                            defaultValue: `${unresolvedTarget} — no record type has this key`,
                          })}
                    </option>
                  )}
                  {targetable.map((x) => (
                    <option key={x.id} value={x.key}>
                      {localize(
                        x as unknown as Record<string, unknown>,
                        "name",
                      ) || x.name}{" "}
                      ({x.key})
                    </option>
                  ))}
                </select>
                <Hint>
                  {t(
                    "eo.types.field.targetHint",
                    "Left as any type, the record picker searches every register and names each result's type. Narrowing it is a deliberate choice, not a requirement.",
                  )}
                </Hint>
                <FieldError message={errors.config_target} />
              </div>
            )}

            {configShape === "none" && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {draft.kind
                  ? t(
                      "eo.types.field.noConfig",
                      "This kind needs no further configuration.",
                    )
                  : t(
                      "eo.types.field.kindFirst",
                      "Choose a kind to see what it needs configured.",
                    )}
              </p>
            )}

            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              {showAdvanced
                ? t("eo.types.field.hideRawConfig", "Hide raw configuration")
                : t("eo.types.field.showRawConfig", "Raw configuration (JSON)")}
            </button>
            {showAdvanced && (
              <div>
                <textarea
                  id="eo-field-config-rest"
                  rows={5}
                  spellCheck={false}
                  className={`${inputClass} font-mono text-xs`}
                  dir="ltr"
                  value={draft.config_rest}
                  onChange={(e) => set("config_rest", e.target.value)}
                />
                <Hint>
                  {configShape === "none"
                    ? t(
                        "eo.types.field.rawConfigHint",
                        "Stored on the field as-is. Nothing in the record forms reads it yet.",
                      )
                    : t(
                        "eo.types.field.rawConfigHintStructured",
                        "Anything in the configuration that the section above does not edit. It is kept, not replaced, when the field is saved.",
                      )}
                </Hint>
                <FieldError message={errors.config_rest} />
              </div>
            )}
          </section>

          {/* ── requiredness ────────────────────────────────────────── */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-3">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {t("eo.types.field.requiredness", "Requiredness")}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className={labelClass} htmlFor="eo-field-required-mode">
                  {t("eo.types.field.requiredMode", "Required")}
                </label>
                <select
                  id="eo-field-required-mode"
                  className={inputClass}
                  value={draft.required_mode}
                  onChange={(e) => set("required_mode", e.target.value)}
                >
                  {EO_REQUIRED_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {t(`eo.requiredMode.${mode}`, mode)}
                    </option>
                  ))}
                </select>
                <FieldError message={errors.required_mode} />
              </div>

              <div>
                <label className={labelClass} htmlFor="eo-field-provenance">
                  {t("eo.types.field.provenance", "Filled by")}
                </label>
                <select
                  id="eo-field-provenance"
                  className={inputClass}
                  value={draft.provenance}
                  onChange={(e) => set("provenance", e.target.value)}
                >
                  {EO_PROVENANCES.map((p) => (
                    <option key={p} value={p}>
                      {t(`eo.provenance.${p}`, p)}
                    </option>
                  ))}
                </select>
                <FieldError message={errors.provenance} />
              </div>
            </div>

            {draft.required_mode === "conditional" && (
              <div data-testid="eo-field-required-rule">
                <label className={labelClass} htmlFor="eo-field-required-rule">
                  {t("eo.types.field.requiredRule", "Rule")}{" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  id="eo-field-required-rule"
                  className={`${inputClass} font-mono`}
                  dir="ltr"
                  value={draft.required_rule}
                  onChange={(e) => set("required_rule", e.target.value)}
                />
                <Hint>
                  {t(
                    "eo.types.field.requiredRuleHint",
                    'A formula over the record\'s other fields, for example: directive_origin in ["correspondence", "official_visit"]',
                  )}
                </Hint>
                <FieldError message={errors.required_rule} />
              </div>
            )}

            {draft.required_mode === "at_state" && (
              <div data-testid="eo-field-required-states">
                <span className={labelClass}>
                  {t("eo.types.field.requiredAtStates", "Required at states")}{" "}
                  <span className="text-red-500">*</span>
                </span>
                {statesAvailable ? (
                  <div className="flex flex-wrap gap-2">
                    {states.map((state) => {
                      const on = draft.required_at_state_ids.includes(state.id);
                      return (
                        <button
                          key={state.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            set(
                              "required_at_state_ids",
                              on
                                ? draft.required_at_state_ids.filter(
                                    (x) => x !== state.id,
                                  )
                                : [...draft.required_at_state_ids, state.id],
                            )
                          }
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                            on
                              ? "bg-blue-600 text-white border-blue-600"
                              : "border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60"
                          }`}
                        >
                          {localize(
                            state as unknown as Record<string, unknown>,
                            "name",
                          ) || state.name}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    {statesUnavailableReason ??
                      t(
                        "eo.types.field.statesUnavailable",
                        "This record type's workflow states could not be read.",
                      )}
                  </p>
                )}
                <FieldError message={errors.required_at_state_ids} />
              </div>
            )}

            {draft.provenance === "derived" && (
              <div className="space-y-3" data-testid="eo-field-derived">
                <div>
                  <label className={labelClass} htmlFor="eo-field-formula">
                    {t("eo.types.field.formula", "Formula")}{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="eo-field-formula"
                    className={`${inputClass} font-mono`}
                    dir="ltr"
                    value={draft.formula}
                    onChange={(e) => set("formula", e.target.value)}
                  />
                  <FieldError message={errors.formula} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="eo-field-recompute">
                    {t("eo.types.field.recomputeOn", "Recompute on")}
                  </label>
                  <textarea
                    id="eo-field-recompute"
                    rows={4}
                    spellCheck={false}
                    dir="ltr"
                    className={`${inputClass} font-mono text-xs`}
                    value={draft.recompute_on}
                    onChange={(e) => set("recompute_on", e.target.value)}
                  />
                  <Hint>
                    {t(
                      "eo.types.field.recomputeOnHint",
                      'A JSON array of dependencies, for example: [{"type":"eo_task","field":"completion_rate","scope":"child","aggregates":["avg"]}]',
                    )}
                  </Hint>
                  <FieldError message={errors.recompute_on} />
                </div>
              </div>
            )}
          </section>

          {/* ── presentation and behaviour ───────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass} htmlFor="eo-field-sort">
                {t("eo.types.field.sortOrder", "Sort order")}
              </label>
              <input
                id="eo-field-sort"
                type="number"
                className={inputClass}
                value={draft.sort_order}
                onChange={(e) =>
                  set("sort_order", Number.parseInt(e.target.value, 10) || 0)
                }
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="eo-field-locked">
                {t("eo.types.field.lockedAfter", "Locked after state")}
              </label>
              <select
                id="eo-field-locked"
                className={inputClass}
                disabled={!statesAvailable}
                value={draft.is_locked_after_state_id}
                onChange={(e) =>
                  set("is_locked_after_state_id", e.target.value)
                }
              >
                <option value="">
                  {t("eo.types.field.neverLocked", "Never locked")}
                </option>
                {states.map((state) => (
                  <option key={state.id} value={state.id}>
                    {localize(
                      state as unknown as Record<string, unknown>,
                      "name",
                    ) || state.name}
                  </option>
                ))}
              </select>
              {!statesAvailable && (
                <Hint>
                  {statesUnavailableReason ??
                    t(
                      "eo.types.field.statesUnavailable",
                      "This record type's workflow states could not be read.",
                    )}
                </Hint>
              )}
            </div>
            <div className="md:col-span-2">
              <label className={labelClass} htmlFor="eo-field-help">
                {t("eo.types.field.helpText", "Help text")}
              </label>
              <input
                id="eo-field-help"
                className={inputClass}
                value={draft.help_text}
                onChange={(e) => set("help_text", e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass} htmlFor="eo-field-help-ar">
                {t("eo.types.field.helpTextAr", "Help text (Arabic)")}
              </label>
              <input
                id="eo-field-help-ar"
                className={inputClass}
                dir="rtl"
                value={draft.help_text_ar}
                onChange={(e) => set("help_text_ar", e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={draft.is_indexed}
                  onChange={(e) => set("is_indexed", e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-600"
                />
                {t(
                  "eo.types.field.isIndexed",
                  "Indexed — searchable and filterable in the register",
                )}
              </label>
            </div>
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
            type="submit"
            disabled={isSaving}
            data-testid="eo-field-save"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            {fieldId
              ? t("eo.types.field.save", "Save field")
              : t("eo.types.field.create", "Add field")}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
};

export default EoFieldEditor;
