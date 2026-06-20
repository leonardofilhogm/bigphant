// Thin wrapper over the generated Wails bindings so components import from one
// place and stay decoupled from the wailsjs path. Types are structurally
// compatible with the hand-written ones in ./types.
import {
  CommitTransaction,
  CreateConnection,
  DeleteConnection,
  DeleteRows,
  DescribeTable,
  ExecuteRaw,
  EntityDefinition,
  FetchRows,
  GetSettings,
  InsertRow,
  ListConnections,
  ListDatabases,
  ListEntities,
  ListSchemas,
  ListTables,
  OpenConnection,
  PickSQLiteFile,
  RollbackTransaction,
  SetConnectionEditMode,
  SchemaColumns,
  SetActiveDatabase,
  ServerFlavor,
  ServerVersion,
  TestConnection,
  UpdateConnection,
  UpdateRow,
  UpdateSettings,
  ActivateLicense,
  AlterTable,
  ConfirmQuitClose,
  DeactivateLicenseDevice,
  DeactivateThisDevice,
  RemoveLicense,
  ExportRows,
  ForceValidateLicense,
  GetCheckoutURL,
  GetLicense,
  LicenseActivated,
  ListLicenseDevices,
  PreviewAlterTable,
  RequestFreeLicense,
  GetAIConfig,
  SetAIConfig,
  ListAIModels,
  GenerateDBContext,
  GetDBContext,
  SaveDBContext,
  EnableAIAssistant,
  AIAssistantStatus,
  AIChat,
  ServerCapabilities,
  ListUsers,
  CreateUser,
  DropUser,
  ListGrants,
  ApplyGrants,
  CreateDatabase,
  ListCharsets,
  ListActivity,
  KillProcess,
  ListLocks,
  RunMaintenance,
} from "../../wailsjs/go/main/App"
import { main, dbtypes } from "../../wailsjs/go/models"
import { sqlbuilder } from "../../wailsjs/go/models"
import type {
  AlterPreview,
  AlterTableRequest,
  AppSettings,
  ConnectionInput,
  ConnectionMeta,
  Entity,
  ExecOptions,
  FetchRowsRequest,
  RawResult,
  ResultSet,
  TableStructure,
  TableSummary,
  AIConfig,
  AIModel,
  AIStatus,
  AIEnableResult,
  AIChatRequest,
  AIChatResponse,
  ServerCapabilities as ServerCapabilitiesType,
  ServerUser,
  Grant,
  GrantRequest,
  CreateUserRequest,
  CreateDatabaseRequest,
  Charset,
  ServerProcess,
  LockInfo,
} from "@/lib/types"
import type { LicenseDevice, LicenseInfo } from "@/lib/license-types"

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
  setConnectionEditMode: (id: string, mode: string): Promise<ConnectionMeta> =>
    SetConnectionEditMode(id, mode),
  testConnection: (input: ConnectionInput): Promise<TestResult> => TestConnection(input),
  openConnection: (id: string): Promise<void> => OpenConnection(id),
  pickSQLiteFile: (): Promise<string> => PickSQLiteFile(),
  listDatabases: (): Promise<string[]> => ListDatabases(),
  listSchemas: (database: string): Promise<string[]> => ListSchemas(database),
  setActiveDatabase: (database: string): Promise<void> => SetActiveDatabase(database),
  listTables: (database: string): Promise<TableSummary[]> => ListTables(database),
  listEntities: (database: string): Promise<Entity[]> => ListEntities(database),
  entityDefinition: (
    database: string,
    schema: string,
    kind: string,
    name: string
  ): Promise<string> => EntityDefinition(database, schema, kind, name),
  describeTable: (database: string, table: string): Promise<TableStructure> =>
    DescribeTable(database, table),
  schemaColumns: (database: string): Promise<Record<string, string[]>> =>
    SchemaColumns(database),
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

  commitTransaction: (): Promise<void> => CommitTransaction(),
  rollbackTransaction: (): Promise<void> => RollbackTransaction(),
  serverVersion: (): Promise<string> => ServerVersion(),
  serverFlavor: (): Promise<string> => ServerFlavor(),
  getSettings: (): Promise<AppSettings> => GetSettings(),
  updateSettings: (s: AppSettings): Promise<void> => UpdateSettings(s),

  getLicense: (): Promise<LicenseInfo> => GetLicense() as Promise<LicenseInfo>,
  licenseActivated: (): Promise<boolean> => LicenseActivated(),
  activateLicense: (key: string): Promise<LicenseInfo> =>
    ActivateLicense(key) as Promise<LicenseInfo>,
  requestFreeLicense: (email: string): Promise<void> => RequestFreeLicense(email),
  deactivateThisDevice: (): Promise<void> => DeactivateThisDevice(),
  removeLicense: (): Promise<void> => RemoveLicense(),
  deactivateLicenseDevice: (deviceId: string): Promise<void> =>
    DeactivateLicenseDevice(deviceId),
  listLicenseDevices: (): Promise<LicenseDevice[]> =>
    ListLicenseDevices() as Promise<LicenseDevice[]>,
  forceValidateLicense: (): Promise<LicenseInfo> =>
    ForceValidateLicense() as Promise<LicenseInfo>,
  getCheckoutURL: (): Promise<string> => GetCheckoutURL(),
  confirmQuitClose: (): Promise<void> => ConfirmQuitClose(),
  exportRows: (database: string, table: string, format: string): Promise<void> =>
    ExportRows(database, table, format),
  previewAlterTable: (req: AlterTableRequest): Promise<AlterPreview> =>
    PreviewAlterTable(sqlbuilder.AlterTableRequest.createFrom(req)),
  alterTable: (req: AlterTableRequest, confirmed: boolean): Promise<RawResult> =>
    AlterTable(sqlbuilder.AlterTableRequest.createFrom(req), confirmed),

  // --- AI Assistant ---
  getAIConfig: (): Promise<AIConfig> => GetAIConfig(),
  setAIConfig: (apiKey: string, model: string): Promise<void> =>
    SetAIConfig(apiKey, model),
  listAIModels: (): Promise<AIModel[]> => ListAIModels(),
  generateDBContext: (database: string): Promise<string> => GenerateDBContext(database),
  getDBContext: (database: string): Promise<string> => GetDBContext(database),
  saveDBContext: (database: string, markdown: string): Promise<void> =>
    SaveDBContext(database, markdown),
  enableAIAssistant: (database: string): Promise<AIEnableResult> =>
    EnableAIAssistant(database),
  aiAssistantStatus: (database: string): Promise<AIStatus> => AIAssistantStatus(database),
  aiChat: (req: AIChatRequest): Promise<AIChatResponse> =>
    AIChat(main.AIChatRequest.createFrom(req)),

  // --- Maintenance ---
  serverCapabilities: (): Promise<ServerCapabilitiesType> => ServerCapabilities(),
  listUsers: (): Promise<ServerUser[]> => ListUsers(),
  createUser: (req: CreateUserRequest): Promise<void> =>
    CreateUser(dbtypes.CreateUserRequest.createFrom(req)),
  dropUser: (name: string, host: string): Promise<void> => DropUser(name, host),
  listGrants: (name: string, host: string): Promise<Grant[]> => ListGrants(name, host),
  applyGrants: (req: GrantRequest): Promise<void> =>
    ApplyGrants(dbtypes.GrantRequest.createFrom(req)),
  createDatabase: (req: CreateDatabaseRequest): Promise<void> =>
    CreateDatabase(dbtypes.CreateDatabaseRequest.createFrom(req)),
  listCharsets: (): Promise<Charset[]> => ListCharsets(),
  listActivity: (): Promise<ServerProcess[]> => ListActivity(),
  killProcess: (id: string): Promise<void> => KillProcess(id),
  listLocks: (): Promise<LockInfo[]> => ListLocks(),
  runMaintenance: (op: string, target: string): Promise<RawResult> => RunMaintenance(op, target),
}
