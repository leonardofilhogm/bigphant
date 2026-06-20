import { useEffect, useRef, useState } from "react"
import { Loader2, Send, Sparkles, FileText, ShieldCheck, SquarePen } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { AIConsentDialog } from "@/components/AIConsentDialog"
import { DBContextEditor } from "@/components/DBContextEditor"
import { EventsOn } from "../../wailsjs/runtime/runtime"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { AIChatMessage, AIStatus, AIToolEvent } from "@/lib/types"

interface AIAssistantProps {
  database: string
  active: boolean
}

// AIAssistant is the per-connection agentic chat. The model answers questions
// about the active database by running read-only SQL through the backend; each
// query it runs surfaces here via the "ai:tool" event.
export function AIAssistant({ database, active }: AIAssistantProps) {
  const [status, setStatus] = useState<AIStatus | null>(null)
  const [messages, setMessages] = useState<AIChatMessage[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [toolLog, setToolLog] = useState<AIToolEvent[]>([])
  const [consentOpen, setConsentOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  function refreshStatus() {
    api
      .aiAssistantStatus(database)
      .then(setStatus)
      .catch(() => setStatus(null))
  }

  useEffect(() => {
    refreshStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [database])

  // Surface each read-only query the assistant runs while a turn is in flight.
  useEffect(() => {
    const off = EventsOn("ai:tool", (ev: AIToolEvent) => setToolLog((prev) => [...prev, ev]))
    return () => off()
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, toolLog])

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    const next = [...messages, { role: "user", content: text }]
    setMessages(next)
    setInput("")
    setToolLog([])
    setBusy(true)
    try {
      const res = await api.aiChat({ database, messages: next })
      setMessages((prev) => [...prev, { role: "assistant", content: res.answer }])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI request failed")
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ " + (e instanceof Error ? e.message : "Request failed") },
      ])
    } finally {
      setBusy(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      send()
    }
  }

  // Clear the thread so the next request starts with no prior turns. Each turn
  // re-sends the whole conversation to OpenRouter, so a fresh chat keeps token
  // costs (and latency) bounded.
  function newChat() {
    if (busy) return
    setMessages([])
    setToolLog([])
    setInput("")
  }

  if (!status) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading assistant…
      </div>
    )
  }

  if (!status.has_key) {
    return (
      <Empty
        title="Add your OpenRouter API key"
        body="Open Settings and paste your OpenRouter key (and pick a model) to use the AI Assistant. Your key is encrypted on disk and only ever sent to OpenRouter."
      />
    )
  }

  if (!status.enabled) {
    return (
      <>
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
          <Sparkles className="text-muted-foreground size-8" />
          <div className="max-w-sm space-y-1">
            <p className="text-sm font-medium">AI Assistant is not enabled for {database}</p>
            <p className="text-muted-foreground text-xs">
              Enabling maps the schema into an editable context file and provisions a read-only
              database user so every AI query is SELECT-only.
            </p>
          </div>
          <Button onClick={() => setConsentOpen(true)}>
            <Sparkles className="size-4" /> Enable AI Assistant
          </Button>
        </div>
        <AIConsentDialog
          open={consentOpen}
          onOpenChange={setConsentOpen}
          database={database}
          onEnabled={(r) => {
            toast.success(
              r.mode === "db_user"
                ? "AI Assistant enabled with a read-only database user"
                : "AI Assistant enabled (app-layer read-only enforcement)"
            )
            refreshStatus()
          }}
        />
      </>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <Sparkles className="size-4" />
        <span className="text-sm font-medium">AI Assistant</span>
        <Badge variant="secondary" className="h-4 gap-1 px-1.5 text-[10px]">
          <ShieldCheck className="size-2.5" />
          {status.mode === "db_user" ? "read-only user" : "read-only"}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 gap-1 text-xs"
          onClick={newChat}
          disabled={busy || messages.length === 0}
          title="Start a new chat (clears context to save tokens)"
        >
          <SquarePen className="size-3.5" /> New chat
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setContextOpen(true)}
        >
          <FileText className="size-3.5" /> Context
        </Button>
      </div>

      {/* Thread */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="text-muted-foreground mx-auto max-w-md pt-8 text-center text-sm">
            Ask anything about <span className="font-medium">{database}</span> — for example,
            "how many orders were placed last month?" or "which customers have no email?"
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
              )}
            >
              {m.role === "assistant" ? (
                <div className="ai-markdown space-y-2 [&_code]:rounded [&_code]:bg-black/10 [&_code]:px-1 [&_table]:w-full [&_table]:text-xs [&_td]:border [&_td]:px-1.5 [&_th]:border [&_th]:px-1.5">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              ) : (
                <span className="whitespace-pre-wrap">{m.content}</span>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="text-muted-foreground space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin" /> Thinking…
            </div>
            {toolLog.map((ev, i) => (
              <div key={i} className="ml-5 font-mono">
                <span className={ev.error ? "text-destructive" : "text-emerald-600"}>
                  {ev.error ? "✗" : "✓"}
                </span>{" "}
                <span className="opacity-80">{ev.sql}</span>
                {!ev.error && <span className="opacity-50"> → {ev.row_count} row(s)</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t p-2">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask about your data… (⌘↵ to send)"
            className="max-h-40 min-h-[2.5rem] flex-1 resize-none"
            disabled={busy || !active}
          />
          <Button size="icon" onClick={send} disabled={busy || !input.trim()} title="Send (⌘↵)">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      </div>

      <DBContextEditor open={contextOpen} onOpenChange={setContextOpen} database={database} />
    </div>
  )
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <Sparkles className="text-muted-foreground size-8" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-muted-foreground max-w-sm text-xs">{body}</p>
    </div>
  )
}
