import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertCircle, ExternalLink, Loader2, Lock } from "lucide-react";
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
 * WHY THE CONTROL IS ENABLED ONLY ON A COUNT THAT CAN BE TRUSTED. The server
 * refuses the repoint while the type or ANY TYPE BENEATH IT holds records,
 * counted as an administrator over everything. This screen's count is the
 * caller's own register view: it is narrowed for anyone who is not a super
 * admin, and partial while its queries are still landing. "0" from either is
 * "cannot confirm empty", not "empty" — so the control opens only on a
 * settled, un-narrowed, readable zero. The server still decides; this only
 * stops the tab from inviting an edit it cannot know is allowed.
 */
export const EoWorkflowTab: React.FC<{
  recordType: EoRecordTypeDetail;
  types: EoRecordType[];
}> = ({ recordType, types }) => {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(PERMISSIONS.EO_TYPES_MANAGE);
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

  // The ONE place the gate is decided, and the reason it is closed.
  type Lock =
    | "permission"
    | "pending"
    | "unreadable"
    | "narrowed"
    | "records"
    | "unknown"
    | null;
  const lock: Lock = !canManage
    ? "permission"
    : isPending
      ? "pending"
      : isUnreadable
        ? "unreadable"
        : isNarrowed
          ? "narrowed"
          : records === undefined
            ? "unknown"
            : records > 0
              ? "records"
              : null;

  const lockMessage: Record<Exclude<Lock, null>, string> = {
    permission: t(
      "eo.types.workflow.lockPermission",
      "Associating a workflow needs the permission to manage record types.",
    ),
    pending: t(
      "eo.types.workflow.lockPending",
      "Checking whether this record type holds records…",
    ),
    unreadable: t(
      "eo.types.workflow.lockUnreadable",
      "Some record counts could not be read, so this record type cannot be confirmed empty. Treat that as not empty.",
    ),
    narrowed: t(
      "eo.types.workflow.lockNarrowed",
      "Your count of records is taken from your own view of the registers and may be lower than what the server holds, so this record type cannot be confirmed empty from here. The server decides; a super administrator can confirm.",
    ),
    unknown: t(
      "eo.types.workflow.lockUnknown",
      "This record type has no register of its own to count, so it cannot be confirmed empty from here.",
    ),
    records: t("eo.types.workflow.lockRecords", {
      count: records ?? 0,
      defaultValue: `This record type and the types beneath it hold ${records ?? 0} records. A workflow cannot be changed while any exist.`,
    }),
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
