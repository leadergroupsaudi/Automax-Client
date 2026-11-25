import React from "react";
import { useTranslation } from "react-i18next";
import type { UseQueryResult } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Cog,
  RotateCw,
} from "lucide-react";
import {
  eoHistoryActor,
  eoHistoryStep,
  eoHistoryTime,
  type EoHistoryState,
} from "../../lib/eoHistory";
import type { EoRecordHistoryResponse } from "../../types/eoRecord";

interface EoRecordHistoryProps {
  query: UseQueryResult<EoRecordHistoryResponse, unknown>;
  page: number;
  onPageChange: (page: number) => void;
}

/**
 * The audit trail of one record: who did what to it, when, and what they said.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * "NOTHING HAS HAPPENED" AND "WE COULD NOT ASK" ARE DIFFERENT SENTENCES
 * ────────────────────────────────────────────────────────────────────────────
 * This register is statutory. An officer who is shown an empty trail will
 * conclude that the record has not been touched — so a failed read must never
 * borrow that wording, which is what the children tab beside it still does
 * (`children.length === 0` after an error renders "This record has no
 * children", permanently, with nothing to press). One of those sentences is a
 * fact about the record; the other is a fact about the network. They are
 * branched apart here, the failure is announced as an alert, and it carries
 * the retry the empty state has no need of.
 *
 * A failure that arrives on top of rows already on screen keeps the rows AND
 * says so, rather than replacing a trail the officer is reading with a panel.
 */
