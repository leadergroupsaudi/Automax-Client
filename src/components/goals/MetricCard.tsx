import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Hash,
  Percent,
  DollarSign,
  ToggleLeft,
  Weight,
  TrendingUp,
  Trash2,
  ArrowRight,
} from "lucide-react";
import type {
  GoalMetric,
  MetricType,
  AvailableTransition,
} from "../../types/goal";
import { GoalProgressBar } from "./GoalProgressBar";
import {
  useMetricAvailableTransitions,
  useMetricValueChanges,
} from "../../hooks/useGoals";
import { usePermissions } from "../../hooks/usePermissions";
import { PERMISSIONS } from "../../constants/permissions";
import { MetricTransitionModal } from "./MetricTransitionModal";
import { MetricValueChangeHistory } from "./MetricValueChangeHistory";

interface MetricCardProps {
  metric: GoalMetric;
  onUpdateValue: (id: string) => void;
  onDelete?: (id: string) => void;
  canEdit: boolean;
}

const METRIC_TYPE_ICONS: Record<MetricType, React.ReactNode> = {
  Numeric: <Hash className="w-4 h-4" />,
  Percentage: <Percent className="w-4 h-4" />,
  Currency: <DollarSign className="w-4 h-4" />,
  Boolean: <ToggleLeft className="w-4 h-4" />,
};

export const MetricCard: React.FC<MetricCardProps> = ({
  metric,
  onUpdateValue,
  onDelete,
  canEdit,
}) => {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const canApprove = hasPermission(PERMISSIONS.GOALS_APPROVE);

  const [transitionModalOpen, setTransitionModalOpen] = useState(false);

  // Workflow transitions — only fetch when the user can approve. Otherwise
  // viewers waste a request that the backend will reject anyway.
  const { data: transitionsData } = useMetricAvailableTransitions(
    canApprove && metric.id ? metric.id : "",
  );
  const transitions: AvailableTransition[] = transitionsData?.data ?? [];
  const executableTransitions = transitions.filter((tr) => tr.can_execute);

  // Pending value change — show "Pending: <value>" hint inline. Cheap query
  // (one row per metric) and keeps the metric card honest about staged
  // changes.
  const { data: valueChangesData } = useMetricValueChanges(
    metric.goal_id,
    metric.id,
  );
  const pendingChange = (valueChangesData?.data ?? []).find(
    (c) => c.current_state && c.current_state.state_type !== "terminal",
  );
  const hasPendingChange = !!pendingChange;

  // State badge — only worth showing when the metric is mid-flight.
  const stateName = metric.current_state?.name ?? "";
  const stateType = metric.current_state?.state_type ?? "";
  const stateCode = metric.current_state?.code ?? "";
  const isTerminal = stateType === "terminal";
  const isApproved = isTerminal && stateCode === "approved";
  const isRejected = isTerminal && stateCode === "rejected";

  // Map state semantics to the same workflow palette EvidenceCard uses.
  const resolveStateColor = () => {
    const explicit = metric.current_state?.color;
    if (explicit) return explicit;
    if (isApproved) return "#10b981";
    if (isRejected) return "#ef4444";
    if (stateCode.startsWith("changes_requested")) return "#f59e0b";
    return "#3b82f6";
  };
  const stateColor = resolveStateColor();
  // Hide the badge for plain "Approved" terminal — the metric is already
  // in its happy state and the badge becomes visual noise.
  const showStateBadge = !!stateName && !isApproved;

  const formatMetricValue = (value: number, type: MetricType, unit: string) => {
    if (type === "Boolean") {
      return value >= 1
        ? t("goals.components.metric.yes")
        : t("goals.components.metric.no");
    }
    if (type === "Percentage") {
      return `${value}%`;
    }
    if (type === "Currency") {
      return `${unit || "$"}${value.toLocaleString()}`;
    }
    return unit ? `${value.toLocaleString()} ${unit}` : value.toLocaleString();
  };

  return (
    <>
      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/80 p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex-shrink-0">
              {METRIC_TYPE_ICONS[metric.metric_type]}
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                {metric.name}
              </h4>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {t(`goals.components.metricType.${metric.metric_type}`, {
                    defaultValue: metric.metric_type,
                  })}
                  {metric.unit ? ` (${metric.unit})` : ""}
                </span>
                {showStateBadge && (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
                    style={{
                      backgroundColor: `${stateColor}20`,
                      color: stateColor,
                      border: `1px solid ${stateColor}40`,
                    }}
                    title={t("goals.components.metric.pendingState")}
                  >
                    {stateName}
                  </span>
                )}
              </div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300 flex-shrink-0">
            <Weight className="w-3 h-3" />
            {metric.weight}%
          </span>
        </div>

        {/* Values */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="text-center p-2 rounded-lg bg-slate-50 dark:bg-slate-700/30">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">
              {t("goals.components.metric.baseline")}
            </p>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
              {formatMetricValue(
                metric.baseline_value,
                metric.metric_type,
                metric.unit,
              )}
            </p>
          </div>
          <div className="text-center p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">
              {t("goals.components.metric.current")}
            </p>
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-300 tabular-nums">
              {formatMetricValue(
                metric.current_value,
                metric.metric_type,
                metric.unit,
              )}
            </p>
            {hasPendingChange && pendingChange && (
              <p
                className="text-[10px] mt-0.5 font-medium tabular-nums text-amber-600 dark:text-amber-400"
                title={t("goals.components.metric.pendingApproval")}
              >
                {t("goals.components.metric.proposedValue")}:{" "}
                {formatMetricValue(
                  pendingChange.proposed_value,
                  metric.metric_type,
                  metric.unit,
                )}
              </p>
            )}
          </div>
          <div className="text-center p-2 rounded-lg bg-slate-50 dark:bg-slate-700/30">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">
              {t("goals.components.metric.target")}
            </p>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
              {formatMetricValue(
                metric.target_value,
                metric.metric_type,
                metric.unit,
              )}
            </p>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-3">
          <GoalProgressBar progress={metric.progress} size="sm" />
        </div>

        {/* Action Buttons */}
        {canEdit && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => onUpdateValue(metric.id)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <TrendingUp className="w-4 h-4" />
              {t("goals.components.metric.updateValue")}
            </button>
            {onDelete && (
              <button
                onClick={() => onDelete(metric.id)}
                className="flex items-center justify-center p-2 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title={t("goals.components.metric.deleteTitle")}
                aria-label={t("goals.components.metric.deleteTitle")}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Workflow transitions (approver-only) */}
        {canApprove && executableTransitions.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setTransitionModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors"
            >
              <ArrowRight className="w-3.5 h-3.5 rtl:-rotate-180" />
              {executableTransitions.length === 1
                ? executableTransitions[0].transition.name
                : t("goals.components.metric.availableTransitions", {
                    count: executableTransitions.length,
                  })}
            </button>
          </div>
        )}

        {/* Value-change history */}
        <MetricValueChangeHistory
          goalId={metric.goal_id}
          metricId={metric.id}
          unit={metric.unit}
        />
      </div>

      {/* Metric workflow transition modal */}
      <MetricTransitionModal
        metricId={metric.id}
        metricName={metric.name}
        transitions={transitions}
        isOpen={transitionModalOpen}
        onClose={() => setTransitionModalOpen(false)}
      />
    </>
  );
};

export default MetricCard;
