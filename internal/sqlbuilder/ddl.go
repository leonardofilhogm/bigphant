package sqlbuilder

import (
	"fmt"
	"regexp"
	"strings"
)

// AlterTableRequest is a structured schema change sent from the UI.
type AlterTableRequest struct {
	Database string    `json:"database"`
	Table    string    `json:"table"`
	Ops      []AlterOp `json:"ops"`
}

type AlterOp struct {
	Kind       string         `json:"kind"`
	Column     *ColumnDef     `json:"column,omitempty"`
	OldName    string         `json:"old_name,omitempty"`
	NewName    string         `json:"new_name,omitempty"`
	Position   string         `json:"position,omitempty"` // "FIRST" | "AFTER col"
	Index      *IndexDef      `json:"index,omitempty"`
	ForeignKey *ForeignKeyDef `json:"foreign_key,omitempty"`
	Name       string         `json:"name,omitempty"`
	Columns    []string       `json:"columns,omitempty"`
	Check      string         `json:"check,omitempty"`
}

type ColumnDef struct {
	Name          string `json:"name"`
	Type          string `json:"type"`
	Nullable      bool   `json:"nullable"`
	HasDefault    bool   `json:"has_default"`
	Default       string `json:"default"`
	DefaultIsExpr bool   `json:"default_is_expr"`
	AutoIncrement bool   `json:"auto_increment"`
	Comment       string `json:"comment"`
}

type IndexDef struct {
	Name    string   `json:"name"`
	Columns []string `json:"columns"`
	Unique  bool     `json:"unique"`
}

type ForeignKeyDef struct {
	Name       string   `json:"name"`
	Columns    []string `json:"columns"`
	RefTable   string   `json:"ref_table"`
	RefColumns []string `json:"ref_columns"`
	OnDelete   string   `json:"on_delete"`
	OnUpdate   string   `json:"on_update"`
}

var (
	reColumnType = regexp.MustCompile(`(?i)^[\w\s(),+\-/\.]+$`)
	reRefAction  = regexp.MustCompile(`(?i)^(CASCADE|SET NULL|RESTRICT|NO ACTION)?$`)
)

// BuildAlterTable turns a structured request into DDL for the given dialect.
func BuildAlterTable(d Dialect, req AlterTableRequest) (stmts []string, destructive bool, err error) {
	if req.Table == "" {
		return nil, false, fmt.Errorf("table name is required")
	}
	if len(req.Ops) == 0 {
		return nil, false, fmt.Errorf("at least one operation is required")
	}
	destructive = ClassifyAlter(req)
	switch d.(type) {
	case MySQLDialect:
		return buildAlterMySQL(d, req, destructive)
	case PostgresDialect:
		return buildAlterPostgres(d, req, destructive)
	default:
		return nil, false, fmt.Errorf("unsupported dialect")
	}
}

func buildAlterMySQL(d Dialect, req AlterTableRequest, destructive bool) ([]string, bool, error) {
	qtable := d.Qualified(req.Database, req.Table)
	var alterClauses []string
	var stmts []string

	for _, op := range req.Ops {
		switch op.Kind {
		case "rename_table":
			if op.NewName == "" {
				return nil, destructive, fmt.Errorf("rename_table: new_name is required")
			}
			newQ := d.Qualified(req.Database, op.NewName)
			stmts = append(stmts, fmt.Sprintf("RENAME TABLE %s TO %s", qtable, newQ))
		default:
			clause, err := mysqlAlterClause(d, req, op)
			if err != nil {
				return nil, destructive, err
			}
			alterClauses = append(alterClauses, clause)
		}
	}
	if len(alterClauses) > 0 {
		stmts = append(stmts, "ALTER TABLE "+qtable+" "+strings.Join(alterClauses, ", "))
	}
	return stmts, destructive, nil
}

