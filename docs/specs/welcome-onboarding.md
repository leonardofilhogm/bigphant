# Spec — Welcome / Onboarding Screen

**Status:** Implemented
**Owner:** TBD
**Parent contract:** `docs/prd.md` (refines first-run UX; relates to PRD §7.2 settings,
and `docs/specs/plans-and-licensing.md` for the activation/license flow)
**Scope:** First-run welcome experience and license management surface. Frontend-led,
with one small `settings.json` field added server-side (and an optional license helper).
Does **not** touch SQL paths, the data grid, or any `internal/mysql` / `sqlbuilder` code.

---

## 1. Summary

Add a **Welcome screen** that shows once, on first launch, before the user reaches the
activation/connection flow. It:

1. opens with a short **entrance animation** (logo + headline),
2. presents a **feature-overview carousel** (a few slides describing what Bigphant does),
3. offers **Next** (advance slide) and **Skip** (dismiss the whole thing), with a
   **Get Started** CTA on the final slide, and
4. surfaces a clear way to **change or remove the current license**, both from the welcome
   flow and from the existing Settings → License panel.

The "show once" decision is persisted in `settings.json` via a new
`onboarding_completed` flag, consistent with the PRD rule that **all app state lives in the
two files under `~/Library/Application Support/Bigphant/`** — no new storage, no app DB.

---

## 2. Motivation

A new user currently lands directly on the bare `ActivationScreen` (enter a key / get a Free
key) with no explanation of what the app is or what they get. There is also no obvious,
self-describing way to *change* a license (you have to know the key-entry screen is reachable)
or to *remove* one short of the "Sign out (deactivate this device)" button buried in Settings.

A one-time welcome carousel sets context before asking for a license, and consolidating
license change/removal into named actions makes the lifecycle legible.

---

## 3. Current State (implemented)

| Layer | File | State |
|---|---|---|
| App orchestration | `frontend/src/App.tsx` | `loading (license + settings) → WelcomeScreen (if !onboarding_completed) → ActivationScreen → ConnectionList / Workspace`. Loads settings at boot; `completeOnboarding` persists the flag. |
| Welcome UI | `frontend/src/components/WelcomeScreen.tsx` | ✅ Carousel (4 slides), entrance/slide CSS animations, Next/Skip/Back, keyboard (`←/→`, `Esc`). |
| Activation UI | `frontend/src/components/ActivationScreen.tsx` | ✅ Key entry + optional `onCancel` ("Back to app") when opened from Change license. |
| License panel | `frontend/src/components/LicensePanel.tsx` | ✅ Change license, Remove license (confirm dialog), offline fallback via `RemoveLicense`. |
| Settings dialog | `frontend/src/pages/Settings.tsx` | ✅ Replay welcome, threads license callbacks. |
| Settings model (Go) | `internal/settings/store.go` | ✅ `onboarding_completed` on `AppSettings` / `Defaults()`. |
| Local-only clear | `internal/license/service.go` + `app_license.go` | ✅ `RemoveLicense()` exposed to the frontend. |
| Global CSS | `frontend/src/style.css` | ✅ `welcome-in` / `slide-in` + `prefers-reduced-motion` guard. |

---

## 4. Requirements

### 4.1 Must Have

- **M1 — Show once on first run.** When `settings.onboarding_completed` is `false`, the
  Welcome screen is the first thing shown after `loading`, **before** `ActivationScreen`.
  Once completed or skipped, it never auto-shows again.
- **M2 — Entrance animation.** On mount the Welcome screen plays a brief, non-blocking
  entrance animation (e.g. logo fade/scale-in + headline rise). Purely cosmetic; it must not
  gate interaction — controls are usable immediately, and the animation is
  **CSS-driven and dependency-free**.
- **M3 — Feature carousel.** A horizontally-paged carousel of **3–5 slides**, each with an
  icon, a short title, and one or two lines of copy describing a core capability
  (drawn from PRD Must-Haves: connect to MySQL/PostgreSQL, browse/edit rows with a server-side
  destructive-op guard, run raw SQL, inspect/alter table structure). A **dot indicator**
  shows position and slide count.
- **M4 — Next.** A **Next** button advances to the next slide. On the **last** slide it
  becomes the primary CTA (**"Get Started"**) which **completes** onboarding (M6) and routes
  the user onward (M7).
