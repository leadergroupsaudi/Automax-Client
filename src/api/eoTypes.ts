import apiClient from "./client";
import type { ApiResponse } from "../types";
import type {
  EoRecordType,
  EoRecordTypeDetail,
  EoRecordTypeRequest,
} from "../types/eoRecord";

/**
 * The EO record-type designer's service module: the five routes of
 * /admin/eo-record-types that act on types themselves. Field definitions and
 * link types are the other four routes on the same group and belong to the
 * tabs that edit them (Tasks F3 and F4); `eoRecordTypeApi.listFields` in
 * api/eoRecords.ts already reads the field definitions for the record forms.
 *
 * Permissions, as handlers.EORecordTypeHandler.RegisterRoutes gates them:
 * the two READS are `eo:view` — Plan 3 widened them deliberately, because
 * every EO screen is generated from the catalogue and gating the reads on a
 * management permission made the record forms unrenderable for the pilot
 * operator role. The three WRITES are `eo:types:manage`. The whole group also
 * sits behind the `eo_platform` licence feature (cmd/server/main.go).
 *
 * No try/catch, per the api-layer convention: rejections propagate to the
 * react-query `onError` / the caller's `mutateAsync` catch. A validation
 * refusal is `400 {success:false, errors:{field: message}, error: "<summary>"}`
 * — `errors` is authoritative and `error` is a headline capped at three
 * fields (handlers.eoFieldErrorSummary).
 */
export const eoTypeApi = {
  /**
   * The catalogue. NOTE: list rows carry NO field definitions — the handler
   * serves the repository rows unchanged and only Get sets `Fields`. That is
   * why the return type is EoRecordType[] and not EoRecordTypeDetail[].
   */
  list: async (): Promise<ApiResponse<EoRecordType[]>> => {
    const res = await apiClient.get("/admin/eo-record-types");
    return res.data;
  },

  /** One type WITH its own field definitions (not its ancestors'). */
  getById: async (id: string): Promise<ApiResponse<EoRecordTypeDetail>> => {
    const res = await apiClient.get(`/admin/eo-record-types/${id}`);
    return res.data;
  },

  create: async (
    data: EoRecordTypeRequest,
  ): Promise<ApiResponse<EoRecordTypeDetail>> => {
    const res = await apiClient.post("/admin/eo-record-types", data);
    return res.data;
  },

  /**
   * PUT REPLACES the attribute set. Send the whole shape; an omitted key is
   * an empty value server-side, not "unchanged".
   */
  update: async (
    id: string,
    data: EoRecordTypeRequest,
  ): Promise<ApiResponse<EoRecordTypeDetail>> => {
    const res = await apiClient.put(`/admin/eo-record-types/${id}`, data);
    return res.data;
  },

  /**
   * Soft-delete. The server REFUSES with 409 while the type holds records,
   * and also while any other type names it as `parent_type_id` — a
   * soft-deleted parent is invisible to the ancestor walk and would break
   * every descendant's create, update and transition.
   */
  remove: async (id: string): Promise<ApiResponse<unknown>> => {
    const res = await apiClient.delete(`/admin/eo-record-types/${id}`);
    return res.data;
  },
};
