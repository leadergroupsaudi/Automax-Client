import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertCircle, ExternalLink, Info, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { WorkflowCanvas } from "../../workflow/WorkflowCanvas";
import { PERMISSIONS } from "../../../constants/permissions";
import {
  useEoTypeRecordCounts,
  useEoWorkflowGraph,
  useEoWorkflows,
  useUpdateEoType,
} from "../../../hooks/useEoTypes";
import usePermissions from "../../../hooks/usePermissions";
import { eoRefusalMessage, eoServerRefusal } from "../../../lib/eoFields";
import { EoRefusalBanner } from "./EoRefusalBanner";
import type {
  EoRecordType,
  EoRecordTypeDetail,
  EoRecordTypeRequest,
} from "../../../types/eoRecord";

const inputClass =
  "w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:opacity-60 disabled:cursor-not-allowed";

const noop = () => undefined;

/** The workflows module's record-type tag for the Executive Office platform. */
const EO_WORKFLOW_RECORD_TYPE = "eo";

/**
 * PUT REPLACES the attribute set, so a repoint must carry every attribute the
 * type already has. Only `workflow_id` differs. `capabilities` is left out on
 * purpose (omitted leaves the stored column alone) and so is
 * `confirm_destructive` — this tab never overrides the guard rail.
 */
const requestWithWorkflow = (
  type: EoRecordTypeDetail,
  workflowId: string | null,
): EoRecordTypeRequest => ({
  key: type.key,
  name: type.name,
  name_ar: type.name_ar,
  icon: type.icon,
  parent_type_id: type.parent_type_id ?? null,
  is_abstract: type.is_abstract,
  reference_prefix: type.reference_prefix,
  reference_mode: type.reference_mode as EoRecordTypeRequest["reference_mode"],
  reference_pattern: type.reference_pattern,
  workflow_id: workflowId,
  is_active: type.is_active,
});

/**
 * The record type's lifecycle: the workflow it is bound to, drawn READ-ONLY on
 * the shared canvas, and the one control that may bind it.
 *
 * WHY READ-ONLY. States and transitions belong to the workflow designer, which
 * the tab links out to. Repointing `workflow_id` is the §7.14 destructive
 * edit `EODestructiveWorkflow`: every existing record's `state_id` names a
 * state of the OLD workflow, so after the change no transition runs from it
 * and no API route puts it back.
 *
 * WHAT CLOSES THE GATE, AND WHY SO LITTLE DOES. The server is the authority
 * and already enforces this: ValidateTypeEdit
 * (internal/models/eo_record_type.go) refuses a `workflow_id` change while
 * the subtree holds records, counted as an administrator over everything, and
 * answers with a sentence EoRefusalBanner renders verbatim.
 *
 * So the gate closes on only two things, and BOTH are facts rather than
 * doubts: the counts have not settled yet (`pending` — transient, and a
 * part-landed sum reads 0 when it is not), or a count this caller CAN see is
 * already above zero (`records`). The client count only ever UNDERSTATES —
 * `applyEORecordVisibility` narrows it for anyone but a super admin — so a
 * non-zero reading is true for everybody, and the records lock is genuine for
 * everybody.
 *
 * EVERY OTHER DOUBT IS A CAUTION, NOT A LOCK. "I cannot confirm this is
 * empty" is not "this has records". Treating it as one shut the gate
 * PERMANENTLY for every holder of `eo:types:manage` who is not a super admin
 * — the `EO Administrator` persona this tab exists for — so a type they
 * created seconds ago, with no records at all, could never be given a
 * lifecycle, and `at_state` requiredness and `is_locked_after_state_id` stayed
 * unreachable on every type they create. A client gate that is permanently
 * stricter than the server buys nothing and costs the persona the feature.
 * The caution says the count cannot be trusted and that the server decides;
 * the save is allowed to go and be refused.
 */