func mysqlAlterClause(d Dialect, req AlterTableRequest, op AlterOp) (string, error) {
	switch op.Kind {
	case "add_column":
		if op.Column == nil {
			return "", fmt.Errorf("add_column: column is required")
		}
		def, err := mysqlColumnDef(op.Column)
		if err != nil {
			return "", err
		}
		clause := "ADD COLUMN " + def
		if pos := mysqlPosition(d, op.Position); pos != "" {
			clause += " " + pos
		}
		return clause, nil
	case "modify_column":
		if op.Column == nil || op.Column.Name == "" {
			return "", fmt.Errorf("modify_column: column name is required")
		}
		def, err := mysqlColumnDef(op.Column)
		if err != nil {
			return "", err
		}
		clause := "MODIFY COLUMN " + def
		if pos := mysqlPosition(d, op.Position); pos != "" {
			clause += " " + pos
		}
		return clause, nil
	case "rename_column":
		if op.OldName == "" || op.NewName == "" || op.Column == nil {
			return "", fmt.Errorf("rename_column: old_name, new_name, and column type are required")
		}
		col := *op.Column
		col.Name = op.NewName
		def, err := mysqlColumnDef(&col)
		if err != nil {
			return "", err
		}
		return "CHANGE " + d.QuoteIdent(op.OldName) + " " + def, nil
	case "drop_column":
		if op.OldName == "" {
			return "", fmt.Errorf("drop_column: old_name is required")
		}
		return "DROP COLUMN " + d.QuoteIdent(op.OldName), nil
	case "add_index", "add_unique":
		idx := op.Index
		if idx == nil || len(idx.Columns) == 0 {
			return "", fmt.Errorf("%s: index columns are required", op.Kind)
		}
		cols := quoteIdents(d, idx.Columns)
		unique := op.Kind == "add_unique" || idx.Unique
		name := idx.Name
		if name == "" {
			name = "idx_" + strings.Join(idx.Columns, "_")
		}
		prefix := "ADD INDEX"
		if unique {
			prefix = "ADD UNIQUE INDEX"
		}
		return fmt.Sprintf("%s %s (%s)", prefix, d.QuoteIdent(name), strings.Join(cols, ", ")), nil
	case "drop_index":
		if op.Name == "" {
			return "", fmt.Errorf("drop_index: name is required")
		}
		return "DROP INDEX " + d.QuoteIdent(op.Name), nil
	case "add_primary_key":
		if len(op.Columns) == 0 {
			return "", fmt.Errorf("add_primary_key: columns are required")
		}
		return "ADD PRIMARY KEY (" + strings.Join(quoteIdents(d, op.Columns), ", ") + ")", nil
	case "drop_primary_key":
		return "DROP PRIMARY KEY", nil
	case "add_foreign_key":
		fk := op.ForeignKey
		if fk == nil || len(fk.Columns) == 0 || fk.RefTable == "" || len(fk.RefColumns) == 0 {
			return "", fmt.Errorf("add_foreign_key: columns, ref_table, and ref_columns are required")
		}
		name := fk.Name
		if name == "" {
			name = "fk_" + strings.Join(fk.Columns, "_")
		}
		refQ := d.Qualified(req.Database, fk.RefTable)
		clause := fmt.Sprintf("ADD CONSTRAINT %s FOREIGN KEY (%s) REFERENCES %s (%s)",
			d.QuoteIdent(name),
			strings.Join(quoteIdents(d, fk.Columns), ", "),
			refQ,
			strings.Join(quoteIdents(d, fk.RefColumns), ", "),
		)
		if a := normalizeRefAction(fk.OnDelete); a != "" {
			clause += " ON DELETE " + a
		}
		if a := normalizeRefAction(fk.OnUpdate); a != "" {
			clause += " ON UPDATE " + a
		}
		return clause, nil
	case "drop_foreign_key":
		if op.Name == "" {
			return "", fmt.Errorf("drop_foreign_key: name is required")
		}
		return "DROP FOREIGN KEY " + d.QuoteIdent(op.Name), nil
	case "set_default":
		if op.OldName == "" || op.Column == nil || !op.Column.HasDefault {
			return "", fmt.Errorf("set_default: column name and default are required")
		}
		def, err := formatDefault(op.Column.Default, op.Column.DefaultIsExpr)
		if err != nil {
			return "", err
		}
		return "ALTER COLUMN " + d.QuoteIdent(op.OldName) + " SET DEFAULT " + def, nil
	case "drop_default":
		if op.OldName == "" {
			return "", fmt.Errorf("drop_default: old_name is required")
		}
		return "ALTER COLUMN " + d.QuoteIdent(op.OldName) + " DROP DEFAULT", nil
	case "add_check":
		if op.Name == "" || op.Check == "" {
			return "", fmt.Errorf("add_check: name and check expression are required")
		}
		if err := validateTypeToken(op.Check); err != nil {
			return "", err
		}
		return fmt.Sprintf("ADD CONSTRAINT %s CHECK (%s)", d.QuoteIdent(op.Name), op.Check), nil
	case "drop_constraint":
		if op.Name == "" {
			return "", fmt.Errorf("drop_constraint: name is required")
		}
		return "DROP CHECK " + d.QuoteIdent(op.Name), nil
	default:
		return "", fmt.Errorf("unsupported operation kind: %s", op.Kind)
	}
}

