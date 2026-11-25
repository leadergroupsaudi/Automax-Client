import React, { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  Pencil,
} from "lucide-react";
import {
  useEoRecord,
  useEoRecordTypes,
  useEoEffectiveFields,
  useEoTransitions,
  useEoChildren,
  useEoStateMap,
} from "../../hooks/useEoRecords";
import { usePermissions } from "../../hooks/usePermissions";
import { useLocalizedField } from "../../hooks/useLocalizedField";
import { EoFieldValue } from "../../components/eo/EoFieldValue";
import { EoStateBadge } from "../../components/eo/EoStateBadge";
import { EoRecordFacts } from "../../components/eo/EoRecordFacts";
import { EoTransitionModal } from "../../components/eo/EoTransitionModal";
import { flattenRecordValues } from "../../lib/eoFields";
import { eoIsBlocked } from "../../lib/eoBlocking";

type TabKey = "details" | "children";

export const EoRecordDetailPage: React.FC = () => {
  const { t } = useTranslation();
  const { typeKey, id } = useParams<{ typeKey: string; id: string }>();
  const { canEoRecordType } = usePermissions();
  const localize = useLocalizedField();

  const [tab, setTab] = useState<TabKey>("details");
  const [showTransitions, setShowTransitions] = useState(false);
  const [childrenPage, setChildrenPage] = useState(1);

  const recordQuery = useEoRecord(id ?? "");
  const record = recordQuery.data?.data;

  const typesQuery = useEoRecordTypes();
  const allTypes = useMemo(
    () => typesQuery.data?.data ?? [],
    [typesQuery.data],
  );
  const typeById = useMemo(
    () => new Map(allTypes.map((rt) => [rt.id, rt])),
    [allTypes],
  );
  const recordType = record ? typeById.get(record.record_type_id) : undefined;

  const { fields } = useEoEffectiveFields(record?.record_type_id);
  const transitionsQuery = useEoTransitions(id ?? "");
  const childrenQuery = useEoChildren(id ?? "", childrenPage);

  const workflowIds = useMemo(
    () =>
      Array.from(
        new Set(
          allTypes.map((rt) => rt.workflow_id).filter((w): w is string => !!w),
        ),
      ),
    [allTypes],
  );
  const stateMap = useEoStateMap(workflowIds);

  // Memoised because `?? []` is a fresh array every render, which would make
  // every derived memo below it recompute on each one.
  const transitions = useMemo(
    () => transitionsQuery.data?.data ?? [],
    [transitionsQuery.data],
  );

  /**
   * How many of the offered steps can actually be run, and whether this
   * record offers none at all.
   *
   * THE BADGE COUNTS THE RUNNABLE ONES. It used to count every offered step,
   * so a record with one step that an open child blocks advertised "1" on a
   * button that led to a move the server would refuse.
   *
   * `noMoves` is gated on the query having SUCCEEDED, not on the array being
   * empty: an in-flight read also has no transitions, and telling an officer
   * "no step is available" while the answer is still on the wire is the same
   * class of lie in the other direction.
   */
  const runnableCount = useMemo(
    () => transitions.filter((tr) => !eoIsBlocked(tr)).length,
    [transitions],
  );
  const noMoves = transitionsQuery.isSuccess && transitions.length === 0;

  /**
   * The children tab is PAGINATED, server-side, twenty rows at a time.
   *
   * `childrenTotal` is the server's `total_items` and is the only number
   * worth printing: `children.length` is the size of the page on screen, so
   * a Directive with thirty Tasks used to show twenty and assert "20". When
   * the envelope does not carry a total — an older server, or a shape that
   * changes under us — the badge is omitted rather than guessed, because an
   * unverifiable count is worse than none.
   */
  const children = childrenQuery.data?.data ?? [];
  const childrenTotal = childrenQuery.data?.total_items;
  const childrenPages = Math.max(1, childrenQuery.data?.total_pages ?? 1);

  // One field space across the columns and the `values` bag.
  const values = useMemo(
    () => (record ? flattenRecordValues(record) : {}),
    [record],
  );

  /**
   * Fields worth printing: everything with a definition, minus the keys the
   * header already shows (reference, state) and the two structural ids that
   * would otherwise render as raw UUIDs.
   */
  const displayFields = useMemo(
    () =>
      fields.filter(
        (f) =>
          ![
            "reference",
            "state_id",
            "record_type_id",
            "parent_record_id",
          ].includes(f.key),
      ),
    [fields],
  );

  // PUT /eo-records/:id asks for eo:update AND eo:<key>:update.
  const canUpdate = canEoRecordType(recordType?.key, "update");
  // POST /eo-records/:id/transition asks for eo:transition AND the type's
  // UPDATE code — a transition is a write. There is no eo:<key>:transition.
  const canTransition = canEoRecordType(recordType?.key, "transition");

  const registerPath = typeKey ? `/eo/${typeKey}` : "/eo/records";

  if (recordQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (recordQuery.error || !record) {
    return (
      <div className="rounded-xl border border-red-300 dark:border-red-700/60 bg-red-50 dark:bg-red-900/20 p-6">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
          <div>
            <h3 className="text-sm font-medium text-red-800 dark:text-red-300">
              {t("eo.detail.notFound", "Record not found")}
            </h3>
            <p className="mt-1 text-sm text-red-700 dark:text-red-400">
              {t(
                "eo.detail.notFoundHint",
                "It may have been removed, or you may not be allowed to see it.",
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const subject =
    localize(record as unknown as Record<string, unknown>, "subject") ||
    record.subject_en ||
    record.subject_ar ||
    record.reference;

  const tabClass = (key: TabKey) =>
    `px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
      tab === key
        ? "border-blue-600 text-blue-600 dark:text-blue-400"
        : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
    }`;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          to={registerPath}
          className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 rtl:-rotate-180" />
          {recordType
            ? localize(
                recordType as unknown as Record<string, unknown>,
                "name",
              ) || recordType.name
            : t("eo.title", "Executive Office register")}
        </Link>
      </div>

      {/* Header */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/80 p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white truncate">
                {subject}
              </h1>
              <EoStateBadge
                state={
                  record.state_id ? stateMap.get(record.state_id) : undefined
                }
              />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
              {record.reference}
            </p>
          </div>

          <div className="flex flex-col items-stretch sm:items-end gap-1.5 flex-shrink-0">
            <div className="flex items-center gap-2">
              {/*
                THE MOVE CONTROL TELLS THE TRUTH BEFORE IT IS PRESSED.

                A record with no step at all out of its current state — 23 of
                the 48 in the pilot register — used to carry the same primary
                call to action as every other record, which opened a modal
                that said "nothing". So when the read has come back empty the
                control is muted and marked unavailable, and the reason sits
                beside it as ordinary text.

                IT IS `aria-disabled`, NOT `disabled`. A disabled button is
                removed from the tab order, so a keyboard or screen-reader
                user could never reach it to be told why — the officer most in
                need of the explanation would be the one who could not get it.
                This one stays focusable, announces itself as unavailable, and
                is described by the sentence below it. Nothing opens, because
                there is no handler to open it.
              */}
              {canTransition &&
                (noMoves ? (
                  <button
                    type="button"
                    aria-disabled="true"
                    aria-describedby="eo-no-moves-reason"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-slate-500 dark:border-slate-500 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-not-allowed"
                  >
                    <GitBranch className="w-4 h-4" aria-hidden="true" />
                    {t("eo.detail.move", "Move")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowTransitions(true)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      runnableCount > 0
                        ? "bg-blue-600 hover:bg-blue-700 text-white"
                        : "border border-slate-500 dark:border-slate-500 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                    }`}
                  >
                    <GitBranch className="w-4 h-4" aria-hidden="true" />
                    {t("eo.detail.move", "Move")}
                    {runnableCount > 0 && (
                      <span className="ms-1 inline-flex items-center px-1.5 rounded-full bg-white/20 text-xs tabular-nums">
                        {runnableCount}
                      </span>
                    )}
                  </button>
                ))}
              {canUpdate && typeKey && (
                <Link
                  to={`/eo/${typeKey}/${record.id}/edit`}
                  className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                  {t("common.edit")}
                </Link>
              )}
            </div>
            {canTransition && noMoves && (
              <p
                id="eo-no-moves-reason"
                className="text-xs text-slate-700 dark:text-slate-300 sm:text-end"
              >
                {t(
                  "eo.detail.noMoves",
                  "No step is available from this state.",
                )}
              </p>
            )}
          </div>
        </div>
        <EoRecordFacts
          record={record}
          state={record.state_id ? stateMap.get(record.state_id) : undefined}
          stateMap={stateMap}
          typeById={typeById}
        />
      </div>

      {/* Tabs */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/80 overflow-hidden">
        <div className="flex border-b border-slate-200 dark:border-slate-700/60 px-3">
          <button
            onClick={() => setTab("details")}
            className={tabClass("details")}
          >
            {t("eo.detail.tabs.details", "Details")}
          </button>
          <button
            onClick={() => setTab("children")}
            className={tabClass("children")}
          >
            {t("eo.detail.tabs.children", "Children")}
            {typeof childrenTotal === "number" && childrenTotal > 0 && (
              <span className="ms-2 inline-flex items-center px-1.5 rounded-full bg-slate-500/10 text-xs tabular-nums">
                {childrenTotal}
              </span>
            )}
          </button>
        </div>

        {tab === "details" ? (
          <div className="p-6">
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
              {displayFields.map((field) => (
                <div
                  key={field.key}
                  className={
                    field.kind === "long_text" ? "md:col-span-2" : undefined
                  }
                >
                  <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    {localize(
                      field as unknown as Record<string, unknown>,
                      "label",
                    ) || field.key}
                  </dt>
                  <dd>
                    <EoFieldValue
                      field={field}
                      value={values[field.key]}
                      recordId={record.id}
                    />
                  </dd>
                </div>
              ))}
              {displayFields.length === 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t("eo.detail.noFields", "This type defines no fields.")}
                </p>
              )}
            </dl>
          </div>
        ) : (
          <div className="p-6">
            {childrenQuery.isLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
              </div>
            ) : children.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
                {t("eo.detail.noChildren", "This record has no children.")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800">
                      <th className="px-4 py-3 ltr:text-left rtl:text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {t("eo.table.reference", "Reference")}
                      </th>
                      <th className="px-4 py-3 ltr:text-left rtl:text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {t("eo.table.subject", "Subject")}
                      </th>
                      <th className="px-4 py-3 ltr:text-left rtl:text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {t("eo.table.type", "Type")}
                      </th>
                      <th className="px-4 py-3 ltr:text-left rtl:text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {t("eo.table.state", "State")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {children.map((child) => {
                      const childType = typeById.get(child.record_type_id);
                      return (
                        <tr
                          key={child.id}
                          className="border-b border-slate-100 dark:border-slate-700/30"
                        >
                          <td className="px-4 py-3">
                            <Link
                              to={`/eo/${childType?.key ?? "records"}/${child.id}`}
                              className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline tabular-nums"
                            >
                              {child.reference || child.id.slice(0, 8)}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-900 dark:text-white">
                            {localize(
                              child as unknown as Record<string, unknown>,
                              "subject",
                            ) ||
                              child.subject_en ||
                              child.subject_ar ||
                              "-"}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                            {childType
                              ? localize(
                                  childType as unknown as Record<
                                    string,
                                    unknown
                                  >,
                                  "name",
                                ) || childType.name
                              : "-"}
                          </td>
                          <td className="px-4 py-3">
                            <EoStateBadge
                              state={
                                child.state_id
                                  ? stateMap.get(child.state_id)
                                  : undefined
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {childrenPages > 1 && (
                  <div className="flex items-center justify-between gap-3 px-1 pt-4">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {t("eo.detail.childrenPageOf", {
                        current: childrenPage,
                        total: childrenPages,
                        defaultValue: "Page {{current}} of {{total}}",
                      })}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setChildrenPage((p) => Math.max(1, p - 1))
                        }
                        disabled={childrenPage <= 1}
                        className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4 rtl:-rotate-180" />
                        {t("common.previous", "Previous")}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setChildrenPage((p) => Math.min(childrenPages, p + 1))
                        }
                        disabled={childrenPage >= childrenPages}
                        className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {t("common.next", "Next")}
                        <ChevronRight className="w-4 h-4 rtl:-rotate-180" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {canTransition && (
        <EoTransitionModal
          recordId={record.id}
          recordName={`${record.reference} — ${subject}`}
          transitions={transitions}
          fields={fields}
          editPath={
            canUpdate && typeKey
              ? `/eo/${typeKey}/${record.id}/edit`
              : undefined
          }
          isOpen={showTransitions}
          onClose={() => setShowTransitions(false)}
        />
      )}
    </div>
  );
};

export default EoRecordDetailPage;
