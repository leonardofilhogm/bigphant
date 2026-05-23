// Frontend types mirroring the Wails contracts in docs/prd.md §8.
// During the scaffold phase these are populated from mock data; once the Go
// backend is wired up they will be replaced by the generated wailsjs models.

export interface ConnectionMeta {
  id: string
  name: string
  driver: string
  host: string
  port: number
  username: string
  default_database: string
  read_only: boolean
  label: string
  label_color: string
  folder: string
}

export type TransactionMode = "auto_commit" | "explicit_commit"

export interface ConnectionInput {
  name: string
  driver: string
  host: string
  port: number
  username: string
  password: string
  default_database: string
  read_only: boolean
  transaction_mode: TransactionMode
  label: string
  label_color: string
  folder: string
}

export interface TableSummary {
  name: string
  row_count: number
  engine: string
  size_bytes: number
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
}

export interface ExecOptions {
  bypass_destructive_check: boolean
  database?: string
}

export interface RawResult {
  is_query: boolean
  result_set?: ResultSet
  affected_rows: number
  duration_ms: number
  status: string // "ok" | "destructive_blocked" | "destructive_confirm"
}
