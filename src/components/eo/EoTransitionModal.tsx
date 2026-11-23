import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { X, ArrowRight, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useExecuteEoTransition } from "../../hooks/useEoRecords";
import { useLocalizedField } from "../../hooks/useLocalizedField";
import type {
  EoAvailableTransition,
  EoTransitionRequest,
} from "../../types/eoRecord";

interface EoTransitionModalProps {
  recordId: string;
  recordName: string;
  transitions: EoAvailableTransition[];
  isOpen: boolean;
  onClose: () => void;
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
 *    comment-required is treated as false when absent and the server's
 *    rejection is surfaced as a toast if the configuration says otherwise.
 */
export const EoTransitionModal: React.FC<EoTransitionModalProps> = ({
  recordId,
  recordName,
  transitions,
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const localize = useLocalizedField();
  const [selectedTransitionId, setSelectedTransitionId] = useState<
    string | null
  >(null);
  const [comment, setComment] = useState("");
  const executeTransition = useExecuteEoTransition();

  const selectedTransition = useMemo(
    () => transitions.find((tr) => tr.id === selectedTransitionId) ?? null,
    [transitions, selectedTransitionId],
  );

  const commentRequired = useMemo(() => {
    if (!selectedTransition?.requirements) return false;
    return selectedTransition.requirements.some(
      (r) => r.requirement_type === "comment" && r.is_mandatory,
    );
  }, [selectedTransition]);

  if (!isOpen) return null;

  const handleClose = () => {
    setSelectedTransitionId(null);
    setComment("");
    onClose();
  };

  const handleSubmit = () => {
    if (!selectedTransition) return;
    if (commentRequired && !comment.trim()) return;

    const data: EoTransitionRequest = {
      transition_id: selectedTransition.id,
      comment: comment.trim() || undefined,
    };

    executeTransition.mutate(
      { id: recordId, data },
      {
        onSuccess: () => {
          toast.success(t("eo.transition.success", "Record moved"));
          handleClose();
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
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md mx-4">
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
                        onClick={() => setSelectedTransitionId(tr.id)}
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
