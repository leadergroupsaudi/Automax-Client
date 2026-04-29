import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { useMetricValueChanges } from "../../hooks/useGoals";
import type { MetricValueChange } from "../../types/goal";

interface MetricValueChangeHistoryProps {
  goalId: string;
  metricId: string;
  unit?: string;
  /** Render the section already expanded (used inside transition modals). */
  defaultOpen?: boolean;
}

export const MetricValueChangeHistory: React.FC<
  MetricValueChangeHistoryProps
> = ({ goalId, metricId, unit, defaultOpen = false }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(defaultOpen);

  // Defer the network call until the section is opened — value-change
  // history is rarely the user's primary interest.
  const { data, isLoading } = useMetricValueChanges(
    expanded ? goalId : "",
    expanded ? metricId : "",
  );

  const changes: MetricValueChange[] = data?.data ?? [];

  const formatValue = (value: number) =>
    unit ? `${value.toLocaleString()} ${unit}` : value.toLocaleString();

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="mt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
      >
        <Clock className="w-3.5 h-3.5" />
        {t("goals.components.metric.valueChangeHistory.heading")}
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" />
        )}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {isLoading ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 py-2">
              ...
            </p>
          ) : changes.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 py-2">
              {t("goals.components.metric.valueChangeHistory.empty")}
            </p>
          ) : (
            changes.map((change) => {
              const stateColor = change.current_state?.color ?? "#94a3b8";
              const stateName = change.current_state?.name ?? "";
              const submitterName = change.submitted_by
                ? `${change.submitted_by.first_name} ${change.submitted_by.last_name}`.trim()
                : "—";
              const appliedDate = change.applied_at
                ? formatDate(change.applied_at)
                : null;
              return (
                <div
                  key={change.id}
                  className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-700/30 text-xs"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">
                        {formatValue(change.previous_value)}
                      </span>
                      <ArrowRight className="w-3 h-3 text-slate-400 rtl:-rotate-180" />
                      <span className="font-medium tabular-nums text-slate-900 dark:text-white">
                        {formatValue(change.proposed_value)}
                      </span>
                      {stateName && (
                        <span
                          className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium"
                          style={{
                            backgroundColor: `${stateColor}20`,
                            color: stateColor,
                          }}
                        >
                          {stateName}
                        </span>
                      )}
                    </div>
                    {change.comment && (
                      <p className="text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                        {change.comment}
                      </p>
                    )}
                    <p className="text-slate-400 dark:text-slate-500 mt-0.5 flex flex-wrap gap-x-2">
                      <span>
                        {t(
                          "goals.components.metric.valueChangeHistory.submittedBy",
                        )}
                        : {submitterName}
                      </span>
                      <span>&middot; {formatDate(change.created_at)}</span>
                      {appliedDate && (
                        <span>
                          &middot;{" "}
                          {t(
                            "goals.components.metric.valueChangeHistory.appliedAt",
                          )}
                          : {appliedDate}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default MetricValueChangeHistory;
