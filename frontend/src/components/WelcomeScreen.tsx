import { useCallback, useEffect, useState, type LucideIcon } from "react"
import { Database, TableProperties, Terminal, Wrench } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Logo } from "@/components/Logo"

interface WelcomeScreenProps {
  onDone: () => void
}

interface Slide {
  icon: LucideIcon
  title: string
  body: string
}

const SLIDES: Slide[] = [
  {
    icon: Database,
    title: "Connect to your databases",
    body: "Save and open MySQL and PostgreSQL connections — credentials stay encrypted on your Mac.",
  },
  {
    icon: TableProperties,
    title: "Browse & edit safely",
    body: "Filter, sort, and edit rows in a fast grid. Destructive ops are caught server-side before they run.",
  },
  {
    icon: Terminal,
    title: "Run raw SQL",
    body: "A first-class SQL editor with result grids — your queries, your control.",
  },
  {
    icon: Wrench,
    title: "Inspect structure",
    body: "Read columns, indexes, and keys, and apply structural changes through guarded ALTERs.",
  },
]

export function WelcomeScreen({ onDone }: WelcomeScreenProps) {
  const [i, setI] = useState(0)
  const [finishing, setFinishing] = useState(false)
  const last = i === SLIDES.length - 1
  const slide = SLIDES[i]
  const Icon = slide.icon

  const finish = useCallback(() => {
    if (finishing) return
    setFinishing(true)
    onDone()
  }, [finishing, onDone])

  const next = () => {
    if (last) finish()
    else setI((n) => n + 1)
  }

  const prev = () => setI((n) => Math.max(0, n - 1))

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        finish()
        return
      }
      if (e.key === "ArrowRight") {
        e.preventDefault()
        if (last) finish()
        else setI((n) => Math.min(SLIDES.length - 1, n + 1))
      }
      if (e.key === "ArrowLeft" && i > 0) {
        e.preventDefault()
        setI((n) => n - 1)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [finish, i, last])

  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-md space-y-8">
        <div className="welcome-anim flex flex-col items-center gap-2 text-center">
          <Logo className="h-10" />
          <h1 className="welcome-anim-delay text-xl font-semibold">Welcome to Bigphant</h1>
          <p className="text-muted-foreground text-sm">A fast, native database client for macOS</p>
        </div>

        <div
          role="group"
          aria-roledescription="slide"
          aria-label={`${i + 1} of ${SLIDES.length}`}
          className="space-y-4"
        >
          <p className="sr-only" aria-live="polite">
            {slide.title}
          </p>
          <div key={i} className="slide-anim flex flex-col items-center gap-3 text-center">
            <Icon className="text-primary size-10" aria-hidden />
            <h2 className="text-lg font-semibold">{slide.title}</h2>
            <p className="text-muted-foreground text-sm">{slide.body}</p>
          </div>

          <div className="flex justify-center gap-1.5" aria-hidden>
            {SLIDES.map((_, idx) => (
              <span
                key={idx}
                className={
                  idx === i
                    ? "bg-primary h-2 w-6 rounded-full transition-all"
                    : "bg-muted-foreground/30 size-2 rounded-full"
                }
              />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            {!last && (
              <Button type="button" variant="ghost" disabled={finishing} onClick={finish}>
                Skip
              </Button>
            )}
            {i > 0 && (
              <Button type="button" variant="ghost" disabled={finishing} onClick={prev}>
                Back
              </Button>
            )}
          </div>
          <Button type="button" disabled={finishing} onClick={next}>
            {last ? "Get Started" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  )
}
