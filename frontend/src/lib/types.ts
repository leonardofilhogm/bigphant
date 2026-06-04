// Frontend types mirroring the Wails contracts in docs/prd.md §8.
// During the scaffold phase these are populated from mock data; once the Go
// backend is wired up they will be replaced by the generated wailsjs models.

export interface ConnectionMeta {
  id: string
  created_at?: string
  locked?: boolean
  name: string
  driver: string
  host: string
  port: number
  username: string
  default_database: string
  sslmode: string
  read_only: boolean
  // string (not TransactionMode) to match the generated Wails model.
  transaction_mode: string
  // How rows are edited in the grid; string to match the generated Wails model.
  edit_mode: string
  label: string
  label_color: string
  folder: string
}

export type TransactionMode = "auto_commit" | "explicit_commit"

// Row-editing method, persisted per connection:
//  - inline:     edit cells in place; the side panel is not used.
//  - mixed:      single-click a cell to edit inline, double-click to open the panel.
//  - side_panel: every click opens the side panel; no inline editing.
export type EditMode = "inline" | "mixed" | "side_panel"

export interface ConnectionInput {
  name: string
  driver: string
  host: string
  port: number
  username: string
  password: string
  default_database: string
  sslmode: string
  read_only: boolean
  transaction_mode: TransactionMode
  // Carried through the form unchanged; the backend defaults a blank to "mixed".
  edit_mode: string
  label: string
  label_color: string
  folder: string
}

export interface TableSummary {
  name: string
  row_count: number
  engine: string
  size_bytes: number
  data_size_bytes: number
  index_size_bytes: number
  charset: string
}

export type EntityKind =
  | "view"
  | "materialized_view"
  | "function"
  | "procedure"
  | "trigger"
  | "sequence"
  | "event"
  | "enum"

export interface Entity {
  name: string
  kind: EntityKind | string
  schema: string
  owner: string
  extra: string
}

export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  default?: string | null
  key: string // "PRI" | "UNI" | "MUL" | ""
  extra: string // e.g. "auto_increment"
}

export interface IndexInfo {
  name: string
  columns: string[]
  unique: boolean
}

export interface TableStructure {
  columns: ColumnInfo[]
  indexes: IndexInfo[]
  primary_key: string[]
}

export interface ColumnDef {
  name: string
  type: string
  nullable: boolean
  has_default: boolean
  default: string
  default_is_expr: boolean
  auto_increment: boolean
  comment: string
}

export interface IndexDef {
  name: string
  columns: string[]
  unique: boolean
}

export interface ForeignKeyDef {
  name: string
  columns: string[]
  ref_table: string
  ref_columns: string[]
  on_delete: string
  on_update: string
}

export interface AlterOp {
  kind: string
  column?: ColumnDef
  old_name?: string
  new_name?: string
  position?: string
  index?: IndexDef
  foreign_key?: ForeignKeyDef
  name?: string
  columns?: string[]
  check?: string
}

export interface AlterTableRequest {
  database: string
  table: string
  ops: AlterOp[]
}

export interface AlterPreview {
  sql: string[]
  destructive: boolean
}

export interface Column {
  name: string
  type: string
}

export type Comparator =
  | "="
  | "!="
  | ">"
  | "<"
  | ">="
  | "<="
  | "LIKE"
  | "IS NULL"
  | "IS NOT NULL"

export interface Filter {
  column: string
  comparator: Comparator
  value: string
  // UI-only: when false the filter row is kept but excluded on Apply. Stripped
  // by the generated Filter model before reaching the Go backend.
  enabled?: boolean
}

export interface ResultSet {
  columns: Column[]
  rows: unknown[][]
  row_count: number
  sql: string
}

export interface FetchRowsRequest {
  database: string
  table: string
  filters: Filter[]
  limit: number
  offset: number
  order_by: string
  order_dir: string
}

export interface AppSettings {
  allow_destructive_without_where: boolean
  // string (not TransactionMode) to match the generated Wails model.
  default_transaction_mode: string
  theme: string
  onboarding_completed: boolean
}

export interface ExecOptions {
  bypass_destructive_check: boolean
  database: string
}

export interface RawResult {
  is_query: boolean
  result_set?: ResultSet
  affected_rows: number
  duration_ms: number
  status: string // "ok" | "destructive_blocked" | "destructive_confirm"
}
