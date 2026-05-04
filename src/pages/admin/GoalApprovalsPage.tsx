import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ClipboardCheck,
  Clock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  User,
  FileText,
  BarChart3,
  LineChart,
  Inbox,
} from "lucide-react";
import {
  usePendingApprovals,
  useCompletedApprovals,
  useEvidenceTransitions,
  usePendingMetricApprovals,
  usePendingMetricValueChangeApprovals,
  useMetricAvailableTransitions,
  useValueChangeAvailableTransitions,
} from "../../hooks/useGoals";
import type {
  ApprovalListItem,
  MetricApprovalListItem,
  MetricValueChangeApprovalListItem,
} from "../../types/goal";
import { GoalPriorityBadge } from "../../components/goals/GoalPriorityBadge";
import { EvidenceTransitionModal } from "../../components/goals/EvidenceTransitionModal";
import { MetricTransitionModal } from "../../components/goals/MetricTransitionModal";
import { MetricValueChangeTransitionModal } from "../../components/goals/MetricValueChangeTransitionModal";
import { useGoalListWebSocket } from "../../lib/services/goalListWebSocket";

type TabType = "pending" | "completed";
type PendingSubTab = "evidence" | "metrics" | "value-changes";

// ── Helpers ────────────────────────────────────────────
const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

// ── Sub-components (outside render) ────────────────────

const ApprovalPagination: React.FC<{
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
}> = ({ page, totalPages, total, limit, onPageChange }) => {
  const { t } = useTranslation();
  if (totalPages <= 1) return null;

  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700/60">
      <p className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
        {t("goals.approvals.showing", { from: startItem, to: endItem, total })}
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4 rtl:-rotate-180" />
          {t("goals.approvals.previous")}
        </button>
        <span className="text-sm text-slate-500 dark:text-slate-400 tabular-nums px-2">
          {t("goals.approvals.pageOf", { current: page, total: totalPages })}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t("goals.approvals.next")}
          <ChevronRight className="w-4 h-4 rtl:-rotate-180" />
        </button>
      </div>
    </div>
  );
};

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/80 p-12 text-center">
    <Inbox className="w-12 h-12 mx-auto mb-4 text-slate-300 dark:text-slate-600" />
    <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
  </div>
);

const LoadingState: React.FC = () => (
  <div className="flex items-center justify-center py-20">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
  </div>
);

// ── Evidence row (existing) ────────────────────────────
const PendingEvidenceRow: React.FC<{
  item: ApprovalListItem;
  onReview: (item: ApprovalListItem) => void;
  getUserName: (
    item: ApprovalListItem | MetricApprovalListItem | MetricValueChangeApprovalListItem,
  ) => string;
}> = ({ item, onReview, getUserName }) => {
  const { t } = useTranslation();
  return (
    <tr className="border-b border-slate-100 dark:border-slate-700/40 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
      <td className="px-4 py-3">
        <Link
          to={`/goals/${item.goal_id}`}
          className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
        >
          {item.goal_title}
        </Link>
        <div className="mt-0.5">
          <GoalPriorityBadge priority={item.goal_priority} />
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm text-slate-700 dark:text-slate-300">
            {item.evidence_title}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm text-slate-700 dark:text-slate-300">
            {getUserName(item)}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span
          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
          style={{
            backgroundColor: `${item.state_color}20`,
            color: item.state_color,
            border: `1px solid ${item.state_color}40`,
          }}
        >
          {item.state_name}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
          {formatDate(item.created_at)}
        </span>
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => onReview(item)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
          {t("goals.approvals.review")}
        </button>
      </td>
    </tr>
  );
};

