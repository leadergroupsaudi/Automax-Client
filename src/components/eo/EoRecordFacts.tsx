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
  isEoRecordClosed,
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
  stateMap: Map<string, EoWorkflowState>;
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
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT A NAMED CHIP DISCLOSES, AND WHY IT IS STILL NAMED
 * ────────────────────────────────────────────────────────────────────────────
 * A locked chip is not a blank: it prints a restricted branch's EXISTENCE, its
 * REFERENCE and its OUTSTANDING STATUS to a reader entitled only to the parent
 * letter. This component is the first place those references reach a screen,
 * which is why the note sits here as well as on the server.
 *
 * THE DISCLOSURE IS PRE-EXISTING BACKEND BEHAVIOUR, not something this header
 * introduces. `values.referral_tree` is written onto the letter by
 * `internal/services/eo_capability_referral_tree.go:90-97`, which carries its
 * own owner-decision note: the copy crosses the PER-TYPE gate as well as the
 * body gate, so a caller holding the letter register but not
 * `eo:eo_referral:view` reads the same branch ids, references and answered
 * flags straight out of the record payload. Content is never copied and the
 * ids answer 403/404 on every follow-up path, so it is metadata only. Blanking
 * the chips here would hide the leak from the screen without closing it.
 *
 * IT IS WITH THE CLIENT FOR A DECISION (raised 2026-11-25, unanswered). Until
 * the client answers, this behaviour is settled and deliberately unchanged.
 *
 * IF THE CLIENT ASKS FOR A MITIGATION, the consistent one is a COUNTED,
 * UNNAMED chip — "{{count}} referrals you cannot open" — mirroring
 * `EoBlockReason`'s `hidden` variant, which already says how many and nothing
 * else about records a reader may not see. It would have to be driven by the
 * server marking which branches the reader may name, not by this probe
 * failing, because a probe that merely failed cannot tell "not allowed" from
 * "could not be read". NOT IMPLEMENTED HERE, deliberately.
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
  stateMap,
  typeById,
}) => {
  const { t, i18n } = useTranslation();

  /**
   * ────────────────────────────────────────────────────────────────────────
   * THE NAME IS READ FROM AN ADMIN ROUTE THIS PAGE'S OWN READER CANNOT CALL
   * ────────────────────────────────────────────────────────────────────────
   * `userApi.list` is GET /admin/users, which the server guards with
   * `users:view`. NO EO ROLE HOLDS IT — not Executive Office, EO
   * Administrator, Head of Office, Protocol, L1 Reviewer or Public Relations
   * (measured against the live role table). So for the officer this page
   * exists for the request 403s, and the name is simply unavailable here.
   *
   * THE PROPER FIX IS ON THE SERVER: carrying `assigned_user_name` on the EO
   * record payload, exactly as `performed_by_name` is carried on a history
   * row — asking an EO page to call an admin route to make a name readable is
   * the wrong shape. That change is not in this wave.
   *
   * WHAT IS IN THIS WAVE IS THE HEADER NOT LYING ABOUT IT. "assigned to
   * nobody" and "assigned to somebody whose name you may not read" are
   * different facts, and this fell back to the bare label "Assigned" for the
   * second, which reads as a rendering fault rather than as a statement. The
   * three unresolved cases are told apart below.
   *
   * A REFUSAL IS AN ANSWER, NOT A FLAKE, so this read is not repeated:
   * `retry: false` (it was already), `retryOnMount: false` so a remount does
   * not re-ask, and a stale window so a re-render does not either.
   *
   * MEASURED CAVEAT: that discipline is this observer's own and does not
   * govern the request. The key is shared with EoFieldValue and EoFieldInput,
   * which set different options, and the last observer to set them wins — so
   * the 403 is still retried and re-read on their account, and the counted
   * drive of this (e2e/eo-record-header.spec.ts) can only assert that working
   * the page adds no further reads. Reconciling the three is the shared-query
   * -key options mismatch, which is a separate piece of work.
   */
  const needsUser = !!record.assigned_user_id;
  const usersQuery = useQuery({
    // Same key EoFieldValue uses, so the two share one request.
    queryKey: ["admin", "users", "eo-picker"],
    queryFn: () => userApi.list(1, 200),
    enabled: needsUser,
    retry: false,
    retryOnMount: false,
    staleTime: 5 * 60 * 1000,
  });
  const assignee = useMemo(() => {
    const u = ((usersQuery.data?.data ?? []) as UserT[]).find(
      (x) => x.id === record.assigned_user_id,
    );
    if (!u) return "";
    return `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.username;
  }, [usersQuery.data, record.assigned_user_id]);

  const daysOverdue = eoDaysOverdue(record, state);

  const snapshot = summariseReferralTree(record.values?.referral_tree);
  // The tree is a snapshot taken when the LETTER was last saved or moved; a
  // branch answering afterwards does not refresh it. So every branch is read
  // and its own state decides whether it is open. The snapshot is used only
  // for a branch that could not be read, and that is said on screen.
  const probes = useQueries({
    queries: (snapshot?.branches ?? []).map((b) => ({
      queryKey: eoKeys.detail(b.id),
      queryFn: () => eoRecordApi.getById(b.id),
      enabled: !!b.id,
      retry: false,
    })),
  });
  const live = (snapshot?.branches ?? []).map((b, i) => {
    const rec = probes[i]?.data?.data;
    const pending = !!b.id && !!probes[i]?.isLoading;
    const answered = rec
      ? isEoRecordClosed(
          rec,
          rec.state_id ? stateMap.get(rec.state_id) : undefined,
        )
      : b.answered;
    return { b, rec, pending, answered, fromSnapshot: !rec && !pending };
  });
  const summary = snapshot && {
    total: live.length,
    outstanding: live.filter((x) => !x.answered),
    usedSnapshot: live.some((x) => x.fromSnapshot),
  };

  return (
    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/40 flex flex-wrap gap-x-8 gap-y-3 text-sm">
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
          {t("eo.header.assignee", "Assigned to")}
        </div>
        <div
          data-testid="eo-assignee"
          className="flex items-center gap-1.5 text-slate-900 dark:text-white"
        >
          <User className="w-4 h-4 text-slate-400" aria-hidden="true" />
          {record.assigned_user_id ? (
            assignee ? (
              <bdi>{assignee}</bdi>
            ) : usersQuery.isLoading ? (
              <span className="text-slate-600 dark:text-slate-300">…</span>
            ) : usersQuery.isError ? (
              // The record IS assigned; the directory is what could not be
              // read. Said in those words, because "Assigned" on its own
              // looks like a value that failed to render.
              <span className="text-slate-700 dark:text-slate-300">
                {t(
                  "eo.header.assigneeHidden",
                  "Assigned — the name is not available to you",
                )}
              </span>
            ) : (
              // The directory WAS read and this id is not in it: a user
              // outside the first page of it, or one who has been removed.
              // A different fact from the one above, and from "Unassigned".
              <span className="text-slate-700 dark:text-slate-300">
                {t(
                  "eo.header.assigneeUnknown",
                  "Assigned — this user is not in the directory",
                )}
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
              {/*
                EACH CHIP NAMES A BRANCH BY REFERENCE, including one this
                reader may not open — see the note on BranchChip above. That
                disclosure is the server's (`values.referral_tree`, written by
                eo_capability_referral_tree.go:90-97) and is WITH THE CLIENT
                FOR A DECISION; no behaviour is changed here, and the counted
                unnamed chip described there is deliberately not implemented.
              */}
              <div className="flex flex-wrap gap-1.5">
                {summary.outstanding.map((x, i) => (
                  <BranchChip
                    key={x.b.id || x.b.reference || i}
                    branch={x.b}
                    typeById={typeById}
                    probe={{ loading: x.pending, record: x.rec }}
                  />
                ))}
              </div>
            </div>
          )}
          {summary.usedSnapshot && summary.total > 0 && (
            <div
              data-testid="eo-referral-snapshot"
              className="mt-1 text-xs italic text-slate-500 dark:text-slate-400"
            >
              {t(
                "eo.header.snapshotNote",
                "Some referrals could not be read; their status is as of the letter's last save.",
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EoRecordFacts;
