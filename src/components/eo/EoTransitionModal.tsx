import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { X, ArrowRight, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useExecuteEoTransition } from "../../hooks/useEoRecords";
import { useLocalizedField } from "../../hooks/useLocalizedField";
import {
  eoErrorMessage,
  eoFieldErrorMap,
  eoRefusalMessage,
} from "../../lib/eoFields";
import { EoFieldInput } from "./EoFieldInput";
import type { TransitionFieldChange } from "../../types";
import type {
  EoAvailableTransition,
  EoFieldDefinition,
  EoTransitionRequest,
  EoValues,
} from "../../types/eoRecord";

interface EoTransitionModalProps {
  recordId: string;
  recordName: string;
  transitions: EoAvailableTransition[];
  /**
   * The record type's effective field definitions. A declared field change
   * names a field KEY; the definition is what says which control to draw.
   */
  fields: EoFieldDefinition[];
  /** Where to send a user who must supply a value this modal cannot take. */
  editPath?: string;
  isOpen: boolean;
  onClose: () => void;
}

interface EoChangeField {
  change: TransitionFieldChange;
  field: EoFieldDefinition;
}

/**
 * EO counterpart of goals/MetricTransitionModal.
 *
 * Two deliberate departures from that model, both forced by the EO API:
 *
 *  - There is no `can_execute` flag to filter on. GET /eo-records/:id/
 *    transitions returns bare WorkflowTransition objects that the transition
 *    service has ALREADY narrowed to what this actor may run, so filtering on
 *    a field that does not exist would empty the list.
 *  - `requirements` is only present when the workflow configures any, so
 *    comment-required is treated as false when absent.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHY THERE ARE TWO WAYS TO SUPPLY A FIELD, AND WHY NEITHER WORKS ALONE
 * ────────────────────────────────────────────────────────────────────────────
 * A transition can be refused for a missing field value in two different
 * ways, and only one of them can be answered from this modal:
 *
 *  1. THE TRANSITION DECLARES THE FIELD. transition.field_changes names it,
 *     and services.applyFieldChanges demands a value for every declared
 *     change whose is_required is set. Those keys — and ONLY those keys — may
 *     appear in the request's `values`: an undeclared key is refused outright
 *     with "is not a field this transition may change", because a transition
 *     is the form its configuration describes, not a second edit path around
 *     the field rules. These are rendered here, below the comment.
 *
 *  2. THE TARGET STATE REQUIRES THE FIELD. ValidateRecordValues runs against
 *     the state being ENTERED, so a field carrying required_at_state can be
 *     reported missing although this transition declares no change for it.
 *     That value cannot be supplied here — it would hit the undeclared-key
 *     refusal above — and the edit form is the only place it can be set. So
 *     the server's own message is shown verbatim, with a link to that form.
 *
 * Posting only {transition_id, comment}, as this component did, made case 1
 * impossible to complete, and reported both cases as "Failed to execute
 * transition" because the refusal carries a field map and no message.
 */
