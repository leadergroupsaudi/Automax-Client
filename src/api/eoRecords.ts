import apiClient from "./client";
import type { ApiResponse } from "../types";
import type {
  EoRecord,
  EoRecordType,
  EoFieldDefinition,
  EoFileUploadResult,
  EoRecordFilter,
  EoRecordListResponse,
  EoRecordCreateRequest,
  EoRecordUpdateRequest,
  EoTransitionRequest,
  EoAvailableTransition,
  EoWorkflowState,
} from "../types/eoRecord";

/**
 * Shared param builder so the register, "my assigned" and any future export
 * stay in step. The array-valued filters are repeated params — Fiber's
 * QueryParser binds `?record_type_id=a&record_type_id=b` into []string.
 */
const buildEoFilterParams = (f: EoRecordFilter): URLSearchParams => {
  const params = new URLSearchParams();
  if (f.page) params.append("page", String(f.page));
  if (f.limit) params.append("limit", String(f.limit));
  const repeat = (key: string, vals?: string[]) =>
    (vals ?? []).forEach((v) => v && params.append(key, v));
  repeat("record_type_id", f.record_type_id);
  repeat("state_id", f.state_id);
  repeat("owning_body_id", f.owning_body_id);
  repeat("assigned_user_id", f.assigned_user_id);
  repeat("priority", f.priority);
  repeat("sensitivity", f.sensitivity);
  repeat("source", f.source);
  if (f.parent_record_id) params.append("parent_record_id", f.parent_record_id);
  if (f.search) params.append("search", f.search);
  if (f.sort_by) params.append("sort_by", f.sort_by);
  if (f.sort_dir) params.append("sort_dir", f.sort_dir);
  return params;
};

export const eoRecordTypeApi = {
  list: async (): Promise<ApiResponse<EoRecordType[]>> => {
    const res = await apiClient.get("/admin/eo-record-types");
    return res.data;
  },

  /**
   * A type's OWN field definitions. Inherited fields are not included; merge
   * with the ancestors' via resolveEffectiveFields().
   */
  listFields: async (
    typeId: string,
  ): Promise<ApiResponse<EoFieldDefinition[]>> => {
    const res = await apiClient.get(`/admin/eo-record-types/${typeId}/fields`);
    return res.data;
  },
};

export const eoWorkflowApi = {
  /**
   * Records carry only `state_id`, so the register resolves state names from
   * the record type's workflow. This endpoint wants `workflows:view` and the
   * `workflows` licence feature, neither of which EO itself implies — callers
   * must degrade gracefully when it 403s.
   */
  listStates: async (
    workflowId: string,
  ): Promise<ApiResponse<EoWorkflowState[]>> => {
    const res = await apiClient.get(`/admin/workflows/${workflowId}/states`);
    return res.data;
  },
};

export const eoRecordApi = {
  list: async (filter: EoRecordFilter = {}): Promise<EoRecordListResponse> => {
    const res = await apiClient.get(
      `/eo-records?${buildEoFilterParams(filter)}`,
    );
    return res.data;
  },

  myAssigned: async (
    filter: EoRecordFilter = {},
  ): Promise<EoRecordListResponse> => {
    const res = await apiClient.get(
      `/eo-records/my-assigned?${buildEoFilterParams(filter)}`,
    );
    return res.data;
  },

  search: async (
    body: Record<string, unknown>,
  ): Promise<EoRecordListResponse> => {
    const res = await apiClient.post("/eo-records/search", body);
    return res.data;
  },

  getById: async (id: string): Promise<ApiResponse<EoRecord>> => {
    const res = await apiClient.get(`/eo-records/${id}`);
    return res.data;
  },

  create: async (
    data: EoRecordCreateRequest,
  ): Promise<ApiResponse<EoRecord>> => {
    const res = await apiClient.post("/eo-records", data);
    return res.data;
  },

  update: async (
    id: string,
    data: EoRecordUpdateRequest,
  ): Promise<ApiResponse<EoRecord>> => {
    const res = await apiClient.put(`/eo-records/${id}`, data);
    return res.data;
  },

  getAvailableTransitions: async (
    id: string,
  ): Promise<ApiResponse<EoAvailableTransition[]>> => {
    const res = await apiClient.get(`/eo-records/${id}/transitions`);
    return res.data;
  },

  transition: async (
    id: string,
    data: EoTransitionRequest,
  ): Promise<ApiResponse<EoRecord>> => {
    const res = await apiClient.post(`/eo-records/${id}/transition`, data);
    return res.data;
  },

  /**
   * The record's direct children — PAGINATED, like every other EO list.
   *
   * The handler routes this through its shared `list` (Children in
   * eo_record_handler.go), so it clamps page and limit and answers with the
   * register's envelope; the default limit is 20. It was typed here as
   * ApiResponse<EoRecord[]>, which parsed (the envelope has a `data` array)
   * but hid both the limit and the true total from every caller.
   */
  getChildren: async (
    id: string,
    filter: Pick<EoRecordFilter, "page" | "limit"> = {},
  ): Promise<EoRecordListResponse> => {
    const params = buildEoFilterParams(filter);
    const query = params.toString();
    const res = await apiClient.get(
      `/eo-records/${id}/children${query ? `?${query}` : ""}`,
    );
    return res.data;
  },

  addLink: async (
    id: string,
    data: Record<string, unknown>,
  ): Promise<ApiResponse<unknown>> => {
    const res = await apiClient.post(`/eo-records/${id}/links`, data);
    return res.data;
  },
};

