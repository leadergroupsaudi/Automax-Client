import apiClient from "./client";
import type { ApiResponse } from "../types";

export type TicketTypeLevel = "main" | "sub" | "sub_sub" | "universal";
export type TicketTypeStatus = "draft" | "live" | "not_started";

export type TicketTypeFieldType =
  | "text"
  | "number"
  | "date"
  | "date_hijri_gregorian"
  | "select"
  | "checkbox"
  | "user"
  | "org_unit"
  | "file"
  | "linked_ticket_type";

export interface TicketTypeFieldDef {
  label: string;
  handle: string;
  type: TicketTypeFieldType;
  required?: boolean;
  multi?: boolean;
  options?: string[];
}

export type LinkCardinality = "one" | "many";

export type LinkBehaviourCode =
  | "blocks_parent_closure"
  | "deadline_from_parent"
  | "closes_the_parent"
  | "blocks_an_earlier_step"
  | "repeating_cycle"
  | "fallback_sibling"
  | "spawns_into_another_subsystem";

// Returned by list endpoint — flattened for the tree view.
export interface TicketType {
  id: string;
  code: string;
  handle: string;
  name: string;
  name_ar: string;
  level: TicketTypeLevel;
  subsystem: string;
  parent_type_name: string;
  reference_pattern: string;
  linked_count: number;
  status: TicketTypeStatus;
  depth: number;
  next_reference: string;
}

// Returned by GET /ticket-types/{code} under `data.type`.
export interface TicketTypeDetail {
  id: string;
  code: string;
  handle: string;
  name: string;
  name_ar: string;
  level: TicketTypeLevel;
  subsystem: string;
  parent_type_id: string | null;
  reference_pattern: string;
  sequence_key: string;
  workflow_id: string | null;
  fields: TicketTypeFieldDef[] | null;
  status: TicketTypeStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TicketTypeLink {
  id: string;
  parent_type_id: string;
  child_type_id: string;
  child_type: TicketTypeDetail;
  cardinality: LinkCardinality;
  behaviours: LinkBehaviourCode[];
  due_within_parent: boolean;
  allow_cross_subsystem: boolean;
  inherit_classification: boolean;
  auto_create_on_open: boolean;
  optional: boolean;
  note: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TicketTypeFullResponse {
  type: TicketTypeDetail;
  links: TicketTypeLink[];
  next_reference: string;
}

export interface TicketTypeListParams {
  status?: TicketTypeStatus[];
  level?: TicketTypeLevel[];
  search?: string;
}

export interface TicketTypeCreateRequest {
  code: string;
  handle: string;
  name: string;
  name_ar?: string;
  level: TicketTypeLevel;
  reference_pattern: string;
  subsystem: string;
  parent_type_id?: string;
}

export interface TicketTypeUpdateRequest {
  name?: string;
  name_ar?: string;
  handle?: string;
  reference_pattern?: string;
  subsystem?: string;
  workflow_id?: string;
  status?: TicketTypeStatus;
}

export interface TicketTypeSetFieldsRequest {
  fields: TicketTypeFieldDef[];
}

export interface TicketTypeSetLinkRequest {
  child_type_code: string;
  cardinality: LinkCardinality;
  behaviours: LinkBehaviourCode[];
  note?: string;
  due_within_parent?: boolean;
  allow_cross_subsystem?: boolean;
  inherit_classification?: boolean;
  auto_create_on_open?: boolean;
  optional?: boolean;
}

export const ticketTypeApi = {
  list: async (
    params: TicketTypeListParams = {},
  ): Promise<ApiResponse<TicketType[]>> => {
    const query = new URLSearchParams();
    if (params.status?.length) query.set("status", params.status.join(","));
    if (params.level?.length) query.set("level", params.level.join(","));
    if (params.search) query.set("search", params.search);
    const qs = query.toString();
    const response = await apiClient.get<ApiResponse<TicketType[]>>(
      `/ticket-types/${qs ? `?${qs}` : ""}`,
    );
    return response.data;
  },

  getByCode: async (
    code: string,
  ): Promise<ApiResponse<TicketTypeFullResponse>> => {
    const response = await apiClient.get<ApiResponse<TicketTypeFullResponse>>(
      `/ticket-types/${code}`,
    );
    return response.data;
  },

  create: async (
    data: TicketTypeCreateRequest,
  ): Promise<ApiResponse<TicketTypeDetail>> => {
    const response = await apiClient.post<ApiResponse<TicketTypeDetail>>(
      `/ticket-types/`,
      data,
    );
    return response.data;
  },

  update: async (
    code: string,
    data: TicketTypeUpdateRequest,
  ): Promise<ApiResponse<TicketTypeDetail>> => {
    const response = await apiClient.put<ApiResponse<TicketTypeDetail>>(
      `/ticket-types/${code}`,
      data,
    );
    return response.data;
  },

  setFields: async (
    code: string,
    data: TicketTypeSetFieldsRequest,
  ): Promise<ApiResponse<TicketTypeDetail>> => {
    const response = await apiClient.put<ApiResponse<TicketTypeDetail>>(
      `/ticket-types/${code}/fields`,
      data,
    );
    return response.data;
  },

  setLink: async (
    code: string,
    data: TicketTypeSetLinkRequest,
  ): Promise<ApiResponse<TicketTypeLink>> => {
    const response = await apiClient.put<ApiResponse<TicketTypeLink>>(
      `/ticket-types/${code}/links`,
      data,
    );
    return response.data;
  },
};