- **M5 — Skip.** A **Skip** affordance is visible on every slide (except optionally the last,
  where "Get Started" replaces it). Skip **completes** onboarding (M6) and routes onward (M7) —
  i.e. "skip" means "don't show me this again", not "show me later".
- **M6 — Persist completion.** Completing (Get Started) or skipping sets
  `onboarding_completed = true` via `api.updateSettings(...)`. Persistence failures are
  non-fatal: the UI still advances (best-effort, matching the existing settings save in
  `Workspace.tsx`).
- **M7 — Route after welcome.** After completion/skip, the app proceeds to the **normal
  gate**: `ActivationScreen` if not activated, otherwise `ConnectionList`. The welcome screen
  itself does **not** bypass license activation.
- **M8 — Change license.** Add a **"Change license"** action (in `LicensePanel`) that opens
  `ActivationScreen` so the user can enter a different key. A successful `ActivateLicense`
  overwrites the stored blob (existing behaviour) — no new backend needed for change.
- **M9 — Remove license.** Add a **"Remove license"** action that, after a confirmation,
  clears the current license and returns the app to the unactivated state
  (→ `ActivationScreen`). Default implementation reuses the existing
  `DeactivateThisDevice()` (releases the device server-side **and** clears local).

### 4.2 Should Have

- **S1 — Replay from Settings.** A "View intro again" / "Replay welcome" link (in Settings)
  re-opens the Welcome screen on demand without resetting `onboarding_completed`.
- **S2 — Keyboard / a11y.** `←/→` arrow keys page the carousel; `Esc` triggers Skip; slides
  expose `aria-roledescription="slide"` and an `aria-live` region announces the current slide;
  the entrance/transition animations respect `prefers-reduced-motion` (reduced-motion users
  get instant, non-animated transitions).
- **S3 — Back/Prev.** A **Back** affordance to step to the previous slide (disabled/hidden on
  slide 1). Low cost given carousel state already exists.
- **S4 — Offline-safe removal.** Add a backend `RemoveLicense()` that clears only the local
  blob (`Store.Clear()` + reset in-memory state) without an API round-trip, so removal works
  when the license server is unreachable. "Remove license" uses this when
  `DeactivateThisDevice()` fails on the network, or as the primary path with a separate
  "Deactivate on all devices" option. (If skipped, M9 still works online-only.)

### 4.3 Could Have (out of scope unless trivial)

- **C1 — Swipe / drag gestures** on the carousel (trackpad/touch). Deferred; click + keyboard
  cover the PoC.
- **C2 — Per-slide deep links** ("Try it" jumping straight to a connection form). Deferred.
- **C3 — Richer media** (Lottie/video). Explicitly avoided — no new heavy deps for a PoC.
- **C4 — A separate `welcome_version` counter** to re-show the intro after major updates.
  Deferred; the single boolean is enough now.

### 4.4 Non-Goals

- No telemetry / analytics on the funnel (PRD: no telemetry, no external calls).
- No new persisted store — the flag lives in the existing `settings.json` only.
- The welcome screen does **not** replace, weaken, or bypass license activation (M7).
- No marketing network fetches; all slide content ships in the bundle.

---

## 5. Design

### 5.1 Persistence — `onboarding_completed`

**Go** (`internal/settings/store.go`): add the field and default it to `false` so existing
installs (and fresh ones) see the welcome once.

```go
type AppSettings struct {
	AllowDestructiveWithoutWhere bool   `json:"allow_destructive_without_where"`
	DefaultTransactionMode       string `json:"default_transaction_mode"`
	Theme                        string `json:"theme"`
	OnboardingCompleted          bool   `json:"onboarding_completed"`
}

func Defaults() AppSettings {
	return AppSettings{
		AllowDestructiveWithoutWhere: false,
		DefaultTransactionMode:       "auto_commit",
		Theme:                        "system",
		OnboardingCompleted:          false,
	}
}
```

> **Migration note:** `Load()` unmarshals onto `Defaults()`, so an older `settings.json`
> without the key decodes as `false` → the welcome shows once for existing users too. That is
> acceptable (arguably desirable). If undesired, treat "file exists but key missing" as
> completed — but the simpler behaviour is fine for a PoC.

**TS** (`frontend/src/lib/types.ts`): mirror the field.

```ts
export interface AppSettings {
  allow_destructive_without_where: boolean
  default_transaction_mode: string
  theme: string
  onboarding_completed: boolean
}
```

