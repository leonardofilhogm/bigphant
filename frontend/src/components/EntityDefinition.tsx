import { useEffect, useMemo, useState } from "react"
import { Copy, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useTheme } from "next-themes"
import CodeMirror from "@uiw/react-codemirror"
import { MySQL, PostgreSQL, sql } from "@codemirror/lang-sql"

import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import type { Entity } from "@/lib/types"

const KIND_LABELS: Record<string, string> = {
  view: "View",
  materialized_view: "Materialized view",
  function: "Function",
  procedure: "Procedure",
  trigger: "Trigger",
  sequence: "Sequence",
  event: "Event",
  enum: "Enum",
}

interface EntityDefinitionProps {
  database: string
  driver?: string
  entity: Entity
}

export function EntityDefinitionView({ database, driver, entity }: EntityDefinitionProps) {
  const [definition, setDefinition] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const { resolvedTheme } = useTheme()

  const extensions = useMemo(
    () => [
      sql({
        dialect: driver === "postgres" ? PostgreSQL : MySQL,
        upperCaseKeywords: true,
      }),
    ],
    [driver]
  )

  useEffect(() => {
    setLoading(true)
    setError(null)
    setDefinition(null)
    api
      .entityDefinition(database, entity.schema, entity.kind, entity.name)
      .then((text) => setDefinition(text ?? ""))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [database, entity.schema, entity.kind, entity.name])

  async function copyDefinition() {
    if (!definition) return
    try {
      await navigator.clipboard.writeText(definition)
      toast.success("Copied to clipboard")
    } catch {
      toast.error("Failed to copy")
    }
  }

  const label = KIND_LABELS[entity.kind] ?? entity.kind
  const qualified =
    entity.schema && entity.schema !== ""
      ? `${entity.schema}.${entity.name}`
      : entity.name

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{qualified}</div>
          <div className="text-muted-foreground text-xs">{label}</div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          disabled={!definition || loading}
          onClick={copyDefinition}
        >
          <Copy className="size-3.5" /> Copy
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        {loading ? (
          <div className="text-muted-foreground flex h-full items-center gap-2 px-3 text-xs">
            <Loader2 className="size-4 animate-spin" /> Loading definition…
          </div>
        ) : error ? (
          <pre className="text-destructive h-full overflow-auto p-3 font-mono text-xs whitespace-pre-wrap">
            {error}
          </pre>
        ) : (
          <div className="h-full text-xs [&_.cm-editor]:h-full [&_.cm-editor]:bg-transparent [&_.cm-gutters]:bg-transparent [&_.cm-scroller]:overflow-auto">
            <CodeMirror
              value={definition ?? ""}
              height="100%"
              theme={resolvedTheme === "dark" ? "dark" : "light"}
              extensions={extensions}
              readOnly
              editable={false}
              indentWithTab={false}
              basicSetup={{ foldGutter: false }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export function entityTabId(entity: Entity): string {
  const schema = entity.schema ? `${entity.schema}.` : ""
  return `entity:${entity.kind}:${schema}${entity.name}`
}

export function entityKindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind
}
