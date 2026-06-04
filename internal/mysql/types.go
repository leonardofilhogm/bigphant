package mysql

import "bigphant/internal/dbtypes"

// Keep these type names for backwards compatibility inside the mysql package
// while exposing shared DTOs via internal/dbtypes for multi-engine support.
type Column = dbtypes.Column
type ResultSet = dbtypes.ResultSet
type RawResult = dbtypes.RawResult
type TableSummary = dbtypes.TableSummary
type ColumnInfo = dbtypes.ColumnInfo
type IndexInfo = dbtypes.IndexInfo
type TableStructure = dbtypes.TableStructure