export const EoTransitionModal: React.FC<EoTransitionModalProps> = ({
  recordId,
  recordName,
  transitions,
  fields,
  editPath,
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const localize = useLocalizedField();
  const [selectedTransitionId, setSelectedTransitionId] = useState<
    string | null
  >(null);
  const [comment, setComment] = useState("");
  const [values, setValues] = useState<EoValues>({});
  /** Per-field messages, from the client's own check or from the server. */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  /**
   * Server messages for keys this modal has no control for — case 2 above.
   * Held apart from fieldErrors so they cannot be silently dropped.
   */
  const [elsewhereErrors, setElsewhereErrors] = useState<
    Record<string, string>
  >({});
  /**
   * The server's one-line `error`, which a validation refusal now carries
   * ALONGSIDE `errors` (handlers.eoFieldErrors / eoFieldErrorSummary).
   *
   * It is a HEADLINE, not the answer: it is built from the field map, sorted,
   * and CAPPED AT THREE fields, so on a refusal naming more it says "…and 2
   * more". The `errors` map is the authoritative list and is what gets
   * rendered per field; this only tells the reader what kind of refusal they
   * are looking at, above controls that may be scrolled out of view.
   */
  const [headline, setHeadline] = useState("");
  const executeTransition = useExecuteEoTransition();

  const selectedTransition = useMemo(
    () => transitions.find((tr) => tr.id === selectedTransitionId) ?? null,
    [transitions, selectedTransitionId],
  );

  const fieldByKey = useMemo(
    () => new Map(fields.map((f) => [f.key, f])),
    [fields],
  );

  /**
   * The controls this transition asks for: its declared field changes in
   * configuration order, each paired with the type's own field definition so
   * the right control is drawn.
   *
   * A change naming a key the type does not define is SKIPPED rather than
   * guessed at — there is no definition to render, and a text box posted into
   * a field of unknown kind is a worse answer than none.
   */
  const changeFields = useMemo<EoChangeField[]>(() => {
    const changes = selectedTransition?.field_changes ?? [];
    return [...changes]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((change) => ({ change, field: fieldByKey.get(change.field_name) }))
      .filter((entry): entry is EoChangeField => !!entry.field);
  }, [selectedTransition, fieldByKey]);

  const commentRequired = useMemo(() => {
    if (!selectedTransition?.requirements) return false;
    return selectedTransition.requirements.some(
      (r) => r.requirement_type === "comment" && r.is_mandatory,
    );
  }, [selectedTransition]);

  if (!isOpen) return null;

  const resetErrors = () => {
    setFieldErrors({});
    setElsewhereErrors({});
    setHeadline("");
  };

  const handleClose = () => {
    setSelectedTransitionId(null);
    setComment("");
    setValues({});
    resetErrors();
    onClose();
  };

  const selectTransition = (id: string) => {
    setSelectedTransitionId(id);
    // Each transition declares its own fields; carrying the previous one's
    // answers over would post keys the new transition does not declare.
    setValues({});
    resetErrors();
  };

  const handleValueChange = (key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const isBlank = (v: unknown) =>
    v === undefined ||
    v === null ||
    (typeof v === "string" && v.trim() === "") ||
    (Array.isArray(v) && v.length === 0);

  const handleSubmit = () => {
    if (!selectedTransition) return;
    if (commentRequired && !comment.trim()) return;

    // Client-side required check, so the common case is answered in the
    // reader's own language rather than in the server's English.
    const missing: Record<string, string> = {};
    for (const { change, field } of changeFields) {
      if (change.is_required && isBlank(values[field.key])) {
        missing[field.key] = t(
          "eo.transition.fieldRequired",
          "This value is required for this transition.",
        );
      }
    }
    if (Object.keys(missing).length > 0) {
      resetErrors();
      setFieldErrors(missing);
      return;
    }

    // DECLARED keys only, and only the ones actually answered: an undeclared
    // key is refused outright, and a blank sent for an optional change would
    // clear a value the actor never touched.
    const payloadValues: EoValues = {};
    for (const { field } of changeFields) {
      if (!isBlank(values[field.key])) {
        payloadValues[field.key] = values[field.key];
      }
    }

    const data: EoTransitionRequest = {
      transition_id: selectedTransition.id,
      comment: comment.trim() || undefined,
      ...(Object.keys(payloadValues).length > 0
        ? { values: payloadValues }
        : {}),
    };

    resetErrors();
    executeTransition.mutate(
      { id: recordId, data },
      {
        onSuccess: () => {
          toast.success(t("eo.transition.success", "Record moved"));
          handleClose();
        },
        onError: (error: unknown) => {
          // Split the server's field map: what this modal can fix goes under
          // the control, and what it cannot goes in the banner with the link.
          const serverFields = eoFieldErrorMap(error);
          const mine: Record<string, string> = {};
          const theirs: Record<string, string> = {};
          for (const [key, message] of Object.entries(serverFields)) {
            if (changeFields.some((entry) => entry.field.key === key)) {
              mine[key] = message;
            } else {
              theirs[key] = message;
            }
          }
          setFieldErrors(mine);
          setElsewhereErrors(theirs);

          if (Object.keys(serverFields).length > 0) {
            // A field refusal is answered IN the form, where the reader can
            // act on it, not in a toast that disappears. The server's one
            // line goes above the controls as a headline; the map it was
            // summarised from is already under them, in full.
            setHeadline(eoErrorMessage(error));
          } else {
            // No field map: a conflict, a 403, a 503, a network failure.
            // eoRefusalMessage reaches the generic sentence only when the
            // rejection said nothing at all.
            toast.error(
              eoRefusalMessage(
                error,
                t(
                  "eo.transition.failed",
                  "The record could not be moved. Please try again.",
                ),
              ),
            );
          }
        },
      },
    );
  };

  const getTransitionColor = (tr: EoAvailableTransition) => {
    if (tr.is_rejection) return "red";
    const code = tr.code ?? "";
    if (code.startsWith("approve") || code.startsWith("close")) return "green";
    if (code.startsWith("request_changes") || code.startsWith("return"))
      return "amber";
    return "blue";
  };

  const colorClasses: Record<string, { selected: string; default: string }> = {
    green: {
      selected:
        "border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300",
      default:
        "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-green-300 dark:hover:border-green-700",
    },
    red: {
      selected:
        "border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300",
      default:
        "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-red-300 dark:hover:border-red-700",
    },
    amber: {
      selected:
        "border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300",
      default:
        "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-amber-300 dark:hover:border-amber-700",
    },
    blue: {
      selected:
        "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300",
      default:
        "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-blue-300 dark:hover:border-blue-700",
    },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700/60">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              {t("eo.transition.title", "Move record")}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-[300px]">
              {recordName}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors"
            aria-label={t("common.close")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {transitions.length === 0 ? (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-300">
                {t(
                  "eo.transition.noTransitions",
                  "No transitions are available from this state.",
                )}
              </p>
            </div>
          ) : (
            <>
              {/* The server's one-line summary of a field refusal. A headline
                  only: it is capped at three fields, and the complete map is
                  rendered per control below. */}
              {headline && (
                <div
                  role="alert"
                  className="flex items-start gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
                >
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800 dark:text-red-300">
                    {headline}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                  {t("eo.transition.chooseLabel", "Transition")}
                </label>
                <div
                  className={`grid gap-3 ${transitions.length <= 2 ? "grid-cols-1" : "grid-cols-2"}`}
                >
                  {transitions.map((tr) => {
                    const color = getTransitionColor(tr);
                    const isSelected = selectedTransitionId === tr.id;
                    return (
                      <button
                        key={tr.id}
                        type="button"
                        onClick={() => selectTransition(tr.id)}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                          isSelected
                            ? colorClasses[color].selected
                            : colorClasses[color].default
                        }`}
                      >
                        <ArrowRight className="w-4 h-4 rtl:-rotate-180" />
                        {localize(
                          tr as unknown as Record<string, unknown>,
                          "name",
                        ) || tr.code}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Comment */}
              {selectedTransition && (
                <div>
                  <label
                    htmlFor="eo-transition-comment"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    {t("eo.transition.commentLabel", "Comment")}{" "}
                    {commentRequired ? (
                      <span className="text-red-500">*</span>
                    ) : (
                      <span className="text-slate-400 font-normal">
                        {t("eo.transition.commentOptional", "(optional)")}
                      </span>
                    )}
                  </label>
                  <textarea
                    id="eo-transition-comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    required={commentRequired}
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
                    placeholder={t(
                      "eo.transition.commentPlaceholder",
                      "Why is the record moving?",
                    )}
                  />
                </div>
              )}

              {/* The fields this transition declares — case 1 in the header
                  comment. These are the only keys the server will accept. */}
              {changeFields.length > 0 && (
                <div className="space-y-4 pt-1 border-t border-slate-200 dark:border-slate-700/60">
                  <p className="pt-4 text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t(
                      "eo.transition.fieldsHeading",
                      "This step needs the following",
                    )}
                  </p>
                  {changeFields.map(({ change, field }) => (
                    <EoFieldInput
                      key={field.key}
                      // The configuration's own label and requiredness win
                      // over the type's: a transition may ask for a field the
                      // type calls optional, under a name of its own.
                      field={{
                        ...field,
                        label: change.label || field.label,
                        label_ar: change.label_ar || field.label_ar,
                        required_mode: change.is_required
                          ? "always"
                          : field.required_mode,
                      }}
                      value={values[field.key]}
                      onChange={handleValueChange}
                      error={fieldErrors[field.key]}
                      disabled={executeTransition.isPending}
                      recordId={recordId}
                    />
                  ))}
                </div>
              )}

              {/* Case 2: values the server demands that this modal cannot
                  post. Shown verbatim — they are English by backend design —
                  with the one instruction that can resolve them. */}
              {Object.keys(elsewhereErrors).length > 0 && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-red-800 dark:text-red-300">
                        {t(
                          "eo.transition.blockedByFields",
                          "The record cannot move until these values are set:",
                        )}
                      </p>
                      <ul className="mt-2 space-y-1">
                        {Object.entries(elsewhereErrors).map(
                          ([key, message]) => (
                            <li
                              key={key}
                              className="text-sm text-red-700 dark:text-red-400"
                            >
                              <span className="font-medium">
                                {localize(
                                  (fieldByKey.get(key) ?? {
                                    label: key,
                                  }) as unknown as Record<string, unknown>,
                                  "label",
                                ) || key}
                              </span>
                              {": "}
                              {message}
                            </li>
                          ),
                        )}
                      </ul>
                      <p className="mt-2 text-sm text-red-700 dark:text-red-400">
                        {t(
                          "eo.transition.blockedByFieldsHint",
                          "This step cannot accept them. Set them on the record first, then move it.",
                        )}
                      </p>
                      {editPath && (
                        <Link
                          to={editPath}
                          onClick={handleClose}
                          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-red-700 dark:text-red-300 hover:underline"
                        >
                          {t("eo.transition.goToEdit", "Open the edit form")}
                          <ArrowRight className="w-3.5 h-3.5 rtl:-rotate-180" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={handleClose}
              disabled={executeTransition.isPending}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              {t("common.cancel")}
            </button>
            {transitions.length > 0 && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={
                  !selectedTransition ||
                  executeTransition.isPending ||
                  (commentRequired && !comment.trim())
                }
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {executeTransition.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                {executeTransition.isPending
                  ? t("eo.transition.processing", "Processing…")
                  : t("eo.transition.submit", "Confirm")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EoTransitionModal;
