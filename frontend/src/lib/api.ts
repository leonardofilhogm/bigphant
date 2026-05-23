// Thin wrapper over the generated Wails bindings so components import from one
// place and stay decoupled from the wailsjs path. Types are structurally
// compatible with the hand-written ones in ./types.
import {
  CreateConnection,
  DeleteConnection,
  DeleteRows,
  DescribeTable,
  ExecuteRaw,
  FetchRows,
  GetSettings,
  InsertRow,
  ListConnections,
  ListDatabases,
  ListTables,
  OpenConnection,
  ServerVersion,
  TestConnection,
  UpdateConnection,
  UpdateRow,
  UpdateSettings,
} from "../../wailsjs/go/main/App"
import { sqlbuilder } from "../../wailsjs/go/models"
import type {
  AppSettings,
  ConnectionInput,
  ConnectionMeta,
  ExecOptions,
  FetchRowsRequest,
  RawResult,
  ResultSet,
  TableStructure,
  TableSummary,
} from "@/lib/types"

interface TestResult {
  ok: boolean
  message: string
}

export const api = {
  listConnections: (): Promise<ConnectionMeta[]> => ListConnections(),
  createConnection: (input: ConnectionInput): Promise<ConnectionMeta> =>
    CreateConnection(input),
  updateConnection: (id: string, input: ConnectionInput): Promise<ConnectionMeta> =>
    UpdateConnection(id, input),
  deleteConnection: (id: string): Promise<void> => DeleteConnection(id),
  testConnection: (input: ConnectionInput): Promise<TestResult> => TestConnection(input),
  openConnection: (id: string): Promise<void> => OpenConnection(id),
  listDatabases: (): Promise<string[]> => ListDatabases(),
  listTables: (database: string): Promise<TableSummary[]> => ListTables(database),
  describeTable: (database: string, table: string): Promise<TableStructure> =>
    DescribeTable(database, table),
  fetchRows: (req: FetchRowsRequest): Promise<ResultSet> =>
    FetchRows(sqlbuilder.FetchRowsRequest.createFrom(req)),

  insertRow: (database: string, table: string, values: Record<string, unknown>): Promise<number> =>
    InsertRow(database, table, values),
  updateRow: (
    database: string,
    table: string,
    pk: Record<string, unknown>,
    values: Record<string, unknown>
  ): Promise<void> => UpdateRow(database, table, pk, values),
  deleteRows: (
    database: string,
    table: string,
    pks: Record<string, unknown>[]
  ): Promise<number> => DeleteRows(database, table, pks),
  executeRaw: (query: string, options: ExecOptions): Promise<RawResult> =>
    ExecuteRaw(query, options),

  serverVersion: (): Promise<string> => ServerVersion(),
  getSettings: (): Promise<AppSettings> => GetSettings(),
  updateSettings: (s: AppSettings): Promise<void> => UpdateSettings(s),
}