// ── Metric (whole-metric workflow) row ─────────────────
const PendingMetricRow: React.FC<{
  item: MetricApprovalListItem;
  onReview: (item: MetricApprovalListItem) => void;
  getUserName: (
    item: ApprovalListItem | MetricApprovalListItem | MetricValueChangeApprovalListItem,
  ) => string;
}> = ({ item, onReview, getUserName }) => {
  const { t } = useTranslation();
  return (
    <tr className="border-b border-slate-100 dark:border-slate-700/40 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
      <td className="px-4 py-3">
        <Link
          to={`/goals/${item.goal_id}`}
          className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
        >
          {item.goal_title}
        </Link>
        <div className="mt-0.5">
          <GoalPriorityBadge priority={item.goal_priority} />
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm text-slate-700 dark:text-slate-300">
            {item.metric_name}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm text-slate-700 dark:text-slate-300">
            {getUserName(item)}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span
          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
          style={{
            backgroundColor: `${item.state_color}20`,
            color: item.state_color,
            border: `1px solid ${item.state_color}40`,
          }}
        >
          {item.state_name}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
          {formatDate(item.created_at)}
        </span>
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => onReview(item)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
          {t("goals.approvals.review")}
        </button>
      </td>
    </tr>
  );
};

// ── Value-change row ───────────────────────────────────
const PendingValueChangeRow: React.FC<{
  item: MetricValueChangeApprovalListItem;
  onReview: (item: MetricValueChangeApprovalListItem) => void;
  getUserName: (
    item: ApprovalListItem | MetricApprovalListItem | MetricValueChangeApprovalListItem,
  ) => string;
}> = ({ item, onReview, getUserName }) => {
  const { t } = useTranslation();
  return (
    <tr className="border-b border-slate-100 dark:border-slate-700/40 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
      <td className="px-4 py-3">
        <Link
          to={`/goals/${item.goal_id}`}
          className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
        >
          {item.goal_title}
        </Link>
        <div className="mt-0.5">
          <GoalPriorityBadge priority={item.goal_priority} />
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <LineChart className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <div className="text-sm text-slate-700 dark:text-slate-300">
            <div className="font-medium">{item.metric_name}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {item.previous_value.toLocaleString()}
              {item.unit ? ` ${item.unit}` : ""} → {" "}
              {item.proposed_value.toLocaleString()}
              {item.unit ? ` ${item.unit}` : ""}
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm text-slate-700 dark:text-slate-300">
            {getUserName(item)}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span
          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
          style={{
            backgroundColor: `${item.state_color}20`,
            color: item.state_color,
            border: `1px solid ${item.state_color}40`,
          }}
        >
          {item.state_name}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
          {formatDate(item.created_at)}
        </span>
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => onReview(item)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
          {t("goals.approvals.review")}
        </button>
      </td>
    </tr>
  );
};

const CompletedRow: React.FC<{
  item: ApprovalListItem;
  getUserName: (
    item: ApprovalListItem | MetricApprovalListItem | MetricValueChangeApprovalListItem,
  ) => string;
}> = ({ item, getUserName }) => (
  <tr className="border-b border-slate-100 dark:border-slate-700/40 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
    <td className="px-4 py-3">
      <Link
        to={`/goals/${item.goal_id}`}
        className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
      >
        {item.goal_title}
      </Link>
      <div className="mt-0.5">
        <GoalPriorityBadge priority={item.goal_priority} />
      </div>
    </td>
    <td className="px-4 py-3">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <span className="text-sm text-slate-700 dark:text-slate-300">
          {item.evidence_title}
        </span>
      </div>
    </td>
    <td className="px-4 py-3">
      <div className="flex items-center gap-2">
        <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <span className="text-sm text-slate-700 dark:text-slate-300">
          {getUserName(item)}
        </span>
      </div>
    </td>
    <td className="px-4 py-3">
      <span
        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
        style={{
          backgroundColor: `${item.state_color}20`,
          color: item.state_color,
          border: `1px solid ${item.state_color}40`,
        }}
      >
        {item.state_name}
      </span>
    </td>
    <td className="px-4 py-3">
      <span className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
        {formatDate(item.updated_at)}
      </span>
    </td>
  </tr>
);

// ── Main Component ─────────────────────────────────────