/**
 * Puts a readable body back on a rejected BLOB request.
 *
 * `responseType: "blob"` applies to the error response too, so a refused
 * download or preview arrives with `response.data` as a Blob and every
 * message extractor reads `undefined` off it — which is how the 503 naming
 * EO_DOCUMENTA_ENABLED=false was being thrown away and replaced with
 * "Could not open that file". Reading the Blob is asynchronous, so it cannot
 * be done in the synchronous extractor; it is done here, at the only place
 * that knows the response was requested as a Blob.
 *
 * This is the api layer's one try/catch, and it does not swallow anything:
 * the SAME rejection is re-thrown, with a parsed body where there was one.
 * A non-JSON body (a proxy's HTML error page) is left as it was, so it
 * cannot be mistaken for Automax speaking — see eoDocumentaDisabledMessage.
 */
const withDecodedBlobError = async (error: unknown): Promise<unknown> => {
  const res = (error as { response?: { data?: unknown } })?.response;
  if (res && res.data instanceof Blob) {
    try {
      const text = await res.data.text();
      if (text.trim()) res.data = JSON.parse(text);
    } catch {
      // Not JSON. Leave the Blob in place rather than inventing a message.
    }
  }
  return error;
};

/**
 * The three file routes of §7.12. They are the ONLY way a client obtains a
 * Documenta file id, which is what a `file` / `multi_file` field stores, and
 * the only way one is read back — the reads stream the bytes through Automax
 * rather than redirecting, because the record id in the path is the gate.
 *
 * No try/catch here, per the api-layer convention: a 503 (EO Documenta
 * disabled), 409 (the record has no Documenta folder), 403, 404 or 502
 * propagates as an axios rejection and the caller decides what to show.
 */
export const eoFileApi = {
  /**
   * Multipart, field name `file` — the same name the KPI evidence upload uses
   * and the name the handler reads. The record must already exist: the route
   * files into THAT record's Documenta folder.
   */
  upload: async (
    recordId: string,
    file: File,
  ): Promise<ApiResponse<EoFileUploadResult>> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await apiClient.post(
      `/eo-records/${recordId}/files`,
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return res.data;
  },

  /**
   * Raw bytes, Content-Disposition: attachment.
   *
   * The record stores only the file id, so the server's filename is the only
   * name a reader can be given — and it is readable here only when the
   * browser is allowed to see the header. The API is cross-origin and the
   * server does not list Content-Disposition in Access-Control-Expose-Headers
   * (cmd/server/main.go CORS), so today this is usually undefined and the
   * caller falls back to a generic name. Parsing it anyway costs nothing and
   * starts working the day the header is exposed.
   */
  download: async (
    recordId: string,
    fileId: string,
  ): Promise<{ blob: Blob; fileName?: string }> => {
    try {
      const res = await apiClient.get(
        `/eo-records/${recordId}/files/${fileId}`,
        { responseType: "blob" },
      );
      const disposition = String(res.headers?.["content-disposition"] ?? "");
      const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
      return {
        blob: res.data as Blob,
        fileName: match ? decodeURIComponent(match[1]) : undefined,
      };
    } catch (error) {
      throw await withDecodedBlobError(error);
    }
  },

  /** The same bytes served inline, for opening in a viewer tab. */
  preview: async (recordId: string, fileId: string): Promise<Blob> => {
    try {
      const res = await apiClient.get(
        `/eo-records/${recordId}/files/${fileId}/preview`,
        { responseType: "blob" },
      );
      return res.data as Blob;
    } catch (error) {
      throw await withDecodedBlobError(error);
    }
  },
};