`frontend/wailsjs/go/models.ts` regenerates from the Go struct on the next `wails dev`/`build`.

### 5.2 App orchestration (`App.tsx`)

App.tsx must learn the onboarding flag. It currently doesn't load settings, so add a tiny
fetch (or a `useSettings` hook) alongside `useLicense`:

```ts
const [settings, setSettings] = useState<AppSettings | null>(null)
const [showWelcome, setShowWelcome] = useState(false)

useEffect(() => {
  api.getSettings().then((s) => {
    setSettings(s)
    if (!s.onboarding_completed) setShowWelcome(true)
  }).catch(() => {/* non-fatal: skip welcome if settings unreadable */})
}, [])

async function completeOnboarding() {
  setShowWelcome(false)
  try {
    if (settings) await api.updateSettings({ ...settings, onboarding_completed: true })
  } catch {/* best-effort (M6) */}
}
```

Gate order (replaces the current `loading → activation` head of `App`):

```
loading (license OR settings still loading)  → "Loading…"
showWelcome                                  → <WelcomeScreen onDone={completeOnboarding} />
!activated                                   → <ActivationScreen … />
otherwise                                    → ConnectionList / Workspace
```

`onDone` is fired by **both** Get Started and Skip (M4/M5/M7). After it, the existing
`!activated` branch takes over — activation is never skipped.

> **Loading coordination:** keep showing "Loading…" until *both* the license check and the
> settings fetch resolve, so the welcome decision isn't made on stale/empty settings and the
> screen doesn't flash.

### 5.3 `WelcomeScreen` component (new)

`frontend/src/components/WelcomeScreen.tsx`. Self-contained; one prop.

```ts
interface WelcomeScreenProps {
  onDone: () => void   // called on Get Started AND Skip (M4/M5)
}

interface Slide { icon: LucideIcon; title: string; body: string }

const SLIDES: Slide[] = [
  { icon: Database,   title: "Connect to your databases", body: "Save and open MySQL and PostgreSQL connections — credentials stay encrypted on your Mac." },
  { icon: TableProperties, title: "Browse & edit safely", body: "Filter, sort, and edit rows in a fast grid. Destructive ops are caught server-side before they run." },
  { icon: Terminal,   title: "Run raw SQL",           body: "A first-class SQL editor with result grids — your queries, your control." },
  { icon: Wrench,     title: "Inspect structure",     body: "Read columns, indexes, and keys, and apply structural changes through guarded ALTERs." },
]
```

State + handlers:

```ts
const [i, setI] = useState(0)
const last = i === SLIDES.length - 1
const next = () => (last ? onDone() : setI((n) => n + 1))   // M4
const prev = () => setI((n) => Math.max(0, n - 1))          // S3
```

