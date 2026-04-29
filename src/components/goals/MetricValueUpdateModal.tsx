import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, TrendingUp, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import type { GoalMetric } from "../../types/goal";
import {
  useUpdateMetricValue,
  useMetricValueChanges,
} from "../../hooks/useGoals";

interface MetricValueUpdateModalProps {
  metric: GoalMetric;
  isOpen: boolean;
  onClose: () => void;
  goalId: string;
}

export const MetricValueUpdateModal: React.FC<MetricValueUpdateModalProps> = ({
  metric,
  isOpen,
  onClose,
  goalId,
}) => {
  const { t } = useTranslation();
  const [value, setValue] = useState<string>(String(metric.current_value));
  const [comment, setComment] = useState("");
  const updateMetricValue = useUpdateMetricValue();

  // Block double-submission while a value-change is already in flight.
  // Backend will reject anyway; we surface that state up-front.
  const { data: valueChangesData } = useMetricValueChanges(goalId, metric.id);
  const pendingChange = (valueChangesData?.data ?? []).find(
    (c) => c.current_state && c.current_state.state_type !== "terminal",
  );
  const hasPending = !!pendingChange;

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const numValue = Number(value);
    if (isNaN(numValue)) {
      toast.error(t("goals.components.metric.updateModal.errorInvalidNumber"));
      return;
    }

    updateMetricValue.mutate(
      {
        id: metric.id,
        data: {
          value: numValue,
          comment: comment.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          onClose();
          setValue(String(metric.current_value));
          setComment("");
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700/60">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {t("goals.components.metric.updateModal.title")}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {metric.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors"
            aria-label={t("common.close")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Pending warning */}
          {hasPending && pendingChange && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <AlertCircle className="w-4 h-4 mt-0.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <div className="text-xs text-amber-700 dark:text-amber-300">
                <p className="font-medium">
                  {t("goals.components.metric.pendingApproval")}
                </p>
                <p className="mt-0.5">
                  {t("goals.components.metric.proposedValue")}:{" "}
                  <span className="font-semibold tabular-nums">
                    {pendingChange.proposed_value.toLocaleString()}
                    {metric.unit ? ` ${metric.unit}` : ""}
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* Current / Target reference */}
          <div className="flex items-center gap-4 p-3 rounded-lg bg-slate-50 dark:bg-slate-700/30 text-sm">
            <div>
              <span className="text-slate-500 dark:text-slate-400">
                {t("goals.components.metric.updateModal.currentLabel")}{" "}
              </span>
              <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                {metric.current_value}
              </span>
            </div>
            <div className="h-4 w-px bg-slate-300 dark:bg-slate-600" />
            <div>
              <span className="text-slate-500 dark:text-slate-400">
                {t("goals.components.metric.updateModal.targetLabel")}{" "}
              </span>
              <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                {metric.target_value}
              </span>
            </div>
          </div>

          {/* New value */}
          <div>
            <label
              htmlFor="metric-new-value"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              {t("goals.components.metric.updateModal.newValueLabel")}
            </label>
            <input
              id="metric-new-value"
              type="number"
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
              disabled={hasPending}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:opacity-60 disabled:cursor-not-allowed"
              placeholder={t(
                "goals.components.metric.updateModal.newValuePlaceholder",
              )}
            />
          </div>

          {/* Comment */}
          <div>
            <label
              htmlFor="metric-update-comment"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              {t("goals.components.metric.updateModal.commentLabel")}{" "}
              <span className="text-slate-400 font-normal">
                {t("goals.components.metric.updateModal.optional")}
              </span>
            </label>
            <textarea
              id="metric-update-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              disabled={hasPending}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none disabled:opacity-60 disabled:cursor-not-allowed"
              placeholder={t(
                "goals.components.metric.updateModal.commentPlaceholder",
              )}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={updateMetricValue.isPending}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={updateMetricValue.isPending || hasPending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {updateMetricValue.isPending
                ? t("goals.components.metric.updateModal.updating")
                : t("goals.components.metric.updateModal.update")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MetricValueUpdateModal;
