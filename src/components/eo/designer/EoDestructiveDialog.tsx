import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
  Modal,
  ModalBody,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "../../ui/Modal";
import {
  eoRefusalMessage,
  eoServerRefusal,
  type EoFieldDestructiveChange,
} from "../../../lib/eoFields";
import type { EoDestructiveConfirmation } from "../../../types/eoRecord";
import { EoRefusalBanner } from "./EoRefusalBanner";

/** models.eoMaxConfirmationReason, counted in characters. */
export const EO_MAX_CONFIRMATION_REASON = 1000;

/**
 * Spec §7.14's confirmed destructive edit.
 *
 * IT STATES WHAT WILL HAPPEN rather than asking whether the administrator is
 * sure: the type, the field, the specific change and its consequence. The
 * consequence is the §7.14 one — nothing is deleted. A removed field's values
 * stay in each record's `values` jsonb, so a mistaken removal is recoverable,
 * and that is said because it changes how carefully someone has to decide.
 *
 * THE REASON IS REQUIRED AND NEVER PRE-FILLED. It is the "backfill rule" the
 * server demands (what will be done about the records this leaves behind),
 * it is recorded in the action log against the administrator, and a field
 * that started with text in it would be confirmed by a click that read
 * nothing.
 *
 * A confirmation authorises ONE change. When the edit makes several, the
 * server refuses it even with a confirmation, and this dialog says so up
 * front instead of letting the administrator type a reason for a request
 * that cannot succeed.
 *
 * A second refusal (a confirmation that does not match, or one the server
 * finds malformed) lands in the same EoRefusalBanner the first one did.
 */
