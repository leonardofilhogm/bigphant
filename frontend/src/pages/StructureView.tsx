import { useEffect, useState } from "react"
import { KeyRound, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { api } from "@/lib/api"
import type { TableStructure } from "@/lib/types"

interface StructureViewProps {
  database: string
  table: string
  onDestructive: (sql: string) => void
}

export function StructureView({ database, table, onDestructive }: StructureViewProps) {
  const [structure, setStructure] = useState<TableStructure | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  if (loading) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-xs">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
    )
  }
  if (error) {
    return (
      <div className="text-destructive flex h-full items-center justify-center px-4 text-center text-xs">
        {error}
      </div>
    )
  }
  if (!structure) return null

  return (
    <div className="h-full overflow-auto">
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => toast.info("ALTER TABLE … ADD COLUMN … (preview, not wired)")}
        >
          <Plus className="size-3.5" /> Add column
        </Button>
      </div>

      <div className="p-3">
        <div className="text-muted-foreground mb-1.5 px-1 text-[10px] font-medium uppercase tracking-wide">
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
                      onClick={() => toast.info(`ALTER TABLE \`${table}\` MODIFY \`${c.name}\` … (not wired)`)}
                    >
                      <Pencil className="size-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={() => onDestructive(`ALTER TABLE \`${table}\` DROP COLUMN \`${c.name}\``)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="text-muted-foreground mt-5 mb-1.5 px-1 text-[10px] font-medium uppercase tracking-wide">
          Indexes
        </div>
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr className="text-muted-foreground text-left">
              {["Name", "Columns", "Unique"].map((h) => (
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
