import React, { useMemo, useState } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Briefcase,
} from "lucide-react";
import {
  useEoRecordTypes,
  useEoRecords,
  useEoMyAssigned,
  useEoStateMap,
  useEoEffectiveFields,
} from "../../hooks/useEoRecords";
import { usePermissions } from "../../hooks/usePermissions";
import { useLocalizedField } from "../../hooks/useLocalizedField";
import { PERMISSIONS } from "../../constants/permissions";
import { EoRecordFilters } from "../../components/eo/EoRecordFilters";
import { EoStateBadge } from "../../components/eo/EoStateBadge";
import { EoFieldValue } from "../../components/eo/EoFieldValue";
import { registerColumnFields } from "../../lib/eoFields";
import type { EoRecord, EoRecordFilter } from "../../types/eoRecord";

const PRIORITY_CLASSES: Record<string, string> = {
  urgent:
    "bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/30",
  high: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30",
  normal:
    "bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/30",
};

/**
 * The EO register.
 *
 * One component serves three routes: /eo/records (every type), /eo/my-assigned
 * (the caller's own), and /eo/:typeKey (one type, with that type's own fields
 * as extra columns). Modelled on admin/GoalsPage.tsx — plain <table> in a
 * bordered card, the same three-state ternary, the same filter-driven pager.
 */