export const EoDestructiveDialog: React.FC<{
  isOpen: boolean;
  typeKey: string;
  change: EoFieldDestructiveChange;
  /** How many destructive changes the edit makes in all. */
  changeCount: number;
  isSaving: boolean;
  error: unknown;
  // eslint-disable-next-line no-unused-vars
  onConfirm: (confirmation: EoDestructiveConfirmation) => void;
  onCancel: () => void;
}> = ({
  isOpen,
  typeKey,
  change,
  changeCount,
  isSaving,
  error,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);

  // No reset effect: the caller mounts this per confirmation, so a reason
  // belongs to one change and cannot leak into the next.

  const field = change.fieldKey;
  const vars = {
    field,
    type: typeKey,
    newKey: change.renamedTo ?? "",
    from: change.from ?? "",
    to: change.to ?? "",
  };

  let what: string;
  let consequence: string;
  if (change.change === "field_removed" && change.renamedTo !== undefined) {
    what = t("eo.types.destructive.what.rename", {
      ...vars,
      defaultValue: `Rename field ${field} to ${vars.newKey} on ${typeKey}. Fields are matched by key, so the server treats this as removing ${field}.`,
    });
    consequence = t("eo.types.destructive.consequence.rename", {
      ...vars,
      defaultValue: `Nothing is deleted. Values already saved under ${field} stay stored in each record, so a mistaken rename can be recovered; until then nothing will display, validate or derive from them, and ${vars.newKey} starts empty.`,
    });
  } else if (change.change === "field_removed") {
    what = t("eo.types.destructive.what.removed", {
      ...vars,
      defaultValue: `Remove the definition of field ${field} from ${typeKey}.`,
    });
    consequence = t("eo.types.destructive.consequence.removed", {
      ...vars,
      defaultValue: `Nothing is deleted. Values already saved under ${field} stay stored in each record, so a mistaken removal can be recovered; until then nothing will display, validate or derive from them.`,
    });
  } else if (change.change === "field_kind") {
    what = t("eo.types.destructive.what.kind", {
      ...vars,
      defaultValue: `Change the kind of field ${field} on ${typeKey} from ${vars.from} to ${vars.to}.`,
    });
    consequence = t("eo.types.destructive.consequence.kind", {
      ...vars,
      defaultValue:
        "Nothing is rewritten. Values already saved keep the form they were stored in, and may not read correctly as the new kind.",
    });
  } else {
    what = t("eo.types.destructive.what.required", {
      ...vars,
      defaultValue: `Make field ${field} on ${typeKey}, which is optional today, required (${vars.to}).`,
    });
    consequence = t("eo.types.destructive.consequence.required", {
      ...vars,
      defaultValue:
        "Records that exist are not changed. Any without a value do not meet the new requirement, and may be refused when next saved or moved.",
    });
  }

  const trimmed = reason.trim();
  const length = Array.from(reason).length;
  const tooLong = length > EO_MAX_CONFIRMATION_REASON;
  const missing = touched && trimmed === "";
  const blocked = changeCount > 1;

  const submit = () => {
    setTouched(true);
    if (trimmed === "" || tooLong || blocked) return;
    onConfirm({
      type_key: typeKey,
      field_key: field,
      change: change.change,
      reason: trimmed,
    });
  };

  const refusal = eoServerRefusal(error);

  return (
    <Modal isOpen={isOpen} onClose={onCancel} size="lg">
      <ModalHeader>
        <ModalTitle>
          {t("eo.types.destructive.title", "Confirm a destructive change")}
        </ModalTitle>
        <ModalDescription>
          {t("eo.types.destructive.onType", {
            type: typeKey,
            defaultValue: `On record type ${typeKey}`,
          })}
        </ModalDescription>
      </ModalHeader>
      <ModalBody className="space-y-4">
        <dl
          className="space-y-3 text-sm"
          data-testid="eo-destructive-summary"
          data-change={change.change}
        >
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t("eo.types.destructive.whatLabel", "What will happen")}
            </dt>
            <dd className="mt-1 text-slate-900 dark:text-white">{what}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t("eo.types.destructive.consequenceLabel", "Consequence")}
            </dt>
            <dd className="mt-1 text-slate-700 dark:text-slate-300">
              {consequence}
            </dd>
          </div>
        </dl>

        {blocked && (
          <p
            data-testid="eo-destructive-multiple"
            className="rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300"
          >
            {t("eo.types.destructive.multiple", {
              count: changeCount,
              defaultValue: `This edit makes ${changeCount} destructive changes, and a confirmation authorises only one. The server will refuse it. Go back and make them one at a time.`,
            })}
          </p>
        )}

        <div>
          <label
            htmlFor="eo-destructive-reason"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            {t(
              "eo.types.destructive.reasonLabel",
              "What will be done about the records this leaves behind",
            )}{" "}
            <span className="text-red-500">*</span>
          </label>
          <textarea
            id="eo-destructive-reason"
            data-testid="eo-destructive-reason"
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={missing || tooLong}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="mt-1 flex items-start justify-between gap-3 text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              {t(
                "eo.types.destructive.reasonHint",
                "Required. It is recorded in the action log under your name, next to this change.",
              )}
            </span>
            <span
              className={
                tooLong
                  ? "text-red-600 dark:text-red-400"
                  : "text-slate-400 dark:text-slate-500"
              }
              dir="ltr"
            >
              {length} / {EO_MAX_CONFIRMATION_REASON}
            </span>
          </div>
          {missing && (
            <p
              data-testid="eo-destructive-reason-error"
              className="mt-1 text-xs text-red-600 dark:text-red-400"
            >
              {t(
                "eo.types.destructive.reasonRequired",
                "State the rule: this change cannot be confirmed without it.",
              )}
            </p>
          )}
          {tooLong && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              {t("eo.types.destructive.reasonTooLong", {
                max: EO_MAX_CONFIRMATION_REASON,
                defaultValue: `The rule can be at most ${EO_MAX_CONFIRMATION_REASON} characters.`,
              })}
            </p>
          )}
        </div>

        {refusal ? (
          <EoRefusalBanner
            refusal={refusal}
            testId="eo-destructive-second-refusal"
          />
        ) : error ? (
          <p
            data-testid="eo-destructive-failure"
            className="rounded-lg border border-red-300 dark:border-red-700/60 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-800 dark:text-red-300"
          >
            {eoRefusalMessage(
              error,
              t(
                "eo.types.destructive.failed",
                "Could not apply the confirmed change",
              ),
            )}
          </p>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors"
        >
          {t("common.cancel", "Cancel")}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={isSaving || blocked}
          data-testid="eo-destructive-confirm"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
        >
          {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
          {t("eo.types.destructive.confirm", "Confirm and apply this change")}
        </button>
      </ModalFooter>
    </Modal>
  );
};

export default EoDestructiveDialog;
