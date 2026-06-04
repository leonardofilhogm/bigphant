import { cn } from "@/lib/utils"

interface SubTabsProps {
  value: string
  options: readonly string[]
  onChange: (value: string) => void
}

// Compact segmented control used in the per-view bottom bar to switch between
// a table's Data/Structure (or a view's Data/Definition) sub-tabs.
export function SubTabs({ value, options, onChange }: SubTabsProps) {
  return (
    <div className="bg-muted/60 inline-flex items-center gap-0.5 rounded-md p-0.5">
      {options.map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={cn(
            "rounded px-2 py-0.5 text-xs capitalize transition-colors",
            value === s
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {s}
        </button>
      ))}
    </div>
  )
}