export const GoalApprovalsPage: React.FC = () => {
  const { t } = useTranslation();
  useGoalListWebSocket();

  // Helper that pulls a name off any of the three approval shapes.
  const getUserName = (
    item:
      | ApprovalListItem
      | MetricApprovalListItem
      | MetricValueChangeApprovalListItem,
  ): string => {
    if (item.submitted_by) {
      return `${item.submitted_by.first_name} ${item.submitted_by.last_name}`.trim();
    }
    return t("goals.approvals.unknown");
  };

  // ── State ──────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabType>("pending");
  const [pendingSubTab, setPendingSubTab] =
    useState<PendingSubTab>("evidence");
  const [pendingPage, setPendingPage] = useState(1);
  const [metricsPage, setMetricsPage] = useState(1);
  const [valueChangesPage, setValueChangesPage] = useState(1);
  const [completedPage, setCompletedPage] = useState(1);

  const [reviewEvidence, setReviewEvidence] = useState<ApprovalListItem | null>(
    null,
  );
  const [reviewMetric, setReviewMetric] =
    useState<MetricApprovalListItem | null>(null);
  const [reviewValueChange, setReviewValueChange] =
    useState<MetricValueChangeApprovalListItem | null>(null);

  const limit = 10;

  // ── Queries ────────────────────────────────────────
  const { data: pendingData, isLoading: pendingLoading } = usePendingApprovals(
    pendingPage,
    limit,
  );

  const { data: pendingMetricsData, isLoading: pendingMetricsLoading } =
    usePendingMetricApprovals(metricsPage, limit);

  const { data: pendingValueChangesData, isLoading: pendingValueChangesLoading } =
    usePendingMetricValueChangeApprovals(valueChangesPage, limit);

  const { data: completedData, isLoading: completedLoading } =
    useCompletedApprovals(completedPage, limit);

  // Transitions for the selected items (one query per modal type).
  const { data: evidenceTransitionsData } = useEvidenceTransitions(
    reviewEvidence?.evidence_id ?? "",
  );
  const { data: metricTransitionsData } = useMetricAvailableTransitions(
    reviewMetric?.metric_id ?? "",
  );
  const { data: valueChangeTransitionsData } =
    useValueChangeAvailableTransitions(reviewValueChange?.change_id ?? "");

  // ── Derived ────────────────────────────────────────
  const pendingApprovals = pendingData?.data ?? [];
  const pendingTotal = pendingData?.total ?? 0;
  const pendingTotalPages = Math.ceil(pendingTotal / limit);

  const pendingMetrics = pendingMetricsData?.data ?? [];
  const pendingMetricsTotal = pendingMetricsData?.total ?? 0;
  const pendingMetricsTotalPages = Math.ceil(pendingMetricsTotal / limit);

  const pendingValueChanges = pendingValueChangesData?.data ?? [];
  const pendingValueChangesTotal = pendingValueChangesData?.total ?? 0;
  const pendingValueChangesTotalPages = Math.ceil(
    pendingValueChangesTotal / limit,
  );

  const completedApprovals = completedData?.data ?? [];
  const completedTotal = completedData?.total ?? 0;
  const completedTotalPages = Math.ceil(completedTotal / limit);

  const evidenceTransitions = evidenceTransitionsData?.data ?? [];
  const metricTransitions = metricTransitionsData?.data ?? [];
  const valueChangeTransitions = valueChangeTransitionsData?.data ?? [];

  const totalPending =
    pendingTotal + pendingMetricsTotal + pendingValueChangesTotal;

  // ── Tab Definitions ────────────────────────────────
  const tabs: {
    key: TabType;
    label: string;
    icon: React.ReactNode;
    count: number;
  }[] = [
    {
      key: "pending",
      label: t("goals.approvals.tabPending"),
      icon: <Clock className="w-4 h-4" />,
      count: totalPending,
    },
    {
      key: "completed",
      label: t("goals.approvals.tabCompleted"),
      icon: <CheckCircle2 className="w-4 h-4" />,
      count: completedTotal,
    },
  ];

  const subTabs: {
    key: PendingSubTab;
    label: string;
    icon: React.ReactNode;
    count: number;
  }[] = [
    {
      key: "evidence",
      label: t("goals.approvals.subTabEvidence", {
        defaultValue: t("goals.approvals.table.evidence"),
      }),
      icon: <FileText className="w-4 h-4" />,
      count: pendingTotal,
    },
    {
      key: "metrics",
      label: t("goals.approvals.tabPendingMetrics"),
      icon: <BarChart3 className="w-4 h-4" />,
      count: pendingMetricsTotal,
    },
    {
      key: "value-changes",
      label: t("goals.approvals.tabPendingValueChanges"),
      icon: <LineChart className="w-4 h-4" />,
      count: pendingValueChangesTotal,
    },
  ];

  // ── Render ─────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Header ────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            {t("goals.approvals.title")}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t("goals.approvals.subtitle")}
          </p>
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────── */}
      <div className="border-b border-slate-200 dark:border-slate-700/60">
        <nav className="flex gap-1 -mb-px" aria-label={t("goals.approvals.title")}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.count > 0 && (
                <span
                  className={`ms-1 px-1.5 py-0.5 rounded-full text-xs font-medium tabular-nums ${
                    activeTab === tab.key
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-400"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Pending Tab ───────────────────────────── */}
      {activeTab === "pending" && (
        <div className="space-y-4">
          {/* Sub-tabs (evidence / metrics / value-changes) */}
          <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/50 w-fit">
            {subTabs.map((st) => (
              <button
                key={st.key}
                onClick={() => setPendingSubTab(st.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  pendingSubTab === st.key
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
              >
                {st.icon}
                {st.label}
                {st.count > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium tabular-nums ${
                      pendingSubTab === st.key
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                        : "bg-slate-200 text-slate-600 dark:bg-slate-700/70 dark:text-slate-300"
                    }`}
                  >
                    {st.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Evidence sub-tab */}
          {pendingSubTab === "evidence" && (
            <>
              {pendingLoading ? (
                <LoadingState />
              ) : pendingApprovals.length === 0 ? (
                <EmptyState message={t("goals.approvals.emptyPending")} />
              ) : (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/80 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50">
                          <th className="ltr:text-left rtl:text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            {t("goals.approvals.table.goal")}
                          </th>
                          <th className="ltr:text-left rtl:text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            {t("goals.approvals.table.evidence")}
                          </th>
                          <th className="ltr:text-left rtl:text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            {t("goals.approvals.table.submittedBy")}
                          </th>
                          <th className="ltr:text-left rtl:text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            {t("goals.approvals.table.state")}
                          </th>
                          <th className="ltr:text-left rtl:text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            {t("goals.approvals.table.date")}
                          </th>
                          <th className="ltr:text-left rtl:text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            {t("goals.approvals.table.actions")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingApprovals.map((item) => (
                          <PendingEvidenceRow
                            key={item.id}
                            item={item}
                            onReview={setReviewEvidence}
                            getUserName={getUserName}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-3">
                    <ApprovalPagination
                      page={pendingPage}
                      totalPages={pendingTotalPages}
                      total={pendingTotal}
                      limit={limit}
                      onPageChange={setPendingPage}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* Metrics sub-tab */}
          {pendingSubTab === "metrics" && (
            <>
              {pendingMetricsLoading ? (
                <LoadingState />
              ) : pendingMetrics.length === 0 ? (
                <EmptyState message={t("goals.approvals.emptyPending")} />
              ) : (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/80 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50">
                          <th className="ltr:text-left rtl:text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            {t("goals.approvals.table.goal")}
                          </th>
                          <th className="ltr:text-left rtl:text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            {t("goals.approvals.metricItem.title")}
                          </th>
                          <th className="ltr:text-left rtl:text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            {t("goals.approvals.table.submittedBy")}
                          </th>
                          <th className="ltr:text-left rtl:text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            {t("goals.approvals.table.state")}
                          </th>
                          <th className="ltr:text-left rtl:text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            {t("goals.approvals.table.date")}
                          </th>
                          <th className="ltr:text-left rtl:text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            {t("goals.approvals.table.actions")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingMetrics.map((item) => (
                          <PendingMetricRow
                            key={item.id}
                            item={item}
                            onReview={setReviewMetric}
                            getUserName={getUserName}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-3">
                    <ApprovalPagination
                      page={metricsPage}
                      totalPages={pendingMetricsTotalPages}
                      total={pendingMetricsTotal}
                      limit={limit}
                      onPageChange={setMetricsPage}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* Value-changes sub-tab */}
          {pendingSubTab === "value-changes" && (
            <>
              {pendingValueChangesLoading ? (
                <LoadingState />
              ) : pendingValueChanges.length === 0 ? (
                <EmptyState message={t("goals.approvals.emptyPending")} />
              ) : (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/80 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50">
                          <th className="ltr:text-left rtl:text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            {t("goals.approvals.table.goal")}
                          </th>
                          <th className="ltr:text-left rtl:text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            {t("goals.approvals.valueChangeItem.title")}
                          </th>
                          <th className="ltr:text-left rtl:text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            {t("goals.approvals.table.submittedBy")}
                          </th>
                          <th className="ltr:text-left rtl:text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            {t("goals.approvals.table.state")}
                          </th>
                          <th className="ltr:text-left rtl:text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            {t("goals.approvals.table.date")}
                          </th>
                          <th className="ltr:text-left rtl:text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            {t("goals.approvals.table.actions")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingValueChanges.map((item) => (
                          <PendingValueChangeRow
                            key={item.id}
                            item={item}
                            onReview={setReviewValueChange}
                            getUserName={getUserName}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-3">
                    <ApprovalPagination
                      page={valueChangesPage}
                      totalPages={pendingValueChangesTotalPages}
                      total={pendingValueChangesTotal}
                      limit={limit}
                      onPageChange={setValueChangesPage}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Completed Tab ─────────────────────────── */}
      {activeTab === "completed" && (
        <div className="space-y-4">
          {completedLoading ? (
            <LoadingState />
          ) : completedApprovals.length === 0 ? (
            <EmptyState message={t("goals.approvals.emptyCompleted")} />
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/80 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50">
                      <th className="ltr:text-left rtl:text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {t("goals.approvals.table.goal")}
                      </th>
                      <th className="ltr:text-left rtl:text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {t("goals.approvals.table.evidence")}
                      </th>
                      <th className="ltr:text-left rtl:text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {t("goals.approvals.table.submittedBy")}
                      </th>
                      <th className="ltr:text-left rtl:text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {t("goals.approvals.table.result")}
                      </th>
                      <th className="ltr:text-left rtl:text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {t("goals.approvals.table.date")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedApprovals.map((item) => (
                      <CompletedRow
                        key={item.id}
                        item={item}
                        getUserName={getUserName}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3">
                <ApprovalPagination
                  page={completedPage}
                  totalPages={completedTotalPages}
                  total={completedTotal}
                  limit={limit}
                  onPageChange={setCompletedPage}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modals ─────────────────────────────────── */}
      {reviewEvidence && (
        <EvidenceTransitionModal
          evidenceId={reviewEvidence.evidence_id}
          evidenceTitle={reviewEvidence.evidence_title}
          evidenceVersion={reviewEvidence.evidence_version}
          transitions={evidenceTransitions}
          isOpen={true}
          onClose={() => setReviewEvidence(null)}
        />
      )}

      {reviewMetric && (
        <MetricTransitionModal
          metricId={reviewMetric.metric_id}
          metricName={reviewMetric.metric_name}
          transitions={metricTransitions}
          isOpen={true}
          onClose={() => setReviewMetric(null)}
        />
      )}

      {reviewValueChange && (
        <MetricValueChangeTransitionModal
          changeId={reviewValueChange.change_id}
          metricName={reviewValueChange.metric_name}
          proposedValue={reviewValueChange.proposed_value}
          previousValue={reviewValueChange.previous_value}
          unit={reviewValueChange.unit}
          transitions={valueChangeTransitions}
          isOpen={true}
          onClose={() => setReviewValueChange(null)}
        />
      )}
    </div>
  );
};

export default GoalApprovalsPage;