func buildAlterPostgres(d Dialect, req AlterTableRequest, destructive bool) ([]string, bool, error) {
	qtable := d.Qualified(req.Database, req.Table)
	var stmts []string
	var clauses []string

	flush := func() {
		if len(clauses) > 0 {
			stmts = append(stmts, "ALTER TABLE "+qtable+" "+strings.Join(clauses, ", "))
			clauses = nil
		}
	}

	for _, op := range req.Ops {
		switch op.Kind {
		case "rename_table":
			flush()
			if op.NewName == "" {
				return nil, destructive, fmt.Errorf("rename_table: new_name is required")
			}
			stmts = append(stmts, "ALTER TABLE "+qtable+" RENAME TO "+d.QuoteIdent(op.NewName))
		case "add_column":
			if op.Column == nil {
				return nil, destructive, fmt.Errorf("add_column: column is required")
			}
			def, err := postgresColumnDef(d, op.Column, true)
			if err != nil {
				return nil, destructive, err
			}
			clauses = append(clauses, "ADD COLUMN "+def)
		case "modify_column":
			if op.Column == nil || op.Column.Name == "" {
				return nil, destructive, fmt.Errorf("modify_column: column name is required")
			}
			if err := validateTypeToken(op.Column.Type); err != nil {
				return nil, destructive, err
			}
			clauses = append(clauses, "ALTER COLUMN "+d.QuoteIdent(op.Column.Name)+" TYPE "+op.Column.Type)
			if op.Column.Nullable {
				clauses = append(clauses, "ALTER COLUMN "+d.QuoteIdent(op.Column.Name)+" DROP NOT NULL")
			} else {
				clauses = append(clauses, "ALTER COLUMN "+d.QuoteIdent(op.Column.Name)+" SET NOT NULL")
			}
			if op.Column.HasDefault {
				def, err := formatDefault(op.Column.Default, op.Column.DefaultIsExpr)
				if err != nil {
					return nil, destructive, err
				}
				clauses = append(clauses, "ALTER COLUMN "+d.QuoteIdent(op.Column.Name)+" SET DEFAULT "+def)
			}
		case "rename_column":
			if op.OldName == "" || op.NewName == "" {
				return nil, destructive, fmt.Errorf("rename_column: old_name and new_name are required")
			}
			clauses = append(clauses, "RENAME COLUMN "+d.QuoteIdent(op.OldName)+" TO "+d.QuoteIdent(op.NewName))
		case "drop_column":
			if op.OldName == "" {
				return nil, destructive, fmt.Errorf("drop_column: old_name is required")
			}
			clauses = append(clauses, "DROP COLUMN "+d.QuoteIdent(op.OldName))
		case "add_index", "add_unique":
			flush()
			idx := op.Index
			if idx == nil || len(idx.Columns) == 0 {
				return nil, destructive, fmt.Errorf("%s: index columns are required", op.Kind)
			}
			unique := op.Kind == "add_unique" || idx.Unique
			name := idx.Name
			if name == "" {
				name = "idx_" + strings.Join(idx.Columns, "_")
			}
			prefix := "CREATE INDEX"
			if unique {
				prefix = "CREATE UNIQUE INDEX"
			}
			stmts = append(stmts, fmt.Sprintf("%s %s ON %s (%s)",
				prefix, d.QuoteIdent(name), qtable, strings.Join(quoteIdents(d, idx.Columns), ", ")))
		case "drop_index":
			flush()
			if op.Name == "" {
				return nil, destructive, fmt.Errorf("drop_index: name is required")
			}
			stmts = append(stmts, "DROP INDEX "+d.QuoteIdent(op.Name))
		case "add_primary_key":
			clauses = append(clauses, "ADD PRIMARY KEY ("+strings.Join(quoteIdents(d, op.Columns), ", ")+")")
		case "drop_primary_key":
			name := op.Name
			if name == "" {
				name = req.Table + "_pkey"
			}
			clauses = append(clauses, "DROP CONSTRAINT "+d.QuoteIdent(name))
		case "add_foreign_key":
			fk := op.ForeignKey
			if fk == nil || len(fk.Columns) == 0 || fk.RefTable == "" || len(fk.RefColumns) == 0 {
				return nil, destructive, fmt.Errorf("add_foreign_key: columns, ref_table, and ref_columns are required")
			}
			name := fk.Name
			if name == "" {
				name = "fk_" + strings.Join(fk.Columns, "_")
			}
			refQ := d.Qualified(req.Database, fk.RefTable)
			clause := fmt.Sprintf("ADD CONSTRAINT %s FOREIGN KEY (%s) REFERENCES %s (%s)",
				d.QuoteIdent(name),
				strings.Join(quoteIdents(d, fk.Columns), ", "),
				refQ,
				strings.Join(quoteIdents(d, fk.RefColumns), ", "),
			)
			if a := normalizeRefAction(fk.OnDelete); a != "" {
				clause += " ON DELETE " + a
			}
			if a := normalizeRefAction(fk.OnUpdate); a != "" {
				clause += " ON UPDATE " + a
			}
			clauses = append(clauses, clause)
		case "drop_foreign_key", "drop_constraint":
			if op.Name == "" {
				return nil, destructive, fmt.Errorf("%s: name is required", op.Kind)
			}
			clauses = append(clauses, "DROP CONSTRAINT "+d.QuoteIdent(op.Name))
		case "set_default":
			if op.OldName == "" || op.Column == nil || !op.Column.HasDefault {
				return nil, destructive, fmt.Errorf("set_default: column name and default are required")
			}
			def, err := formatDefault(op.Column.Default, op.Column.DefaultIsExpr)
			if err != nil {
				return nil, destructive, err
			}
			clauses = append(clauses, "ALTER COLUMN "+d.QuoteIdent(op.OldName)+" SET DEFAULT "+def)
		case "drop_default":
			if op.OldName == "" {
				return nil, destructive, fmt.Errorf("drop_default: old_name is required")
			}
			clauses = append(clauses, "ALTER COLUMN "+d.QuoteIdent(op.OldName)+" DROP DEFAULT")
		case "add_check":
			if op.Name == "" || op.Check == "" {
				return nil, destructive, fmt.Errorf("add_check: name and check expression are required")
			}
			if err := validateTypeToken(op.Check); err != nil {
				return nil, destructive, err
			}
			clauses = append(clauses, fmt.Sprintf("ADD CONSTRAINT %s CHECK (%s)", d.QuoteIdent(op.Name), op.Check))
		default:
			return nil, destructive, fmt.Errorf("unsupported operation kind: %s", op.Kind)
		}
	}
	flush()
	return stmts, destructive, nil
}