export const EoWorkflowTab: React.FC<{
  recordType: EoRecordTypeDetail;
  types: EoRecordType[];
}> = ({ recordType, types }) => {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  // No `eo:types:manage` check here. PermissionRoute (App.tsx) gates the whole
  // designer on it, so a check inside could never be false — "one that could
  // never be false is not a guard", as that route's own comment puts it.
  const canOpenDesigner = hasPermission(PERMISSIONS.WORKFLOWS_VIEW);

  const { recordCount, isNarrowed, isUnreadable, isPending } =
    useEoTypeRecordCounts(types);
  const records = recordCount(recordType.id);

  const workflowsQuery = useEoWorkflows();
  const graphQuery = useEoWorkflowGraph(recordType.workflow_id);
  const update = useUpdateEoType();

  const eoWorkflows = useMemo(
    () =>
      (workflowsQuery.data?.data ?? []).filter(
        (w) => (w.record_type as string) === EO_WORKFLOW_RECORD_TYPE,
      ),
    [workflowsQuery.data],
  );
  const current = (workflowsQuery.data?.data ?? []).find(
    (w) => w.id === recordType.workflow_id,
  );

  const currentId = recordType.workflow_id ?? "";
  const [choice, setChoice] = useState(currentId);
  const [refusal, setRefusal] = useState<ReturnType<
    typeof eoServerRefusal
  > | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // Follow the stored value after a save or when the type changes.
  useEffect(() => setChoice(currentId), [currentId, recordType.id]);

  // The ONE place the gate is decided, and the reason it is closed. Only a
  // FACT closes it: counts still landing, or a count that is already non-zero.
  type Lock = "pending" | "records" | null;
  const lock: Lock = isPending
    ? "pending"
    : records !== undefined && records > 0
      ? "records"
      : null;

  // The ONE place a count that cannot be trusted is reported. It never closes
  // the gate; it says what the number is worth and who actually decides.
  type Caution = "unreadable" | "unknown" | "narrowed" | null;
  const caution: Caution =
    lock !== null
      ? null
      : isUnreadable
        ? "unreadable"
        : records === undefined
          ? "unknown"
          : isNarrowed
            ? "narrowed"
            : null;

  const lockMessage: Record<Exclude<Lock, null>, string> = {
    pending: t(
      "eo.types.workflow.lockPending",
      "Checking whether this record type holds records…",
    ),
    records: t("eo.types.workflow.lockRecords", {
      count: records ?? 0,
      defaultValue: `This record type and the types beneath it hold ${records ?? 0} records. A workflow cannot be changed while any exist.`,
    }),
  };

  const cautionMessage: Record<Exclude<Caution, null>, string> = {
    unreadable: t(
      "eo.types.workflow.cautionUnreadable",
      "Some record counts could not be read, so this record type cannot be confirmed empty from here. You can still save: the server counts the whole subtree as an administrator and will refuse the change, giving its reason, if any records exist.",
    ),
    unknown: t(
      "eo.types.workflow.cautionUnknown",
      "This record type has no register of its own to count, so it cannot be confirmed empty from here. You can still save: the server counts the whole subtree as an administrator and will refuse the change, giving its reason, if any records exist.",
    ),
    narrowed: t(
      "eo.types.workflow.cautionNarrowed",
      "Your count of records is taken from your own view of the registers and may be lower than what the server holds, so this record type cannot be confirmed empty from here. You can still save: the server counts the whole subtree as an administrator and will refuse the change, giving its reason, if any records exist.",
    ),
  };

  const dirty = choice !== currentId;
  const stateName = (w: { name: string; code: string }) =>
    `${w.name} (${w.code})`;

  const save = async () => {
    setRefusal(null);
    setFailure(null);
    try {
      await update.mutateAsync({
        id: recordType.id,
        data: requestWithWorkflow(recordType, choice || null),
      });
      toast.success(t("eo.types.workflow.saved", "Workflow association saved"));
    } catch (error) {
      const r = eoServerRefusal(error);
      if (r) setRefusal(r);
      else
        setFailure(
          eoRefusalMessage(
            error,
            t(
              "eo.types.workflow.saveFailed",
              "Could not change the workflow of this record type",
            ),
          ),
        );
    }
  };

  const graph = graphQuery.data;

  return (
    <div className="space-y-6" data-testid="eo-workflow-tab">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          {t("eo.types.workflow.title", "Workflow")}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {t(
            "eo.types.workflow.hint",
            "The lifecycle every record of this type moves through. Fields can require a value from a given state, or lock after one, only when the type has a workflow.",
          )}
        </p>
      </div>

      {/* The lifecycle */}
      {!recordType.workflow_id ? (
        <div
          data-testid="eo-workflow-none"
          className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 p-6 text-sm text-slate-600 dark:text-slate-400"
        >
          {t(
            "eo.types.workflow.none",
            "This record type has no workflow. Its records have no states, and no field can require a value at a state or lock after one.",
          )}
        </div>
      ) : graphQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t("eo.types.workflow.loading", "Loading the workflow…")}
        </div>
      ) : graphQuery.isError || !graph ? (
        <div
          data-testid="eo-workflow-unreadable"
          className="rounded-lg border border-red-300 dark:border-red-700/60 bg-red-50 dark:bg-red-900/20 p-4 flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
          <p className="text-sm text-red-800 dark:text-red-300">
            {eoRefusalMessage(
              graphQuery.error,
              t(
                "eo.types.workflow.loadFailed",
                "The workflow could not be read. Reading it needs the workflows view permission.",
              ),
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              <span className="font-medium">
                {current ? stateName(current) : recordType.workflow_id}
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                {" · "}
                {t("eo.types.workflow.counts", {
                  states: graph.states.length,
                  transitions: graph.transitions.length,
                  defaultValue: `${graph.states.length} states, ${graph.transitions.length} transitions`,
                })}
              </span>
            </p>
            {canOpenDesigner ? (
              <Link
                to={`/workflows/${recordType.workflow_id}`}
                data-testid="eo-workflow-open-designer"
                className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                {t(
                  "eo.types.workflow.openDesigner",
                  "Edit states and transitions in the workflow designer",
                )}
                <ExternalLink className="w-3.5 h-3.5 rtl:-scale-x-100" />
              </Link>
            ) : (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {t(
                  "eo.types.workflow.designerNoAccess",
                  "States and transitions are edited in the workflow designer, which needs the workflows view permission.",
                )}
              </span>
            )}
          </div>
          <div data-testid="eo-workflow-canvas">
            <WorkflowCanvas
              workflowId={recordType.workflow_id}
              states={graph.states}
              transitions={graph.transitions}
              canvasLayout={current?.canvas_layout}
              onStateAdd={noop}
              onStateEdit={noop}
              onStateDelete={noop}
              onTransitionAdd={noop}
              onTransitionEdit={noop}
              onTransitionDelete={noop}
              onTransitionConfigure={noop}
              readOnly
            />
          </div>
        </div>
      )}

      {/* The association */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700/60 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          {t("eo.types.workflow.associate", "Associated workflow")}
        </h3>

        {/* The consequence, always on screen — not only in the refusal. */}
        <p
          data-testid="eo-workflow-consequence"
          className="text-sm text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700/60 rounded-lg px-3 py-2"
        >
          {t(
            "eo.types.workflow.consequence",
            "Changing the workflow strands every existing record: each record's state belongs to the old workflow, so no transition would run from it and no route would put it back. For that reason the workflow can be set only while this record type, and every type beneath it, holds no records.",
          )}
        </p>

        {workflowsQuery.isError && (
          <p
            data-testid="eo-workflow-list-unreadable"
            className="text-sm text-red-700 dark:text-red-300"
          >
            {eoRefusalMessage(
              workflowsQuery.error,
              t(
                "eo.types.workflow.listFailed",
                "The list of workflows could not be read. It needs the workflows view permission.",
              ),
            )}
          </p>
        )}

        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[16rem]">
            <label
              htmlFor="eo-workflow-select"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              {t("eo.types.workflow.select", "Workflow")}
            </label>
            <select
              id="eo-workflow-select"
              data-testid="eo-workflow-select"
              className={inputClass}
              value={choice}
              disabled={lock !== null || workflowsQuery.isError}
              onChange={(e) => setChoice(e.target.value)}
            >
              <option value="">
                {t("eo.types.workflow.noneOption", "No workflow")}
              </option>
              {eoWorkflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {stateName(w)}
                </option>
              ))}
              {/* The stored workflow, when it is not an `eo` one or the list
                  could not name it: the select must still show the truth. */}
              {currentId && !eoWorkflows.some((w) => w.id === currentId) && (
                <option value={currentId}>
                  {current ? stateName(current) : currentId}
                </option>
              )}
            </select>
          </div>
          <button
            type="button"
            data-testid="eo-workflow-save"
            disabled={lock !== null || !dirty || update.isPending}
            onClick={save}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {update.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {t("eo.types.workflow.save", "Save workflow")}
          </button>
        </div>

        {lock !== null && (
          <p
            data-testid="eo-workflow-lock"
            data-lock={lock}
            className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400"
          >
            <Lock className="w-4 h-4 shrink-0 mt-0.5" />
            {lockMessage[lock]}
          </p>
        )}

        {caution !== null && (
          <p
            data-testid="eo-workflow-caution"
            data-caution={caution}
            className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400"
          >
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            {cautionMessage[caution]}
          </p>
        )}

        {refusal && (
          <EoRefusalBanner refusal={refusal} testId="eo-workflow-refusal" />
        )}
        {failure && (
          <div
            data-testid="eo-workflow-failure"
            className="rounded-lg border border-red-300 dark:border-red-700/60 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-800 dark:text-red-300"
          >
            {failure}
          </div>
        )}
      </div>
    </div>
  );
};

export default EoWorkflowTab;
