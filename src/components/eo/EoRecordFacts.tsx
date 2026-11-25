import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CalendarClock,
  GitFork,
  Lock,
  User,
} from "lucide-react";
import { userApi } from "../../api/admin";
import { eoRecordApi } from "../../api/eoRecords";
import { eoKeys } from "../../hooks/useEoRecords";
import {
  eoDaysOverdue,
  summariseReferralTree,
  type EoReferralBranch,
} from "../../lib/eoHeader";
import type {
  EoRecord,
  EoRecordType,
  EoWorkflowState,
} from "../../types/eoRecord";
import type { User as UserT } from "../../types";

interface EoRecordFactsProps {
  record: EoRecord;
  state?: EoWorkflowState;
  typeById: Map<string, EoRecordType>;
}

const dateOnly = (iso: string, lang: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // due_date is a DATE serialised at UTC midnight: print its UTC day so it
  // never slides a day in a timezone west of Greenwich.
  return d.toLocaleDateString(lang, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
};

/**
 * One referral branch. It is a link ONLY once the server has agreed the
 * caller may read it: referrals are body-scoped, so a branch reference can
 * name a record this officer cannot open, and a link to it would end in a
 * 403/404. Until the read succeeds — and for good if it fails — the branch is
 * plain text with a lock, so its existence is still shown.
 */
const BranchChip: React.FC<{
  branch: EoReferralBranch;
  typeById: Map<string, EoRecordType>;
  probe: { loading: boolean; record?: EoRecord };
}> = ({ branch, typeById, probe }) => {
  const { t } = useTranslation();
  const typeKey = probe.record
    ? typeById.get(probe.record.record_type_id)?.key
    : undefined;
  const base =
    "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium tabular-nums border";
  const label = branch.reference || t("eo.header.branchUnnamed", "Referral");

  if (probe.record && typeKey) {
    return (
      <Link
        to={`/eo/${typeKey}/${probe.record.id}`}
        className={`${base} border-amber-300 dark:border-amber-600/50 text-blue-700 dark:text-blue-300 hover:underline`}
      >
        <bdi>{label}</bdi>
      </Link>
    );
  }
  if (probe.loading) {
    return (
      <span
        className={`${base} border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300`}
      >
        <bdi>{label}</bdi>
      </span>
    );
  }
  return (
    <span
      className={`${base} border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300`}
      title={t(
        "eo.header.branchRestricted",
        "This referral is held by another body; you cannot open it.",
      )}
    >
      <Lock className="w-3 h-3" aria-hidden="true" />
      <bdi>{label}</bdi>
      <span className="sr-only">
        {t("eo.header.branchRestrictedShort", "restricted")}
      </span>
    </span>
  );
};

export const EoRecordFacts: React.FC<EoRecordFactsProps> = ({
  record,
  state,
  typeById,
}) => {
  const { t, i18n } = useTranslation();

  const needsUser = !!record.assigned_user_id;
  const usersQuery = useQuery({
    // Same key EoFieldValue uses, so the two share one request.
    queryKey: ["admin", "users", "eo-picker"],
    queryFn: () => userApi.list(1, 200),
    enabled: needsUser,
    retry: false,
  });
  const assignee = useMemo(() => {
    const u = ((usersQuery.data?.data ?? []) as UserT[]).find(
      (x) => x.id === record.assigned_user_id,
    );
    if (!u) return "";
    return `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.username;
  }, [usersQuery.data, record.assigned_user_id]);

  const daysOverdue = eoDaysOverdue(record, state);

  const summary = summariseReferralTree(record.values?.referral_tree);
  const probes = useQueries({
    queries: (summary?.outstanding ?? []).map((b) => ({
      queryKey: eoKeys.detail(b.id),
      queryFn: () => eoRecordApi.getById(b.id),
      enabled: !!b.id,
      retry: false,
    })),
  });

  return (
    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/40 flex flex-wrap gap-x-8 gap-y-3 text-sm">
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
          {t("eo.header.assignee", "Assigned to")}
        </div>
        <div className="flex items-center gap-1.5 text-slate-900 dark:text-white">
          <User className="w-4 h-4 text-slate-400" aria-hidden="true" />
          {record.assigned_user_id ? (
            assignee ? (
              <bdi>{assignee}</bdi>
            ) : (
              <span className="text-slate-600 dark:text-slate-300">
                {usersQuery.isLoading
                  ? "…"
                  : t("eo.header.assigneeUnresolved", "Assigned")}
              </span>
            )
          ) : (
            <span className="text-slate-500 dark:text-slate-400">
              {t("eo.header.unassigned", "Unassigned")}
            </span>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
          {t("eo.header.due", "Due")}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-slate-900 dark:text-white">
            <CalendarClock
              className="w-4 h-4 text-slate-400"
              aria-hidden="true"
            />
            {record.due_date ? (
              dateOnly(record.due_date, i18n.language)
            ) : (
              <span className="text-slate-500 dark:text-slate-400">
                {t("eo.header.noDue", "No due date")}
              </span>
            )}
          </span>
          {daysOverdue > 0 && (
            <span
              data-testid="eo-overdue"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-300 dark:bg-red-900/20 dark:text-red-300 dark:border-red-700/60"
            >
              <AlertTriangle className="w-3 h-3" aria-hidden="true" />
              {t("eo.header.overdueBy", {
                count: daysOverdue,
                defaultValue_one: "Overdue by {{count}} day",
                defaultValue_other: "Overdue by {{count}} days",
              })}
            </span>
          )}
        </div>
      </div>

      {summary && (
        <div className="min-w-0" data-testid="eo-referral-summary">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
            {t("eo.header.referrals", "Referrals")}
          </div>
          {summary.total === 0 ? (
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <GitFork className="w-4 h-4 text-slate-400" aria-hidden="true" />
              {t("eo.header.noBranches", "No referrals")}
            </div>
          ) : summary.outstanding.length === 0 ? (
            <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
              <GitFork className="w-4 h-4" aria-hidden="true" />
              {t("eo.header.allAnswered", {
                count: summary.total,
                defaultValue_one: "All {{count}} referral answered",
                defaultValue_other: "All {{count}} referrals answered",
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-medium">
                <GitFork className="w-4 h-4" aria-hidden="true" />
                {t("eo.header.outstanding", {
                  count: summary.outstanding.length,
                  total: summary.total,
                  defaultValue_one:
                    "{{count}} of {{total}} referrals still outstanding",
                  defaultValue_other:
                    "{{count}} of {{total}} referrals still outstanding",
                })}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {summary.outstanding.map((b, i) => (
                  <BranchChip
                    key={b.id || b.reference || i}
                    branch={b}
                    typeById={typeById}
                    probe={{
                      loading: !!b.id && !!probes[i]?.isLoading,
                      record: probes[i]?.data?.data,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EoRecordFacts;