func mysqlColumnDef(col *ColumnDef) (string, error) {
	if col.Name == "" {
		return "", fmt.Errorf("column name is required")
	}
	if err := validateTypeToken(col.Type); err != nil {
		return "", err
	}
	d := MySQLDialect{}
	parts := []string{d.QuoteIdent(col.Name), col.Type}
	if !col.Nullable {
		parts = append(parts, "NOT NULL")
	}
	if col.HasDefault {
		def, err := formatDefault(col.Default, col.DefaultIsExpr)
		if err != nil {
			return "", err
		}
		parts = append(parts, "DEFAULT", def)
	}
	if col.AutoIncrement {
		parts = append(parts, "AUTO_INCREMENT")
	}
	if col.Comment != "" {
		parts = append(parts, "COMMENT", quoteStringLiteral(col.Comment))
	}
	return strings.Join(parts, " "), nil
}

func postgresColumnDef(d Dialect, col *ColumnDef, includeName bool) (string, error) {
	if col.Name == "" {
		return "", fmt.Errorf("column name is required")
	}
	if err := validateTypeToken(col.Type); err != nil {
		return "", err
	}
	parts := []string{}
	if includeName {
		parts = append(parts, d.QuoteIdent(col.Name))
	}
	parts = append(parts, col.Type)
	if !col.Nullable {
		parts = append(parts, "NOT NULL")
	}
	if col.HasDefault {
		def, err := formatDefault(col.Default, col.DefaultIsExpr)
		if err != nil {
			return "", err
		}
		parts = append(parts, "DEFAULT", def)
	}
	return strings.Join(parts, " "), nil
}

func mysqlPosition(d Dialect, position string) string {
	position = strings.TrimSpace(position)
	if position == "" {
		return ""
	}
	upper := strings.ToUpper(position)
	if upper == "FIRST" {
		return "FIRST"
	}
	if strings.HasPrefix(upper, "AFTER ") {
		col := strings.TrimSpace(position[5:])
		if col != "" {
			return "AFTER " + d.QuoteIdent(col)
		}
	}
	return ""
}

func quoteIdents(d Dialect, names []string) []string {
	out := make([]string, len(names))
	for i, n := range names {
		out[i] = d.QuoteIdent(n)
	}
	return out
}

func validateTypeToken(tok string) error {
	tok = strings.TrimSpace(tok)
	if tok == "" {
		return fmt.Errorf("type expression is required")
	}
	if strings.Contains(tok, ";") || strings.Contains(tok, "--") {
		return fmt.Errorf("invalid type expression")
	}
	if !reColumnType.MatchString(tok) {
		return fmt.Errorf("invalid type expression: %q", tok)
	}
	return nil
}

func normalizeRefAction(action string) string {
	action = strings.TrimSpace(strings.ToUpper(action))
	if action == "" {
		return ""
	}
	if !reRefAction.MatchString(action) {
		return ""
	}
	if action == "NO ACTION" {
		return "NO ACTION"
	}
	return action
}

func formatDefault(value string, isExpr bool) (string, error) {
	if isExpr {
		if err := validateTypeToken(value); err != nil {
			return "", err
		}
		return value, nil
	}
	upper := strings.ToUpper(strings.TrimSpace(value))
	if upper == "NULL" {
		return "NULL", nil
	}
	return quoteStringLiteral(value), nil
}

func quoteStringLiteral(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}
