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
  // SQLite only: path to the database file (non-secret).
  file_path: string
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
  // SSH tunnel metadata (non-secret); secrets are never sent to the frontend.
  ssh_enabled: boolean
  ssh_host: string
  ssh_port: number
  ssh_username: string
  ssh_auth_method: string
  ssh_key_path: string
  // AI Assistant status (non-secret).
  ai_enabled: boolean
  ai_mode: string // "db_user" | "app_layer" | ""
}

export type TransactionMode = "auto_commit" | "explicit_commit"

export type SSHAuthMethod = "password" | "key"

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
  // SQLite only: path to the database file.
  file_path: string
  default_database: string
  sslmode: string
  read_only: boolean
  transaction_mode: TransactionMode
  // Carried through the form unchanged; the backend defaults a blank to "mixed".
  edit_mode: string
  label: string
  label_color: string
  folder: string
  // SSH tunnel. Secrets are write-only: blank on edit means "keep stored value".
  ssh_enabled: boolean
  ssh_host: string
  ssh_port: number
  ssh_username: string
  ssh_auth_method: string
  ssh_password: string
  ssh_key_path: string
  ssh_private_key: string
  ssh_passphrase: string
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
  | "<>"
  | "<"
  | ">"
  | "<="
  | ">="
  | "IN"
  | "NOT IN"
  | "IS NULL"
  | "IS NOT NULL"
  | "BETWEEN"
  | "NOT BETWEEN"
  | "LIKE"
  // "NOT LIKE" is produced by resolveFilter (Not contains); not shown directly.
  | "NOT LIKE"
  | "Contains"
  | "Not contains"
  | "Starts with"
  | "Ends with"

export interface Filter {
  column: string
  // "Contains" is a UI-only convenience comparator; it is translated to a "LIKE"
  // with the value auto-wrapped in %…% before the filter reaches the Go backend
  // (see resolveFilter). The backend only accepts the SQL comparators above.
  comparator: Comparator
  value: string
  // UI-only: when false the filter row is kept but excluded on Apply. Stripped
  // by the generated Filter model before reaching the Go backend.
  enabled?: boolean
}

// Translate UI-only comparators into the SQL comparators the backend accepts.
// The substring/prefix/suffix shortcuts auto-wrap the value in % wildcards so
// users get the common LIKE patterns without typing them. Everything else
// (=, <>, IN, BETWEEN, IS NULL, raw LIKE, …) passes straight through.
export function resolveFilter(f: Filter): Filter {
  switch (f.comparator) {
    case "Contains":
      return { ...f, comparator: "LIKE", value: `%${f.value}%` }
    case "Not contains":
      return { ...f, comparator: "NOT LIKE", value: `%${f.value}%` }
    case "Starts with":
      return { ...f, comparator: "LIKE", value: `${f.value}%` }
    case "Ends with":
      return { ...f, comparator: "LIKE", value: `%${f.value}` }
    default:
      return f
  }
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

// --- Maintenance / server administration ---

export interface ServerCapabilities {
  manage_users: boolean
  manage_databases: boolean
  view_activity: boolean
  maintenance_ops: string[]
}

export interface ServerUser {
  name: string
  host: string
  can_login: boolean
  is_superuser: boolean
}

export interface Grant {
  database: string
  schema: string
  privileges: string[]
}

export interface GrantRequest {
  user: string
  host: string
  database: string
  schema: string
  privileges: string[]
  revoke: boolean
}

export interface CreateUserRequest {
  name: string
  host: string
  password: string
  can_login: boolean
  is_superuser: boolean
}

export interface CreateDatabaseRequest {
  name: string
  charset: string
  collation: string
  encoding: string
  owner: string
}

export interface Charset {
  name: string
  default_collation: string
  collations: string[]
}

export interface ServerProcess {
  id: string
  user: string
  host: string
  database: string
  command: string
  time_sec: number
  state: string
  query: string
}

export interface LockInfo {
  lock_type: string
  database: string
  table: string
  index: string
  blocked_by: string
  blocked_query: string
  wait_sec: number
}

export const TABLE_PRIVILEGES = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "CREATE",
  "DROP",
  "ALTER",
  "INDEX",
  "ALL",
] as const

// --- AI Assistant ---

export interface AIConfig {
  has_key: boolean
  model: string
}

export interface AIModel {
  id: string
  name: string
  context_length: number
}

export interface AIStatus {
  has_key: boolean
  enabled: boolean
  mode: string // "db_user" | "app_layer" | ""
  has_context: boolean
}

export interface AIEnableResult {
  mode: string // "db_user" | "app_layer"
  context_generated: boolean
}

export interface AIChatMessage {
  role: string // "user" | "assistant"
  content: string
}

export interface AIChatRequest {
  database: string
  messages: AIChatMessage[]
}

export interface AIChatResponse {
  answer: string
}

// Emitted by the backend during AIChat for each SQL the assistant runs.
export interface AIToolEvent {
  sql: string
  row_count: number
  error?: string
}