export const EoRecordsPage: React.FC = () => {
  const { t } = useTranslation();
  const { typeKey } = useParams<{ typeKey: string }>();
  const { pathname } = useLocation();
  const { hasPermission, isSuperAdmin } = usePermissions();
  const localize = useLocalizedField();

  const isMyAssigned = pathname.endsWith("/my-assigned");

  const typesQuery = useEoRecordTypes();
  const allTypes = useMemo(
    () => typesQuery.data?.data ?? [],
    [typesQuery.data],
  );
  const selectableTypes = useMemo(
    () => allTypes.filter((rt) => !rt.is_abstract && rt.is_active),
    [allTypes],
  );

  const routeType = useMemo(
    () =>
      typeKey ? selectableTypes.find((rt) => rt.key === typeKey) : undefined,
    [selectableTypes, typeKey],
  );

  const [filters, setFilters] = useState<EoRecordFilter>({
    page: 1,
    limit: 10,
    sort_by: "created_at",
    sort_dir: "desc",
  });

  // A /eo/:typeKey route pins record_type_id; the type dropdown is hidden there.
  const effectiveFilters = useMemo<EoRecordFilter>(
    () =>
      routeType ? { ...filters, record_type_id: [routeType.id] } : filters,
    [filters, routeType],
  );

  const allQuery = useEoRecords(effectiveFilters);
  const mineQuery = useEoMyAssigned(effectiveFilters);
  const { data, isLoading, error } = isMyAssigned ? mineQuery : allQuery;

  const records = data?.data ?? [];
  const total = data?.total_items ?? 0;
  const currentPage = filters.page ?? 1;
  const totalPages = Math.max(1, data?.total_pages ?? 1);

  // Records carry only state_id, so resolve names from every type's workflow.
  const workflowIds = useMemo(
    () =>
      Array.from(
        new Set(
          selectableTypes
            .map((rt) => rt.workflow_id)
            .filter((id): id is string => !!id),
        ),
      ),
    [selectableTypes],
  );
  const stateMap = useEoStateMap(workflowIds);

  const typeById = useMemo(
    () => new Map(allTypes.map((rt) => [rt.id, rt])),
    [allTypes],
  );

  // Extra columns, only on a single-type register where every row shares a shape.
  const { fields: routeTypeFields } = useEoEffectiveFields(routeType?.id);
  const extraColumns = useMemo(
    () => (routeType ? registerColumnFields(routeTypeFields, 2) : []),
    [routeType, routeTypeFields],
  );

  const canCreate =
    isSuperAdmin ||
    hasPermission(PERMISSIONS.EO_CREATE) ||
    (!!routeType && hasPermission(`eo:${routeType.key}:create`));

  const title = routeType
    ? localize(routeType as unknown as Record<string, unknown>, "name") ||
      routeType.name
    : isMyAssigned
      ? t("eo.myAssignedTitle", "My assigned records")
      : t("eo.title", "Executive Office register");

  const formatDate = (v?: string | null) =>
    v
      ? new Date(v).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "-";

  const detailPath = (rec: EoRecord) => {
    const rt = typeById.get(rec.record_type_id);
    return `/eo/${rt?.key ?? "records"}/${rec.id}`;
  };

  const subjectOf = (rec: EoRecord) =>
    localize(rec as unknown as Record<string, unknown>, "subject") ||
    rec.subject_en ||
    rec.subject_ar ||
    "-";

  if (error) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="rounded-xl border border-red-300 dark:border-red-700/60 bg-red-50 dark:bg-red-900/20 p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            <div>
              <h3 className="text-sm font-medium text-red-800 dark:text-red-300">
                {t("eo.failedToLoad", "Could not load the register")}
              </h3>
              <p className="mt-1 text-sm text-red-700 dark:text-red-400">
                {error instanceof Error
                  ? error.message
                  : t("eo.unexpectedError", "An unexpected error occurred")}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const headerCell =
    "px-6 py-3 ltr:text-left rtl:text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider";

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/10">
            <Briefcase className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {title}
              </h1>
              {!isLoading && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
                  {total}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t(
                "eo.subtitle",
                "Directives, correspondence and executive records",
              )}
            </p>
          </div>
        </div>
        {canCreate && routeType && (
          <Link
            to={`/eo/${routeType.key}/new`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t("eo.newRecord", "New record")}
          </Link>
        )}
      </div>

      {/* Filters */}
      <EoRecordFilters
        filters={filters}
        onChange={setFilters}
        recordTypes={selectableTypes}
        showTypeFilter={!routeType}
      />

      {/* Table card */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/80 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Briefcase className="w-10 h-10 text-slate-400 dark:text-slate-500 mb-3" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              {t("eo.empty", "No records yet")}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
              {t(
                "eo.emptyHint",
                "Adjust the filters, or create the first record.",
              )}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800">
                    <th className={headerCell}>
                      {t("eo.table.reference", "Reference")}
                    </th>
                    <th className={headerCell}>
                      {t("eo.table.subject", "Subject")}
                    </th>
                    {!routeType && (
                      <th className={headerCell}>
                        {t("eo.table.type", "Type")}
                      </th>
                    )}
                    <th className={headerCell}>
                      {t("eo.table.state", "State")}
                    </th>
                    <th className={headerCell}>
                      {t("eo.table.priority", "Priority")}
                    </th>
                    <th className={headerCell}>
                      {t("eo.table.dueDate", "Due date")}
                    </th>
                    {extraColumns.map((f) => (
                      <th key={f.key} className={headerCell}>
                        {localize(
                          f as unknown as Record<string, unknown>,
                          "label",
                        ) || f.key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.map((rec) => {
                    const rt = typeById.get(rec.record_type_id);
                    return (
                      <tr
                        key={rec.id}
                        className="border-b border-slate-100 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <Link
                            to={detailPath(rec)}
                            className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline tabular-nums"
                          >
                            {rec.reference || rec.id.slice(0, 8)}
                          </Link>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-slate-900 dark:text-white">
                            {subjectOf(rec)}
                          </span>
                        </td>
                        {!routeType && (
                          <td className="px-6 py-4">
                            <span className="text-sm text-slate-700 dark:text-slate-300">
                              {rt
                                ? localize(
                                    rt as unknown as Record<string, unknown>,
                                    "name",
                                  ) || rt.name
                                : "-"}
                            </span>
                          </td>
                        )}
                        <td className="px-6 py-4">
                          <EoStateBadge
                            state={
                              rec.state_id
                                ? stateMap.get(rec.state_id)
                                : undefined
                            }
                          />
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              PRIORITY_CLASSES[rec.priority] ??
                              PRIORITY_CLASSES.normal
                            }`}
                          >
                            {t(
                              `eo.priority.${rec.priority}`,
                              rec.priority || "-",
                            )}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-slate-700 dark:text-slate-300">
                            {formatDate(rec.due_date)}
                          </span>
                        </td>
                        {extraColumns.map((f) => (
                          <td key={f.key} className="px-6 py-4">
                            <EoFieldValue
                              field={f}
                              value={rec.values?.[f.key]}
                              compact
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t("eo.pageOf", {
                  current: currentPage,
                  total: totalPages,
                  defaultValue: `Page ${currentPage} of ${totalPages}`,
                })}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      page: Math.max(1, (prev.page ?? 1) - 1),
                    }))
                  }
                  disabled={currentPage <= 1}
                  className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 rtl:-rotate-180" />
                  {t("common.previous")}
                </button>
                <button
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      page: Math.min(totalPages, (prev.page ?? 1) + 1),
                    }))
                  }
                  disabled={currentPage >= totalPages}
                  className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {t("common.next")}
                  <ChevronRight className="w-4 h-4 rtl:-rotate-180" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default EoRecordsPage;
