import { useState } from "react"
import { History, Loader2, Play, Plus, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DataGrid } from "@/components/DataGrid"
import { cn } from "@/lib/utils"
import { api } from "@/lib/api"
import type { ResultSet } from "@/lib/types"

interface EditorTab {
  id: number
  name: string
  sql: string
  result: ResultSet | null
  affected: number | null
  duration: number | null
  loading: boolean
}

interface SqlEditorProps {
  database: string
  onMutate: () => void
  onDestructive: (sql: string) => void
}

let tabSeq = 2

export function SqlEditor({ database, onMutate, onDestructive }: SqlEditorProps) {
  const [tabs, setTabs] = useState<EditorTab[]>([
    {
      id: 1,
      name: "Query 1",
      sql: "SELECT * FROM employees\nWHERE gender = 'F'\nLIMIT 50;",
      result: null,
      affected: null,
      duration: null,
      loading: false,
    },
  ])
  const [activeId, setActiveId] = useState(1)
  const [history, setHistory] = useState<string[]>([])

  const active = tabs.find((t) => t.id === activeId)!

  function patch(patch: Partial<EditorTab>) {
    setTabs((prev) => prev.map((t) => (t.id === activeId ? { ...t, ...patch } : t)))
  }

  function run() {
    const sql = active.sql.trim()
    if (!sql) return
    setHistory((h) => [sql, ...h].slice(0, 50))
    patch({ loading: true, result: null, affected: null, duration: null })

    api
      .executeRaw(sql, { bypass_destructive_check: false, database })
      .then((raw) => {
        if (raw.status === "destructive_blocked") {
          toast.error("Blocked: destructive statement without WHERE clause")
          patch({ loading: false })
        } else if (raw.status === "destructive_confirm") {
          patch({ loading: false })
          onDestructive(sql)
        } else if (raw.is_query && raw.result_set) {
          patch({ result: raw.result_set, affected: null, duration: raw.duration_ms, loading: false })
        } else {
          patch({ result: null, affected: raw.affected_rows, duration: raw.duration_ms, loading: false })
          onMutate()
          toast.success(`${raw.affected_rows} row(s) affected`)
        }
      })
      .catch((e) => {
        toast.error("Query failed", { description: String(e) })
        patch({ loading: false })
      })
  }

  function addTab() {
    const id = tabSeq++
    setTabs((prev) => [
      ...prev,
      { id, name: `Query ${id}`, sql: "", result: null, affected: null, duration: null, loading: false },
    ])
    setActiveId(id)
  }

  function closeTab(id: number) {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id)
      if (next.length === 0) return prev
      if (id === activeId) setActiveId(next[next.length - 1].id)
      return next
    })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b px-1.5 pt-1">
        {tabs.map((t) => (
          <div
            key={t.id}
            onClick={() => setActiveId(t.id)}
            className={cn(
              "group flex cursor-pointer items-center gap-1.5 rounded-t border border-b-0 px-2.5 py-1 text-xs",
              t.id === activeId ? "bg-background" : "bg-muted/40 text-muted-foreground"
            )}
          >
            {t.name}
            <button
              onClick={(e) => {
                e.stopPropagation()
                closeTab(t.id)
              }}
              className="opacity-0 group-hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        <Button variant="ghost" size="icon" className="size-6" onClick={addTab}>
          <Plus className="size-3.5" />
        </Button>
      </div>

      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <Button size="sm" className="h-7 gap-1 text-xs" onClick={run}>
          <Play className="size-3.5" /> Run
          <span className="ml-1 opacity-60">⌘↵</span>
        </Button>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
              <History className="size-3.5" /> History
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-w-sm">
            <DropdownMenuLabel className="text-xs">Session history</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {history.length === 0 && (
              <div className="text-muted-foreground px-2 py-1.5 text-xs">No queries yet.</div>
            )}
            {history.map((h, i) => (
              <DropdownMenuItem
                key={i}
                className="font-mono text-[11px]"
                onClick={() => patch({ sql: h })}
              >
                <span className="truncate">{h.replace(/\s+/g, " ")}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <textarea
        value={active.sql}
        onChange={(e) => patch({ sql: e.target.value })}
        onKeyDown={(e) => {
          if (e.metaKey && e.key === "Enter") {
            e.preventDefault()
            run()
          }
        }}
        spellCheck={false}
        placeholder="Write SQL, then press ⌘↵ to run"
        className="placeholder:text-muted-foreground h-40 resize-none border-b bg-transparent p-3 font-mono text-xs outline-none"
      />

      <div className="min-h-0 flex-1 flex flex-col">
        {active.loading ? (
          <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-xs">
            <Loader2 className="size-4 animate-spin" /> Running…
          </div>
        ) : active.result ? (
          <>
            <div className="min-h-0 flex-1">
              <DataGrid
                columns={active.result.columns}
                visible={new Set(active.result.columns.map((c) => c.name))}
                rows={active.result.rows}
                selected={new Set()}
                activeRow={null}
                onToggleRow={() => {}}
                onToggleAll={() => {}}
                onRowClick={() => {}}
                onCellCommit={() => {}}
              />
            </div>
            <div className="text-muted-foreground border-t px-3 py-1 text-[11px]">
              {active.result.row_count} row{active.result.row_count !== 1 ? "s" : ""}
              {active.duration !== null && ` · ${active.duration}ms`}
            </div>
          </>
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
            {active.affected !== null
              ? `${active.affected} row(s) affected${active.duration !== null ? ` · ${active.duration}ms` : ""}`
              : "Results appear here."}
          </div>
        )}
      </div>
    </div>
  )
}