Layout (Tailwind, matching `ActivationScreen`'s centered shell):

- Full-screen `bg-background`, centered card `max-w-md`.
- **Header:** `<Logo>` + product headline, both animated in on mount (M2).
- **Slide area:** a viewport that renders the active slide; transition between slides via
  translate/opacity (see §5.4). Icon (`size-10`, muted accent), `title` (`text-lg font-semibold`),
  `body` (`text-muted-foreground text-sm`).
- **Dots:** `SLIDES.map` → a row of dots; active dot wider/filled (M3).
- **Footer controls:**
  - left: **Skip** (`variant="ghost"`) — `onClick={onDone}` (M5). Hidden on last slide.
  - right: **Next** (primary) → **"Get Started"** on the last slide (M4).
  - optional **Back** (`variant="ghost"`, hidden on slide 0) (S3).

Accessibility (S2): wrap slides with `role="group" aria-roledescription="slide"
aria-label={\`${i+1} of ${SLIDES.length}\`}`; add a visually-hidden `aria-live="polite"`
region announcing the current title; bind `keydown` for `←/→` (page) and `Esc` (skip).

### 5.4 Animation (dependency-free)

Add keyframes to `frontend/src/style.css`:

```css
@keyframes welcome-in {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0)   scale(1); }
}
@keyframes slide-in {
  from { opacity: 0; transform: translateX(16px); }
  to   { opacity: 1; transform: translateX(0); }
}
@media (prefers-reduced-motion: reduce) {
  .welcome-anim, .slide-anim { animation: none !important; }
}
```

- **Entrance (M2):** apply `welcome-anim` (`animation: welcome-in 420ms ease-out both`) to the
  logo/headline block, with a small stagger via `animation-delay` for headline vs. logo.
- **Slide change:** key the slide container on `i` (`<div key={i} className="slide-anim">…`)
  so React remounts it and the `slide-in` animation replays on each step.
- **Reduced motion (S2):** the media query disables both; transitions become instant.

> Tailwind v4 is CSS-first; defining raw `@keyframes` in `style.css` and referencing them via
> small utility classes keeps this dependency-free. No `framer-motion`, no carousel lib.

### 5.5 License change / remove

**Change (M8):** `LicensePanel` gets an `onChangeLicense` callback that opens
`ActivationScreen` (the same path `ConnectionList.onManageLicense` already uses). Entering a
new key calls `ActivateLicense`, which verifies and overwrites the stored blob. Wire
`onChangeLicense` from `Settings` (and from `Workspace`, which renders `Settings`) up to the
App-level `setShowActivation(true)`.

**Remove (M9):** add a **"Remove license"** button (`variant="destructive"`) to `LicensePanel`,
behind a confirmation (reuse a `Dialog`/`AlertDialog` pattern). On confirm:

- default path → `api.deactivateThisDevice()` (existing) → `onSignOut()` (App returns to
  `ActivationScreen` since `activated` flips false on `refresh`).
- relabel the existing button: "Sign out (deactivate this device)" → **"Remove license"**
  (the underlying action is the same; the name is clearer). Keep the device list / "Check now"
  as-is.

**Offline removal (S4, optional backend):** add to `internal/license/service.go`:

```go
// RemoveLicense clears the local license blob without contacting the API.
func (s *Service) RemoveLicense() error {
	_ = s.store.Clear()
	s.mu.Lock()
	s.claims, s.token, s.key = nil, "", ""
	s.state = StateUnactivated
	s.mu.Unlock()
	return nil
}
```

…exposed as `App.RemoveLicense()` in `app_license.go`, and `api.removeLicense()` in `api.ts`.
"Remove license" then tries `DeactivateThisDevice()` first and falls back to `RemoveLicense()`
on network error (so a user can always get unstuck offline). If S4 is dropped, M9 is
online-only.

### 5.6 Replay from Settings (S1)

In `Settings.tsx`, add a "Replay welcome" link that calls a new `onReplayWelcome` prop →
App sets `setShowWelcome(true)` (without touching `onboarding_completed`). `onDone` then runs
its normal best-effort save (idempotent — already `true`).

---

## 6. UI / UX decisions

| Decision | Choice | Rationale |
|---|---|---|
| Welcome before or after activation | **Before** | Context first, then the ask. Activation is still mandatory afterward (M7). |
| Skip semantics | "Don't show again" (sets the flag) | Matches user expectation for a one-time intro; replay lives in Settings (S1). |
| Slide count | 3–5 | Enough to cover core value without fatigue. |
| Carousel implementation | Hand-rolled state + CSS | Avoids a new dependency for a PoC; embla/shadcn-carousel is overkill here. |
| Animation tech | CSS `@keyframes` + reduced-motion guard | Dependency-free, respects accessibility. |
| "Remove" naming | Rename "Sign out" → "Remove license" + confirm | "Sign out" undersells that it deactivates the device & wipes the local key. |
| Confirmation on remove | Yes (destructive) | Re-activation requires the key again / a device slot; warrants a confirm. |

---

## 7. Edge cases

- **`getSettings` fails** → skip the welcome (don't block the app); user still hits activation.
- **`updateSettings` fails on completion (M6)** → UI still advances; welcome may reappear next
  launch. Acceptable (best-effort), mirrors existing settings-save behaviour.
- **Already activated, first run** → welcome still shows once (it's gated on the onboarding
  flag, not on activation), then lands on `ConnectionList` (M7). Correct.
- **Reduced motion** → entrance + slide animations disabled via media query (S2); content
  appears instantly.
- **Remove license while offline (no S4)** → `DeactivateThisDevice` errors; surface the error
  via toast and leave the license intact. With S4, fall back to local clear.
- **Change license cancelled** → user closes `ActivationScreen` without entering a key; prior
  license remains active (existing behaviour; ensure the activation screen is dismissible back
  to the prior state, consistent with `onManageLicense` today).
- **Rapid Next clicks past the end** → `next()` calls `onDone()` only on the last slide; guard
  against double-firing by disabling the button after `onDone` or unmounting on route change.

---

## 8. Files to change

| File | Change |
|---|---|
| `internal/settings/store.go` | Add `OnboardingCompleted bool \`json:"onboarding_completed"\`` to `AppSettings` and to `Defaults()`. |
| `internal/license/service.go` | *(S4, optional)* Add `RemoveLicense()` — local-only clear + state reset. |
| `app_license.go` | *(S4, optional)* Expose `func (a *App) RemoveLicense() error`. |
| `frontend/wailsjs/go/...` | Regenerated by Wails (models + bindings) after the Go changes. |
| `frontend/src/lib/types.ts` | Add `onboarding_completed: boolean` to `AppSettings`. |
| `frontend/src/lib/api.ts` | *(S4)* Add `removeLicense()` wrapper. |
| `frontend/src/components/WelcomeScreen.tsx` | **New** — carousel + entrance animation + Next/Skip/Back. |
| `frontend/src/App.tsx` | Load settings; gate `showWelcome` on `onboarding_completed`; render `WelcomeScreen` before `ActivationScreen`; `completeOnboarding`; wire `onChangeLicense`/`onReplayWelcome`. |
| `frontend/src/style.css` | `welcome-in` / `slide-in` keyframes + `prefers-reduced-motion` guard. |
| `frontend/src/components/LicensePanel.tsx` | Add **Change license** action; rename removal to **Remove license** + confirm; *(S4)* offline fallback. |
| `frontend/src/pages/Settings.tsx` | Thread `onChangeLicense` and *(S1)* `onReplayWelcome` to `LicensePanel`/UI. |
| `frontend/src/pages/Workspace.tsx` | Pass the new callbacks through to `Settings`. |

---

## 9. Acceptance criteria

1. On a machine with no `settings.json` (or with `onboarding_completed:false`), launching the
   app shows the Welcome screen **before** the activation screen.
2. The Welcome screen plays an entrance animation on mount; controls are usable immediately.
3. The carousel shows 3–5 slides with icon/title/body and a dot indicator reflecting position.
4. **Next** advances slides; on the last slide it reads **"Get Started"** and dismisses the
   welcome.
5. **Skip** dismisses the welcome from any slide.
6. After Get Started or Skip, `settings.json` contains `"onboarding_completed": true`, and
   relaunching the app goes straight to activation/connection list with **no** welcome screen.
7. After welcome, an unactivated user sees `ActivationScreen`; an activated user sees
   `ConnectionList` — welcome never bypasses activation.
8. Settings → License shows a **Change license** action that opens the key-entry screen;
   entering a valid different key activates it and updates the displayed masked key/plan.
9. Settings → License shows a **Remove license** action that, after confirmation, returns the
   app to the unactivated state (activation screen on next gate evaluation).
10. With `prefers-reduced-motion: reduce`, no entrance/slide animations play.
11. *(S1)* A "Replay welcome" control in Settings re-opens the carousel without changing the
    persisted flag.
12. *(S4)* Removing a license while the license API is unreachable still clears the local key
    and returns to unactivated.

---

## 10. Test notes

- **Manual (PoC default):**
  - Delete `~/Library/Application Support/Bigphant/settings.json` → relaunch → verify welcome
    shows once, then never again after Skip/Get Started (inspect the file for the flag).
  - Walk Next through all slides; confirm the CTA label flips on the last slide.
  - Toggle macOS "Reduce motion" and confirm animations are suppressed.
  - From Settings: Change license (enter the other Dev key — `BP-PRO-DEV…` / `BP-FREE-DEV…`)
    and Remove license; confirm the gate returns to `ActivationScreen`.
  - *(S4)* Stop `tools/mock-license-api`, then Remove license; confirm local clear + fallback.
- **Optional unit (Go):** `settings` round-trip test asserting `onboarding_completed`
  marshals/unmarshals and an older file without the key decodes to `false`. *(S4)* a
  `RemoveLicense` test asserting the blob is cleared and state is `StateUnactivated` with no
  network call.

---

## 11. Out of scope (restated)

Swipe/touch gestures, Lottie/video media, per-slide deep links, a welcome-version re-show
counter, onboarding telemetry, and any change to SQL/grid/connection internals. Anything not
in §4.1/§4.2 is deferred per the PRD's "PRD is the contract" rule. The welcome screen is
presentational onboarding only — it must not alter the licensing or destructive-op contracts.
