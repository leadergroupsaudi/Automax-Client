import { useMemo } from "react";
import {
  useQuery,
  useQueries,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { eoRecordApi, eoRecordTypeApi, eoWorkflowApi } from "../api/eoRecords";
import { resolveEffectiveFields } from "../lib/eoFields";
import type {
  EoFieldDefinition,
  EoRecordFilter,
  EoRecordCreateRequest,
  EoRecordUpdateRequest,
  EoRecordType,
  EoTransitionRequest,
  EoWorkflowState,
} from "../types/eoRecord";

// ──────────────────────────────────────────────────
// Query Keys
// ──────────────────────────────────────────────────

export const eoKeys = {
  all: ["eo"] as const,
  types: () => [...eoKeys.all, "record-types"] as const,
  typeFields: (typeId: string) =>
    [...eoKeys.all, "record-type-fields", typeId] as const,
  states: (workflowId: string) =>
    [...eoKeys.all, "workflow-states", workflowId] as const,
  lists: () => [...eoKeys.all, "list"] as const,
  list: (filter: EoRecordFilter) => [...eoKeys.lists(), filter] as const,
  myAssigned: (filter: EoRecordFilter) =>
    [...eoKeys.all, "my-assigned", filter] as const,
  details: () => [...eoKeys.all, "detail"] as const,
  detail: (id: string) => [...eoKeys.details(), id] as const,
  transitions: (id: string) => [...eoKeys.all, "transitions", id] as const,
  children: (id: string) => [...eoKeys.all, "children", id] as const,
};

// ──────────────────────────────────────────────────
// Catalogue queries (static per deploy)
// ──────────────────────────────────────────────────

export function useEoRecordTypes() {
  return useQuery({
    queryKey: eoKeys.types(),
    queryFn: () => eoRecordTypeApi.list(),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/**
 * The effective field set for one record type: its own definitions merged with
 * every ancestor's. The server has no endpoint for this, so the ancestors'
 * definitions are fetched alongside and merged here by the same rules the
 * server uses (see lib/eoFields.ts).
 */
export function useEoEffectiveFields(typeId?: string) {
  const typesQuery = useEoRecordTypes();
  const allTypes = useMemo<EoRecordType[]>(
    () => typesQuery.data?.data ?? [],
    [typesQuery.data],
  );

  const typesById = useMemo(
    () => new Map(allTypes.map((t) => [t.id, t])),
    [allTypes],
  );

  // The chain of type ids whose definitions we need: the type and its ancestors.
  const chainIds = useMemo(() => {
    if (!typeId) return [] as string[];
    const ids: string[] = [];
    const seen = new Set<string>();
    let cur = typesById.get(typeId);
    while (cur && !seen.has(cur.id) && ids.length < 32) {
      seen.add(cur.id);
      ids.push(cur.id);
      cur = cur.parent_type_id ? typesById.get(cur.parent_type_id) : undefined;
    }
    return ids;
  }, [typeId, typesById]);

  const fieldQueries = useQueries({
    queries: chainIds.map((id) => ({
      queryKey: eoKeys.typeFields(id),
      queryFn: () => eoRecordTypeApi.listFields(id),
      staleTime: Infinity,
      gcTime: Infinity,
    })),
  });

  // useQueries returns a new array identity each render; key the memo off the
  // ids and the settled/raw payloads instead.
  const defsSignature = fieldQueries.map((q) => q.dataUpdatedAt).join(",");
  const fields = useMemo<EoFieldDefinition[]>(() => {
    if (!typeId) return [];
    const defsByTypeId = new Map<string, EoFieldDefinition[]>();
    chainIds.forEach((id, i) => {
      defsByTypeId.set(id, fieldQueries[i]?.data?.data ?? []);
    });
    return resolveEffectiveFields(
      typesById.get(typeId),
      typesById,
      defsByTypeId,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeId, chainIds, typesById, defsSignature]);

  return {
    fields,
    isLoading: typesQuery.isLoading || fieldQueries.some((q) => q.isLoading),
    error: typesQuery.error ?? fieldQueries.find((q) => q.error)?.error ?? null,
  };
}

/**
 * Workflow states for a record type's workflow, so the register can print a
 * state NAME where the record only carries a state_id.
 *
 * This endpoint belongs to the workflows module (permission `workflows:view`,
 * licence feature `workflows`), which an EO-only user may not hold, so it is
 * allowed to fail: `retry: false` and the caller falls back to "—".
 */
export function useEoWorkflowStates(workflowId?: string | null) {
  return useQuery({
    queryKey: eoKeys.states(workflowId ?? ""),
    queryFn: () => eoWorkflowApi.listStates(workflowId as string),
    enabled: !!workflowId,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
}

/** state_id → state, across every record type's workflow in one map. */
export function useEoStateMap(workflowIds: string[]) {
  const queries = useQueries({
    queries: workflowIds.map((id) => ({
      queryKey: eoKeys.states(id),
      queryFn: () => eoWorkflowApi.listStates(id),
      staleTime: Infinity,
      gcTime: Infinity,
      retry: false,
    })),
  });

  const signature = queries.map((q) => q.dataUpdatedAt).join(",");
  return useMemo(() => {
    const map = new Map<string, EoWorkflowState>();
    for (const q of queries) {
      for (const s of q.data?.data ?? []) map.set(s.id, s);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
}

// ──────────────────────────────────────────────────
// Record queries
// ──────────────────────────────────────────────────

export function useEoRecords(filter: EoRecordFilter = {}) {
  return useQuery({
    queryKey: eoKeys.list(filter),
    queryFn: () => eoRecordApi.list(filter),
  });
}

export function useEoMyAssigned(filter: EoRecordFilter = {}) {
  return useQuery({
    queryKey: eoKeys.myAssigned(filter),
    queryFn: () => eoRecordApi.myAssigned(filter),
  });
}

export function useEoRecord(id: string) {
  return useQuery({
    queryKey: eoKeys.detail(id),
    queryFn: () => eoRecordApi.getById(id),
    enabled: !!id,
  });
}

export function useEoTransitions(id: string) {
  return useQuery({
    queryKey: eoKeys.transitions(id),
    queryFn: () => eoRecordApi.getAvailableTransitions(id),
    enabled: !!id,
  });
}

export function useEoChildren(id: string) {
  return useQuery({
    queryKey: eoKeys.children(id),
    queryFn: () => eoRecordApi.getChildren(id),
    enabled: !!id,
  });
}

// ──────────────────────────────────────────────────
// Mutations
// ──────────────────────────────────────────────────
//
// Create and update deliberately carry NO onError toast. A 400 from the EO API
// is `{errors: {field_key: message}}`, and the form needs that map to put each
// message under its own control — so the page handles the rejection in its
// mutateAsync catch and toasts there. Transition keeps its toast because it
// has no per-field surface to map onto.

export function useCreateEoRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: EoRecordCreateRequest) => eoRecordApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eoKeys.lists() });
    },
  });
}

export function useUpdateEoRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: EoRecordUpdateRequest }) =>
      eoRecordApi.update(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: eoKeys.lists() });
      queryClient.invalidateQueries({ queryKey: eoKeys.detail(variables.id) });
    },
  });
}

export function useExecuteEoTransition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: EoTransitionRequest }) =>
      eoRecordApi.transition(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: eoKeys.lists() });
      queryClient.invalidateQueries({ queryKey: eoKeys.detail(variables.id) });
      queryClient.invalidateQueries({
        queryKey: eoKeys.transitions(variables.id),
      });
      queryClient.invalidateQueries({
        queryKey: eoKeys.children(variables.id),
      });
    },
    onError: (error: {
      response?: { data?: { message?: string; error?: string } };
    }) => {
      toast.error(
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          "Failed to execute transition",
      );
    },
  });
}