export const EoRecordHistory: React.FC<EoRecordHistoryProps> = ({
  query,
  page,
  onPageChange,
}) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const entries = query.data?.data ?? [];
  const pages = Math.max(1, query.data?.total_pages ?? 1);

  /**
   * ────────────────────────────────────────────────────────────────────────
   * "THIS PAGE IS EMPTY" IS NOT "THIS RECORD HAS NO HISTORY"
   * ────────────────────────────────────────────────────────────────────────
   * The empty sentence is keyed on the SERVER'S TOTAL, never on the length of
   * the array on screen. A successful read can return an empty array with a
   * non-zero total: eoClampPaging clamps `page` to >= 1 and never to
   * `total_pages`, so a page past the end answers 200 with
   * `{data: [], total_items: 5, total_pages: 1}` (verified against the live
   * route at ?page=9). Keyed on `entries.length` this panel printed "Nothing
   * has been recorded against this record yet." next to a tab badge reading 5
   * — the same lie as the error state's, through a second door, and with the
   * pager inside the non-empty branch there was no control left to escape by.
   *
   * So: `total === 0` is an empty trail. An empty page with a non-zero total
   * is a position, it says so, and it carries its own way back.
   *
   * AND A SUCCESSFUL READ THAT CARRIES NEITHER ROWS NOR A TOTAL IS NEITHER.
   * `trailIsEmpty` and `pastTheEnd` both need a NUMBER, and `entries.length >
   * 0` is false, so an envelope without `total_items` — "an older server, or
   * a shape that changes under us", the case this file's badge rule already
   * contemplates — rendered NOTHING AT ALL: no sentence, no alert, no pager.
   * A blank panel in a statutory register reads as an empty trail, which is
   * the very lie the two guards above exist to prevent, told in silence. It
   * is unreachable against this backend; it is closed anyway, because this is
   * the one panel whose whole job is never to render a misleading nothing.
   */
  const total = query.data?.total_items;
  const trailIsEmpty = total === 0;
  const pastTheEnd =
    entries.length === 0 && typeof total === "number" && total > 0;
  const unreadable = entries.length === 0 && typeof total !== "number";

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
      </div>
    );
  }

  /** "—" for a state the server could not name. Never an empty gap. */
  const stateText = (state: EoHistoryState) =>
    state.name || t("eo.table.unknownState", "—");

  return (
    // The id is the stable hook the driven spec scopes to, in the same spirit
    // as #eo-no-moves-reason and #eo-transition-comment on this page.
    <div id="eo-history-panel">
      {query.isError && (
        <div
          role="alert"
          className="rounded-xl border border-red-300 dark:border-red-700/60 bg-red-50 dark:bg-red-900/20 p-4 mb-4"
        >
          <div className="flex items-start gap-3">
            <AlertCircle
              className="w-5 h-5 mt-0.5 text-red-600 dark:text-red-400 flex-shrink-0"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                {t(
                  "eo.detail.history.failed",
                  "The history could not be loaded",
                )}
              </h3>
              <p className="mt-1 text-sm text-red-700 dark:text-red-200">
                {entries.length > 0
                  ? t(
                      "eo.detail.history.failedStale",
                      "What is shown below was read earlier and may be out of date.",
                    )
                  : t(
                      "eo.detail.history.failedHint",
                      "This is a problem reaching the server — it does not mean nothing has happened to this record.",
                    )}
              </p>
              <button
                type="button"
                onClick={() => void query.refetch()}
                disabled={query.isFetching}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-600 dark:border-red-400 text-sm font-medium text-red-800 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <RotateCw
                  className={`w-4 h-4 ${query.isFetching ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                {t("common.retry", "Retry")}
              </button>
            </div>
          </div>
        </div>
      )}

      {trailIsEmpty && !query.isError && (
        // Only ever reached on a SUCCESSFUL read whose TOTAL is zero: an empty
        // trail is `{data: [], total_items: 0}`, never a 404.
        <p className="text-sm text-slate-600 dark:text-slate-300 py-6 text-center">
          {t(
            "eo.detail.history.empty",
            "Nothing has been recorded against this record yet.",
          )}
        </p>
      )}

      {pastTheEnd && !query.isError && (
        // A position, not a verdict on the record — and a way back out of it.
        <div className="py-6 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {t(
              "eo.detail.history.pastTheEnd",
              "This page is past the end of the history. The record's entries are on the earlier pages.",
            )}
          </p>
          <button
            type="button"
            onClick={() => onPageChange(1)}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-500 dark:border-slate-400 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <ChevronLeft
              className="w-4 h-4 rtl:-rotate-180"
              aria-hidden="true"
            />
            {t("eo.detail.history.firstPage", "Go to the first page")}
          </button>
        </div>
      )}

      {unreadable && !query.isError && (
        // The read succeeded and said nothing this panel can interpret.
        // Nothing about the record follows from it — so it must not borrow
        // the empty sentence, and must not be a blank panel either.
        <div
          role="alert"
          className="rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 p-4"
        >
          <div className="flex items-start gap-3">
            <AlertCircle
              className="w-5 h-5 mt-0.5 text-amber-700 dark:text-amber-400 flex-shrink-0"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-sm text-amber-900 dark:text-amber-200">
                {t(
                  "eo.detail.history.unreadable",
                  "The server's answer could not be read, so this page cannot say what has happened to this record.",
                )}
              </p>
              <button
                type="button"
                onClick={() => void query.refetch()}
                disabled={query.isFetching}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-700 dark:border-amber-400 text-sm font-medium text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <RotateCw
                  className={`w-4 h-4 ${query.isFetching ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                {t("common.retry", "Retry")}
              </button>
            </div>
          </div>
        </div>
      )}

      {entries.length > 0 && (
        <>
          <ol className="divide-y divide-slate-100 dark:divide-slate-700/40">
            {entries.map((row) => {
              const actor = eoHistoryActor(row);
              const step = eoHistoryStep(row, lang);
              const when = eoHistoryTime(row.created_at, lang);
              const actorName =
                actor.kind === "person"
                  ? actor.name
                  : actor.kind === "system"
                    ? t("eo.detail.history.bySystem", "Automatic action")
                    : actor.kind === "removed"
                      ? t(
                          "eo.detail.history.byRemovedUser",
                          "A user who is no longer in the system",
                        )
                      : t("eo.detail.history.byUnknown", "Actor not recorded");

              return (
                <li key={row.id} className="py-4 first:pt-1 last:pb-1">
                  <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-4">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                      {/*
                        The actor is named in English in both locales: there is
                        no performed_by_name_ar, because models.User has no
                        Arabic name column. Only the wording AROUND the name is
                        translated — <bdi> keeps a Latin name from reordering
                        the Arabic line around it.
                      */}
                      <bdi>{actorName}</bdi>
                      {actor.automatic && actor.kind === "person" && (
                        // Both true at once: an action that failed during this
                        // person's move is journalled against them AND flagged
                        // as written by the system.
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-500/10 text-xs font-medium text-slate-700 dark:text-slate-200">
                          <Cog className="w-3 h-3" aria-hidden="true" />
                          {t("eo.detail.history.automatic", "automatic")}
                        </span>
                      )}
                    </p>
                    {when.machine ? (
                      <time
                        dateTime={when.machine}
                        className="text-xs text-slate-600 dark:text-slate-400 tabular-nums whitespace-nowrap"
                      >
                        {when.readable}
                      </time>
                    ) : (
                      <span className="text-xs text-slate-600 dark:text-slate-400 tabular-nums whitespace-nowrap">
                        {when.readable}
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-300 flex items-center gap-1.5 flex-wrap">
                    {step.kind === "moved" && (
                      <>
                        <bdi className="font-medium">
                          {stateText(step.from)}
                        </bdi>
                        <ArrowRight
                          className="w-4 h-4 rtl:-rotate-180 text-slate-600 dark:text-slate-300 flex-shrink-0"
                          aria-hidden="true"
                        />
                        <span className="sr-only">
                          {t("eo.detail.history.toState", "to")}
                        </span>
                        <bdi className="font-medium">{stateText(step.to)}</bdi>
                      </>
                    )}
                    {/*
                      A create row has NO from-state. It is an origin, and it
                      says so in words — never "— → Received", which reads as a
                      trail with a hole in it.
                    */}
                    {step.kind === "created" &&
                      t("eo.detail.history.created", {
                        state: stateText(step.to),
                        defaultValue: "Record created in {{state}}",
                      })}
                    {step.kind === "left" &&
                      t("eo.detail.history.left", {
                        state: stateText(step.from),
                        defaultValue: "Left {{state}}",
                      })}
                    {/*
                      An edit journals a values diff with no state at all, and
                      its comment is the change reason, which may be blank. The
                      row would otherwise be an empty line in the register.
                    */}
                    {step.kind === "noted" &&
                      t("eo.detail.history.noted", "Details updated")}
                  </p>

                  {row.comment.trim() && (
                    <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
                      <bdi>{row.comment}</bdi>
                    </p>
                  )}
                </li>
              );
            })}
          </ol>

          {pages > 1 && (
            <div className="flex items-center justify-between gap-3 px-1 pt-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {t("eo.detail.historyPageOf", {
                  current: page,
                  total: pages,
                  defaultValue: "Page {{current}} of {{total}}",
                })}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onPageChange(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 rtl:-rotate-180" />
                  {t("common.previous", "Previous")}
                </button>
                <button
                  type="button"
                  onClick={() => onPageChange(Math.min(pages, page + 1))}
                  disabled={page >= pages}
                  className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {t("common.next", "Next")}
                  <ChevronRight className="w-4 h-4 rtl:-rotate-180" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default EoRecordHistory;
