/**
 * Project-analysis record shapes shared by the focused SQLite operation modules.
 */
export interface ProjectFileRecord {
  id?: number;
  file_path: string;
  relative_path: string;
  file_type: string;
  language: string;
  category: string;
  size_bytes: number;
  line_count: number;
  last_modified: string;
  last_analyzed?: string;
  branch_id: number;
  is_entry_point: boolean;
  has_tests: boolean;
  complexity: "low" | "medium" | "high";
  documentation_percentage: number;
  analysis_metadata?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CodeInterfaceRecord {
  id?: number;
  name: string;
  file_id: number;
  line_number: number;
  interface_type: string;
  definition: string;
  properties?: string;
  extends_interfaces?: string;
  language?: string;
  qualified_name?: string;
  namespace?: string;
  kind?: string;
  signature?: string;
  documentation?: string;
  visibility?: string;
  start_line?: number;
  end_line?: number;
  container_name?: string;
  stable_id?: string;
  source_hash?: string;
  metadata?: string;
  summary?: string;
  rank_text?: string;
  is_exported: boolean;
  is_generic: boolean;
  usage_count: number;
  last_used?: string;
  embedding?: Buffer;
  created_at?: string;
  updated_at?: string;
}

export interface ProjectDependencyRecord {
  id?: number;
  from_file_id: number;
  to_file_id?: number;
  dependency_type: string;
  source_identifier: string;
  target_identifier?: string;
  line_number: number;
  is_default_import: boolean;
  is_namespace_import: boolean;
  is_type_only: boolean;
  external_package?: string;
  resolution_status: "resolved" | "unresolved" | "error";
  created_at?: string;
  updated_at?: string;
}

export interface WorkspaceContextRecord {
  id?: number;
  workspace_name: string;
  workspace_path: string;
  project_type: string;
  package_manager: string;
  root_path: string;
  config_files?: string;
  entry_points?: string;
  frameworks?: string;
  languages?: string;
  workspace_dependencies?: string;
  total_files: number;
  total_size_bytes: number;
  last_indexed: string;
  indexing_status: "pending" | "indexing" | "completed" | "error";
  branch_id: number;
  created_at?: string;
  updated_at?: string;
}

export interface InterfaceRelationshipRecord {
  id?: number;
  from_interface_id: number;
  to_interface_id: number;
  relationship_type: string;
  confidence_score: number;
  semantic_similarity: number;
  usage_frequency: number;
  last_detected: string;
  created_at?: string;
}
