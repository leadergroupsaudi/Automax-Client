import apiClient from "./client";
import type { ApiResponse } from "../types";
import type {
  EoRecord,
  EoRecordType,
  EoFieldDefinition,
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

  getChildren: async (id: string): Promise<ApiResponse<EoRecord[]>> => {
    const res = await apiClient.get(`/eo-records/${id}/children`);
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
