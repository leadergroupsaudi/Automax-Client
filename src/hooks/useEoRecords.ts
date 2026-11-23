import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useQuery,
  useQueries,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  eoFileApi,
  eoRecordApi,
  eoRecordTypeApi,
  eoWorkflowApi,
} from "../api/eoRecords";
import {
  eoDocumentaDisabledMessage,
  eoErrorMessage,
  resolveEffectiveFields,
} from "../lib/eoFields";
import type {
  EoDocumentaStatus,
  EoFieldDefinition,
  EoRecordFilter,
  EoRecordSearchBody,
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
  search: (body: EoRecordSearchBody) =>
    [...eoKeys.all, "search", body] as const,
  myAssigned: (filter: EoRecordFilter) =>
    [...eoKeys.all, "my-assigned", filter] as const,
  details: () => [...eoKeys.all, "detail"] as const,
  detail: (id: string) => [...eoKeys.details(), id] as const,
  transitions: (id: string) => [...eoKeys.all, "transitions", id] as const,
  children: (id: string) => [...eoKeys.all, "children", id] as const,
  documenta: () => [...eoKeys.all, "documenta-status"] as const,
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

/**
 * POST /eo-records/search — the only list route that binds a BODY, which is
 * what lets the record picker send `record_type_id` as the []string the
 * handler's filter actually declares (the GET form needs repeated params).
 *
 * `enabled` is how the picker avoids querying the whole register until its
 * dropdown is opened, and keepPreviousData stops the result list blanking
 * between keystrokes while the debounced term catches up.
 */
export function useEoRecordSearch(body: EoRecordSearchBody, enabled = true) {
  return useQuery({
    queryKey: eoKeys.search(body),
    queryFn: () =>
      eoRecordApi.search(body as unknown as Record<string, unknown>),
    enabled,
    placeholderData: keepPreviousData,
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

// ──────────────────────────────────────────────────
// Attachments (§7.12)
// ──────────────────────────────────────────────────

/** Nothing has told us otherwise yet. */
const EO_DOCUMENTA_ASSUMED: EoDocumentaStatus = { available: true };

/**
 * Whether EO documents can be stored in this deployment.
 *
 * There is no endpoint that answers this. The upload route refuses with a 503
 * naming EO_DOCUMENTA_ENABLED=false, and that refusal is the only signal there
 * is — so it is written into the query cache and every file field reads it
 * from there. One field's 503 therefore teaches the rest of the form, instead
 * of each one having to fail on its own before it can say so.
 *
 * `enabled: false` with a queryFn that is never called is deliberate: the
 * query exists purely as a SUBSCRIPTION to a cache entry the mutation below
 * writes.
 */
export function useEoDocumentaStatus(): EoDocumentaStatus {
  const { data } = useQuery<EoDocumentaStatus>({
    queryKey: eoKeys.documenta(),
    queryFn: async () => EO_DOCUMENTA_ASSUMED,
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return data ?? EO_DOCUMENTA_ASSUMED;
}

/**
 * POST /eo-records/:id/files — the only way to obtain a Documenta file id.
 *
 * No toast and no onError beyond the status flag: the refusals are per-field
 * facts (503 the deployment, 409 this record's missing folder, 502 an
 * unusable id from Documenta) and belong under the control the user just
 * used, in the server's own words. The record's caches are NOT invalidated,
 * because an upload changes nothing about the record until the form is saved
 * with the returned id.
 */
export function useUploadEoRecordFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ recordId, file }: { recordId: string; file: File }) =>
      eoFileApi.upload(recordId, file),
    onSuccess: () => {
      queryClient.setQueryData<EoDocumentaStatus>(eoKeys.documenta(), {
        available: true,
      });
    },
    onError: (error: unknown) => {
      // The PAYLOAD decides, not the status: a proxy's bare 503 is a network
      // failure of this one upload, not a statement about the deployment.
      const disabled = eoDocumentaDisabledMessage(error);
      if (disabled) {
        queryClient.setQueryData<EoDocumentaStatus>(eoKeys.documenta(), {
          available: false,
          message: disabled,
        });
      }
    },
  });
}

/** Blob types a preview may RENDER. Everything else is handed over as bytes. */
const EO_PREVIEWABLE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
]);

/** "text/html; charset=utf-8" → "text/html"; anything unparseable → "". */
const baseMimeType = (type: string | undefined): string =>
  (type ?? "").split(";")[0].trim().toLowerCase();

/** What a preview is currently showing, as an object URL the frame loads. */
export interface EoFilePreviewState {
  url: string;
  name: string;
  type: string;
}

