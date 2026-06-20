import { useCallback, useEffect, useState } from "react"
import { KeyRound, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { ColumnFormDialog } from "@/components/ColumnFormDialog"
import { IndexFormDialog } from "@/components/IndexFormDialog"
import { SchemaAlterModal } from "@/components/SchemaAlterModal"
import { SubTabs } from "@/components/SubTabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { api } from "@/lib/api"
import { isConfirmationRequired, isPlanRequired, parseAppError } from "@/lib/errors"
import type { AlterOp, AlterTableRequest, ColumnDef, ColumnInfo, TableStructure } from "@/lib/types"

interface StructureViewProps {
  database: string
  table: string
  driver?: string
  canModifySchema?: boolean
  onPlanRequired?: (message: string) => void
  onStructureChange?: (renamedTo?: string) => void
  /** Current sub-tab and switcher, rendered in the bottom bar (table tabs). */
  sub?: string
  subOptions?: readonly string[]
  onSubChange?: (sub: string) => void
}

export function StructureView({
  database,
  table,
  driver = "mysql",
  canModifySchema = false,
  onPlanRequired,
  onStructureChange,
  sub,
  subOptions,
  onSubChange,
}: StructureViewProps) {
  const isPostgres = driver === "postgres"
  const [structure, setStructure] = useState<TableStructure | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [columnDialog, setColumnDialog] = useState<{ mode: "add" | "edit"; column?: ColumnInfo } | null>(
    null
  )
  const [indexDialogOpen, setIndexDialogOpen] = useState(false)
  const [pendingReq, setPendingReq] = useState<AlterTableRequest | null>(null)
  const [previewSql, setPreviewSql] = useState<string[] | null>(null)
  const [previewDestructive, setPreviewDestructive] = useState(false)
  const [applying, setApplying] = useState(false)

  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
    return api
      .describeTable(database, table)
      .then(setStructure)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [database, table])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .describeTable(database, table)
      .then((s) => !cancelled && setStructure(s))
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [database, table])

  function requireSchema(action: () => void) {
    if (!canModifySchema) {
      onPlanRequired?.("Upgrade to Pro to modify table structure")
      return
    }
    action()
  }

  function baseRequest(ops: AlterOp[]): AlterTableRequest {
    return { database, table, ops }
  }

  async function previewRequest(req: AlterTableRequest) {
    try {
      const preview = await api.previewAlterTable(req)
      setPendingReq(req)
      setPreviewSql(preview.sql)
      setPreviewDestructive(preview.destructive)
    } catch (e) {
      if (isPlanRequired(e)) {
        onPlanRequired?.(parseAppError(e).message)
        return
      }
      toast.error("Preview failed", { description: parseAppError(e).message })
    }
  }

  async function applyPending(confirmed: boolean) {
    if (!pendingReq) return
    setApplying(true)
    try {
      await api.alterTable(pendingReq, confirmed)
      const renamed = pendingReq.ops.find((o) => o.kind === "rename_table")?.new_name
      toast.success("Structure updated")
      closePreview()
      onStructureChange?.(renamed)
      if (!renamed) {
        await reload()
      }
    } catch (e) {
      if (isPlanRequired(e)) {
        onPlanRequired?.(parseAppError(e).message)
      } else if (isConfirmationRequired(e)) {
        // previewSql is already populated from the preview call above; the SQL is
        // not recoverable from the stringified Wails error (only code + message
        // cross the boundary), so keep the existing preview and flag it destructive.
        setPreviewDestructive(true)
      } else {
        toast.error("Alter failed", { description: parseAppError(e).message })
      }
    } finally {
      setApplying(false)
    }
  }

  function closePreview() {
    setPendingReq(null)
    setPreviewSql(null)
    setPreviewDestructive(false)
  }

  function handleColumnSubmit(payload: {
    column: ColumnDef
    oldName?: string
    renamed: boolean
    position: string
  }) {
    setColumnDialog(null)
    const ops: AlterOp[] = []
    if (columnDialog?.mode === "add") {
      ops.push({ kind: "add_column", column: payload.column, position: payload.position })
    } else {
      if (payload.renamed && payload.oldName) {
        ops.push({
          kind: "rename_column",
          old_name: payload.oldName,
          new_name: payload.column.name,
          column: payload.column,
        })
      } else {
        ops.push({ kind: "modify_column", column: payload.column })
      }
    }
    void previewRequest(baseRequest(ops))
  }

  function dropColumn(name: string) {
    void previewRequest(baseRequest([{ kind: "drop_column", old_name: name }]))
  }

  function addIndex(index: { name: string; columns: string[]; unique: boolean }) {
    setIndexDialogOpen(false)
    void previewRequest(
      baseRequest([
        {
          kind: index.unique ? "add_unique" : "add_index",
          index: { name: index.name, columns: index.columns, unique: index.unique },
        },
      ])
    )
  }

  function dropIndex(name: string) {
    void previewRequest(baseRequest([{ kind: "drop_index", name }]))
  }

  const columnNames = structure?.columns.map((c) => c.name) ?? []

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-xs">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : error ? (
          <div className="text-destructive flex h-full items-center justify-center px-4 text-center text-xs">
            {error}
          </div>
        ) : !structure ? null : (
          <>
        <div className="p-3">
          <div className="text-muted-foreground mb-1.5 px-1 text-[10px] font-medium tracking-wide uppercase">
            Columns
          </div>
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr className="text-muted-foreground text-left">
                {["", "Name", "Type", "Nullable", "Default", "Key", "Extra", ""].map((h, i) => (
                  <th key={i} className="border-b px-3 py-1.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {structure.columns.map((c) => (
                <tr key={c.name} className="hover:bg-muted/50">
                  <td className="border-b px-3 py-1.5">
                    {c.key === "PRI" && <KeyRound className="size-3 text-amber-500" />}
                  </td>
                  <td className="border-b px-3 py-1.5 font-mono font-medium">{c.name}</td>
                  <td className="border-b px-3 py-1.5 font-mono">{c.type}</td>
                  <td className="border-b px-3 py-1.5">{c.nullable ? "YES" : "NO"}</td>
                  <td className="text-muted-foreground border-b px-3 py-1.5 font-mono">
                    {c.default ?? "—"}
                  </td>
                  <td className="border-b px-3 py-1.5">
                    {c.key && (
                      <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                        {c.key}
                      </Badge>
                    )}
                  </td>
                  <td className="text-muted-foreground border-b px-3 py-1.5 font-mono">{c.extra}</td>
                  <td className="border-b px-3 py-1.5">
                    <div className="flex justify-end gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        onClick={() =>
                          requireSchema(() => setColumnDialog({ mode: "edit", column: c }))
                        }
                      >
                        <Pencil className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        onClick={() => requireSchema(() => dropColumn(c.name))}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="text-muted-foreground mt-5 mb-1.5 px-1 text-[10px] font-medium tracking-wide uppercase">
            Indexes
          </div>
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr className="text-muted-foreground text-left">
                {["Name", "Columns", "Unique", ""].map((h) => (
                  <th key={h} className="border-b px-3 py-1.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {structure.indexes.map((idx) => (
                <tr key={idx.name} className="hover:bg-muted/50">
                  <td className="border-b px-3 py-1.5 font-mono font-medium">{idx.name}</td>
                  <td className="border-b px-3 py-1.5 font-mono">{idx.columns.join(", ")}</td>
                  <td className="border-b px-3 py-1.5">{idx.unique ? "YES" : "NO"}</td>
                  <td className="border-b px-3 py-1.5">
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        onClick={() => requireSchema(() => dropIndex(idx.name))}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          </>
        )}
      </div>

      {onSubChange && subOptions && (
        <div className="bg-muted/20 flex items-center gap-1 border-t px-2 py-1">
          <SubTabs value={sub ?? subOptions[0]} options={subOptions} onChange={onSubChange} />
          {structure && (
            <>
              <Separator orientation="vertical" className="mx-1 h-5" />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => requireSchema(() => setColumnDialog({ mode: "add" }))}
              >
                <Plus className="size-3.5" /> Add column
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => requireSchema(() => setIndexDialogOpen(true))}
              >
                <Plus className="size-3.5" /> Add index
              </Button>
            </>
          )}
        </div>
      )}

      <ColumnFormDialog
        open={columnDialog != null}
        mode={columnDialog?.mode ?? "add"}
        column={columnDialog?.column}
        columnNames={columnNames}
        isPostgres={isPostgres}
        onClose={() => setColumnDialog(null)}
        onSubmit={handleColumnSubmit}
      />

      <IndexFormDialog
        open={indexDialogOpen}
        columnNames={columnNames}
        onClose={() => setIndexDialogOpen(false)}
        onSubmit={addIndex}
      />

      <SchemaAlterModal
        sql={previewSql}
        destructive={previewDestructive}
        applying={applying}
        onConfirm={() => void applyPending(previewDestructive)}
        onClose={closePreview}
      />
    </div>
  )
}
