// ──────────────────────────────────────────────────
// Documenta / MyDocs DMS Types
// ──────────────────────────────────────────────────

export interface DmsFile {
  uuid: string;
  name: string;
  type: "file" | "folder";
  size: number;
  mime_type: string;
  parent: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, string>;
}

export interface DmsComment {
  id: string;
  file_id: string;
  author: string;
  content: string;
  created_at: string;
}

export interface DmsListResult {
  files: DmsFile[];
}

export interface DmsSearchResult {
  files: DmsFile[];
  total: number;
}

export interface DmsVersion {
  uuid: string;
  node_uuid: string;
  version_number: number;
  size: number;
  description: string;
  source: string;
  created_by: string;
  created_by_name: string;
  created_at: string;
  is_current: boolean;
}
