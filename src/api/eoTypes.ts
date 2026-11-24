import apiClient from "./client";
import type { ApiResponse } from "../types";
import type {
  EoDestructiveConfirmation,
  EoFieldDefinition,
  EoFieldDefRequest,
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

/**
 * The three write routes over a type's OWN field definitions, all on
 * `eo:types:manage`. The read is deliberately not duplicated here:
 * `eoRecordTypeApi.listFields` in api/eoRecords.ts already serves it, and the
 * designer shares that query key so a field added here reaches every open
 * record form without a reload.
 *
 * TWO DIFFERENT REFUSALS COME BACK FROM THESE ROUTES, and a caller that
 * reads only one of them loses the other:
 *
 *  - 400 `{success:false, errors:{attr: message}, error:"<headline>"}` —
 *    handlers.eoValidateFieldShape found the attribute set malformed. The map
 *    is authoritative and the headline is capped at three attributes.
 *  - 400 `{success:false, error:"<sentence>"}` with NO map — the §7.14 guard
 *    rail refused the edit because the type, or a type beneath it, holds
 *    records. The sentence names the field and what about the change is
 *    destructive, and it is the whole value of the refusal.
 *
 * See `eoDestructiveRefusal` in lib/eoFields.ts, which tells them apart by
 * the shape of the body rather than by reading the sentence.
 */
export const eoTypeFieldApi = {
  create: async (
    typeId: string,
    data: EoFieldDefRequest,
  ): Promise<ApiResponse<EoFieldDefinition>> => {
    const res = await apiClient.post(
      `/admin/eo-record-types/${typeId}/fields`,
      data,
    );
    return res.data;
  },

  /** PUT REPLACES the attribute set; send the whole shape. */
  update: async (
    typeId: string,
    fieldId: string,
    data: EoFieldDefRequest,
  ): Promise<ApiResponse<EoFieldDefinition>> => {
    const res = await apiClient.put(
      `/admin/eo-record-types/${typeId}/fields/${fieldId}`,
      data,
    );
    return res.data;
  },

  /**
   * DELETE carries an OPTIONAL body — §7.14's confirmation has nowhere else
   * to travel on a route with no attribute set. An absent body is the
   * ordinary unconfirmed removal; a body that is PRESENT and unparseable is
   * refused outright, so axios must not be handed `undefined` dressed up as
   * a payload. Task F5 fills `confirm`; F2 never sends one.
   */
  remove: async (
    typeId: string,
    fieldId: string,
    confirm?: EoDestructiveConfirmation,
  ): Promise<ApiResponse<unknown>> => {
    const res = await apiClient.delete(
      `/admin/eo-record-types/${typeId}/fields/${fieldId}`,
      confirm ? { data: { confirm_destructive: confirm } } : undefined,
    );
    return res.data;
  },
};
