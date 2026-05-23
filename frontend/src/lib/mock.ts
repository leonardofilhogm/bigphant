// Mock data for the validation scaffold. This stands in for the Go backend so
// the UI can be navigated and reviewed before any MySQL wiring exists.

import type {
  ConnectionMeta,
  ResultSet,
  TableStructure,
  TableSummary,
} from "@/lib/types"

export const mockConnections: ConnectionMeta[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Local dev",
    host: "127.0.0.1",
    port: 3306,
    username: "root",
    default_database: "employees",
    read_only: false,
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Staging (read-only)",
    host: "staging.db.internal",
    port: 3306,
    username: "reader",
    default_database: "shop",
    read_only: true,
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    name: "Analytics replica",
    host: "10.0.4.21",
    port: 3307,
    username: "analyst",
    default_database: "metrics",
    read_only: true,
  },
]

export const mockDatabases: string[] = [
  "employees",
  "information_schema",
  "mysql",
  "performance_schema",
  "shop",
  "sys",
]

export const mockTables: Record<string, TableSummary[]> = {
  employees: [
    { name: "departments", row_count: 9, engine: "InnoDB", size_bytes: 16384 },
    { name: "dept_emp", row_count: 331603, engine: "InnoDB", size_bytes: 13123584 },
    { name: "dept_manager", row_count: 24, engine: "InnoDB", size_bytes: 32768 },
    { name: "employees", row_count: 300024, engine: "InnoDB", size_bytes: 15220736 },
    { name: "salaries", row_count: 2844047, engine: "InnoDB", size_bytes: 100925440 },
    { name: "titles", row_count: 443308, engine: "InnoDB", size_bytes: 20512768 },
  ],
  shop: [
    { name: "customers", row_count: 1280, engine: "InnoDB", size_bytes: 196608 },
    { name: "orders", row_count: 8452, engine: "InnoDB", size_bytes: 1310720 },
    { name: "order_items", row_count: 23901, engine: "InnoDB", size_bytes: 3145728 },
    { name: "products", row_count: 642, engine: "InnoDB", size_bytes: 131072 },
  ],
  metrics: [
    { name: "events", row_count: 9120334, engine: "InnoDB", size_bytes: 882900992 },
    { name: "sessions", row_count: 412903, engine: "InnoDB", size_bytes: 41943040 },
  ],
}

export const mockStructures: Record<string, TableStructure> = {
  employees: {
    primary_key: ["emp_no"],
    columns: [
      { name: "emp_no", type: "int", nullable: false, default: null, key: "PRI", extra: "" },
      { name: "birth_date", type: "date", nullable: false, default: null, key: "", extra: "" },
      { name: "first_name", type: "varchar(14)", nullable: false, default: null, key: "", extra: "" },
      { name: "last_name", type: "varchar(16)", nullable: false, default: null, key: "", extra: "" },
      { name: "gender", type: "enum('M','F')", nullable: false, default: null, key: "", extra: "" },
      { name: "hire_date", type: "date", nullable: false, default: null, key: "", extra: "" },
      { name: "metadata", type: "json", nullable: true, default: null, key: "", extra: "" },
    ],
    indexes: [
      { name: "PRIMARY", columns: ["emp_no"], unique: true },
      { name: "idx_last_name", columns: ["last_name"], unique: false },
    ],
  },
}

const firstNames = ["Georgi", "Bezalel", "Parto", "Chirstian", "Kyoichi", "Anneke", "Tzvetan", "Saniya", "Sumant", "Duangkaew", "Mary", "Patricio"]
const lastNames = ["Facello", "Simmel", "Bamford", "Koblick", "Maliniak", "Preusig", "Zielinski", "Kalloufi", "Peac", "Piveteau", "Sluis", "Bridgland"]

function rowFor(i: number): unknown[] {
  const empNo = 10001 + i
  const fn = firstNames[i % firstNames.length]
  const ln = lastNames[i % lastNames.length]
  const gender = i % 2 === 0 ? "M" : "F"
  const birthYear = 1953 + (i % 12)
  const hireYear = 1985 + (i % 15)
  const meta = i % 5 === 0 ? null : { team: `team-${(i % 7) + 1}`, level: (i % 4) + 1 }
  return [
    empNo,
    `${birthYear}-0${(i % 9) + 1}-1${i % 9}`,
    fn,
    ln,
    gender,
    `${hireYear}-0${(i % 9) + 1}-2${i % 9}`,
    meta,
  ]
}

export function mockEmployeesResultSet(limit = 300, offset = 0): ResultSet {
  const rows = Array.from({ length: limit }, (_, i) => rowFor(offset + i))
  return {
    columns: [
      { name: "emp_no", type: "int" },
      { name: "birth_date", type: "date" },
      { name: "first_name", type: "varchar(14)" },
      { name: "last_name", type: "varchar(16)" },
      { name: "gender", type: "enum" },
      { name: "hire_date", type: "date" },
      { name: "metadata", type: "json" },
    ],
    rows,
    row_count: rows.length,
    sql: `SELECT * FROM \`employees\` LIMIT ${limit} OFFSET ${offset}`,
  }
}

// Generic stand-in for tables we don't have detailed mock data for, so the grid
// renders something plausible during the scaffold phase.
function genericResultSet(table: string, limit: number, offset: number): ResultSet {
  const count = Math.min(limit, 42)
  const rows = Array.from({ length: count }, (_, i) => {
    const id = offset + i + 1
    return [
      id,
      `${table.replace(/s$/, "")}_${id}`,
      (id * 13.5).toFixed(2),
      i % 4 === 0,
      `2026-0${(i % 9) + 1}-1${i % 9}T0${i % 9}:30:00Z`,
    ]
  })
  return {
    columns: [
      { name: "id", type: "bigint" },
      { name: "name", type: "varchar(255)" },
      { name: "amount", type: "decimal(10,2)" },
      { name: "active", type: "tinyint(1)" },
      { name: "created_at", type: "datetime" },
    ],
    rows,
    row_count: rows.length,
    sql: `SELECT * FROM \`${table}\` LIMIT ${limit} OFFSET ${offset}`,
  }
}

export function mockResultSetFor(table: string, limit = 300, offset = 0): ResultSet {
  if (table === "employees") return mockEmployeesResultSet(limit, offset)
  return genericResultSet(table, limit, offset)
}