/**
 * Download / preview for one record's files.
 *
 * Both routes are authenticated and stream the bytes through Automax, so a
 * bare <a href> cannot be used: without the Bearer header it would 401, and
 * the global interceptor turns a 401 into a logout. The bytes come back
 * through apiClient as a Blob and are handed to the browser from an object
 * URL — the same shape documentApi.download already uses for DMS files.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHY PREVIEW IS NOT A WINDOW, AND WHY THE SERVER'S CSP DOES NOT REACH IT
 * ────────────────────────────────────────────────────────────────────────────
 * This was stored XSS until it was caught in review, and the mistake is one
 * any "preview a file" feature will make again, so it is written down here.
 *
 * The first version did `window.open("", "_blank")` and then set that
 * window's location to `URL.createObjectURL(blob)`. A `blob:` URL inherits
 * THE ORIGIN THAT CREATED IT — this application's. So an uploaded .html or
 * .svg previewed that way ran as first-party script: the JWT in
 * localStorage, the session, and every authenticated endpoint the viewer can
 * reach. Any user who could attach a file to a record could attack any user
 * who previewed it.
 *
 * Task B3 serves previews with `Content-Disposition: inline`,
 * `X-Content-Type-Options: nosniff` and `Content-Security-Policy:
 * default-src 'none'`, and those headers are correct. THEY ONLY APPLY WHEN
 * THE BROWSER FETCHES THE SERVER'S URL. Fetching the bytes with XHR throws
 * the response headers away; re-wrapping the body in a blob URL creates a
 * NEW document with no CSP at all, on a more dangerous origin than the one
 * the server put it on. The backend did the right thing and the frontend
 * undid it. A preview that re-hosts bytes must re-create the protection the
 * headers were providing, because it cannot inherit it.
 *
 * Two defences, both needed:
 *
 *  1. AN ALLOWLIST OF RENDERABLE TYPES, decided from the Blob's own `type`.
 *     `text/html` and `image/svg+xml` are the live vectors and are not on
 *     it; an empty or unrecognised type is not on it either. Anything off
 *     the list is never rendered — it is re-wrapped as
 *     `application/octet-stream` and saved, which cannot execute.
 *  2. A SANDBOXED FRAME, never a window. The frame carries `sandbox` WITHOUT
 *     `allow-same-origin`, so its document gets an opaque origin and a type
 *     that somehow slipped the allowlist still cannot reach this origin, its
 *     storage or its cookies. Navigating a window gives none of that.
 *
 * The download path is unaffected: `a.download` makes the browser save the
 * bytes rather than render them.
 */
export function useEoFileActions(recordId?: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<EoFilePreviewState | null>(null);

  /**
   * A READ refused for the same deployment reason teaches the shared flag
   * too. Without this, "one field's 503 teaches the rest of the form" was
   * true of uploads only, and a form went on offering a dropzone while every
   * download was being refused for exactly the reason the dropzone hides.
   */
  const noteDocumentaRefusal = (error: unknown) => {
    const disabled = eoDocumentaDisabledMessage(error);
    if (disabled) {
      queryClient.setQueryData<EoDocumentaStatus>(eoKeys.documenta(), {
        available: false,
        message: disabled,
      });
    }
  };

  /** Hands a blob to the browser as a saved file. Never renders it. */
  const saveBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const download = async (fileId: string, fileName?: string) => {
    if (!recordId) return;
    setBusyId(fileId);
    try {
      const { blob, fileName: served } = await eoFileApi.download(
        recordId,
        fileId,
      );
      saveBlob(
        blob,
        fileName || served || t("eo.file.defaultName", "attachment"),
      );
    } catch (error: unknown) {
      noteDocumentaRefusal(error);
      toast.error(
        eoErrorMessage(
          error,
          t("eo.file.downloadFailed", "Could not open that file"),
        ),
      );
    } finally {
      setBusyId(null);
    }
  };

  const closePreview = () =>
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });

  const openPreview = async (fileId: string, fileName?: string) => {
    if (!recordId) return;
    setBusyId(fileId);
    const name = fileName || t("eo.file.defaultName", "attachment");
    try {
      const blob = await eoFileApi.preview(recordId, fileId);
      const type = baseMimeType(blob.type);
      if (!EO_PREVIEWABLE_TYPES.has(type)) {
        // Re-wrapped so the type cannot drive a renderer anywhere, including
        // whatever the browser does with a dragged or re-opened download.
        saveBlob(new Blob([blob], { type: "application/octet-stream" }), name);
        toast.info(
          t(
            "eo.file.previewNotSupported",
            "This kind of file cannot be previewed safely, so it was downloaded instead.",
          ),
        );
        return;
      }
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url: URL.createObjectURL(blob), name, type };
      });
    } catch (error: unknown) {
      noteDocumentaRefusal(error);
      toast.error(
        eoErrorMessage(
          error,
          t("eo.file.previewFailed", "Could not preview that file"),
        ),
      );
    } finally {
      setBusyId(null);
    }
  };

  return { download, openPreview, closePreview, preview, busyId };
}
