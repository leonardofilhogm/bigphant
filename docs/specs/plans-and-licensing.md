# Spec — Plans, Licensing & Activation

**Status:** Proposed
**Target version:** v0.2.0 — *commercialization* milestone
**Owner:** TBD
**Parent contract:** `docs/prd.md`

> ⚠️ **Scope note.** PRD §4 lists no plan/licensing system in the PoC, and PRD
> §1 explicitly defers "agentic/LLM features" and update/telemetry calls. This
> spec adds the **first outbound network surface** the app will ever make beyond
> the user's own MySQL servers (license check), so it is a deliberate
> architectural expansion. It must not land in v0.1; it is the gate that turns
> Bigphant from a PoC into a commercial product.

---

## 1. Summary

Introduce two plans — **Free** and **Pro** — both gated by a license. Free
exists to force registration (capture an email + device fingerprint); Pro
unlocks the full feature set and is bound to **at most 2 devices** per license
key. A self-hosted HTTPS license API issues, activates, validates, and revokes
keys. The desktop app stores an encrypted license blob locally, validates on
launch with a grace period for offline use, and enforces feature gates
server-side in the Go backend (never in the React layer alone).

Free-plan users see a CyberDuck-style **donation/upgrade modal on close** that
requires an explicit confirmation before the app exits.

---

## 2. Motivation

- Convert anonymous users into known users (email + device) before they get
  value, so Pro conversion has a funnel to measure.
- Establish the licensing infrastructure (API, key format, device binding,
  feature gating) once, cleanly, before AI/agentic features land — those are
  the primary Pro hook in later versions.
- Match competitor pricing pattern (TablePlus: trial + paid; Beekeeper: free
  community + paid Ultimate). Free-with-registration is the differentiator.

---

## 3. Plans

### 3.1 Free

| Capability | Limit |
|---|---|
| Saved connections | **Max 2** (hard cap; 3rd save is rejected) |
| Browse / CRUD on rows | ✅ allowed |
| Raw SQL editor | ✅ allowed |
| Export results (CSV/JSON/SQL) | ❌ blocked |
| Backup (mysqldump-style) | ❌ blocked (and out of PoC scope anyway — listed for completeness) |
| Modify structure (ALTER TABLE, add/drop column, index, key) | ❌ blocked — **view-only** schema |
| AI / agentic features | ❌ blocked (future) |
| Multi-device | License works on any device the user activates (still subject to a per-license device cap; see §6.3) |

A valid **Free license** is still required. The Free tier is *registered-free*,
not *anonymous-free*. No license → app is unusable past the activation screen.

### 3.2 Pro

| Capability | Limit |
|---|---|
| Saved connections | Unlimited |
| All Free capabilities | ✅ |
| Export | ✅ |
| Backup | ✅ (when feature ships) |
| Modify structure / indexes / keys | ✅ |
| AI / agentic features | ✅ (when feature ships; gated by `pro.ai` flag) |
| Devices per license | **2 active devices**; activating a 3rd requires deactivating one |

### 3.3 Feature flag matrix (canonical)

The backend owns this matrix. Frontend mirrors it for UI affordance only.

```go
// internal/license/features.go
type Feature string

const (
    FeatMaxConnections   Feature = "max_connections"      // int
    FeatExport           Feature = "export"               // bool
    FeatBackup           Feature = "backup"               // bool
    FeatModifySchema     Feature = "modify_schema"        // bool — ALTER, CREATE INDEX, DROP, etc.
    FeatAI               Feature = "ai"                   // bool — reserved
)
```

| Feature | Free | Pro |
|---|---|---|
| `max_connections` | `2` | `-1` (unlimited) |
| `export` | `false` | `true` |
| `backup` | `false` | `true` |
| `modify_schema` | `false` | `true` |
| `ai` | `false` | `true` |

---

## 4. License lifecycle

```
   ┌─────────┐  buy/signup  ┌──────────────┐
   │ Visitor │ ───────────► │ License key  │
   └─────────┘              │ issued by API│
                            └──────┬───────┘
                                   │ paste key in app
                                   ▼
                            ┌──────────────┐
                            │ Activation   │ ── POST /licenses/activate
                            │ (device-bound)│   {key, device_id, device_meta}
                            └──────┬───────┘
                                   │ 200 → signed license blob
                                   ▼
                            ┌──────────────┐
                            │  Active      │ ── periodic validate (§6.4)
                            └──────┬───────┘
                                   │
                  ┌────────────────┼────────────────────────┐
                  ▼                ▼                        ▼
            ┌──────────┐    ┌────────────┐         ┌──────────────┐
            │ Deactiv. │    │  Expired   │         │  Revoked     │
            │ (user)   │    │ (Pro only) │         │ (admin/API)  │
            └──────────┘    └────────────┘         └──────────────┘
```

States: `unactivated`, `active`, `grace` (offline beyond last check),
`expired_grace` (grace exceeded — read-only nag mode), `revoked`,
`deactivated`.

---

## 5. License key & blob format

### 5.1 Key (user-visible)

Format: `BP-<plan>-<group>-<group>-<group>-<group>` where each group is 5
Crockford-base32 chars.

Examples:
```
BP-FREE-7H2KQ-9MZRX-4PNCV-8TJBW
BP-PRO -2GXAR-K5HQN-9VTYM-3PCFD   (no space in real value; shown for clarity)
```

The plan token is informational; the **server is the source of truth**. A
client must never grant Pro features just because the key starts with `BP-PRO`.

### 5.2 License blob (stored locally)

After successful activation/validation the server returns a JWT signed with the
Bigphant API's Ed25519 key. The desktop app embeds the **public** key at build
time and verifies every blob it loads. The blob contains:

```json
{
  "sub": "lic_01HXYZ…",            // license id
  "plan": "pro",                   // "free" | "pro"
  "email": "user@example.com",
  "device_id": "…hex…",            // see §6.1
  "issued_at": 1735689600,
  "expires_at": 1767225600,        // Pro: subscription end; Free: far-future
  "features": { … §3.3 matrix … },
  "max_devices": 2,
  "last_validated_at": 1735689600  // updated on each /validate
}
```

Stored at `~/Library/Application Support/Bigphant/license.enc` on macOS (and
the OS-appropriate equivalent on Windows/Linux when those land), encrypted
with the same AES-256-GCM scheme as connection files (PRD §7.1) and a separate
app-bound static key. **Document as a known weakness** — moves to OS keystore
in a follow-up (macOS Keychain / Windows Credential Manager / libsecret).

---

## 6. Device identity

### 6.1 Device ID (cross-platform)

`device_id = sha256( platform || "|" || hardware_id || "|" || os_username )`,
hex-encoded.

| OS | `hardware_id` source |
|---|---|
| macOS | `IOPlatformUUID` via `IORegistryEntryCreateCFProperty` (no shell-out; cgo or `ioreg` fallback) |
| Windows | `MachineGuid` from `HKLM\SOFTWARE\Microsoft\Cryptography` |
| Linux | `/etc/machine-id` (fallback `/var/lib/dbus/machine-id`) |

Hashing with the OS username scopes the device to the user account (two users
on one Mac = two devices, by design — matches license intent). Hashing also
means the raw hardware UUID never leaves the device.

If the hardware source is unavailable (locked-down corporate image, etc.) the
app generates a random UUID, persists it next to `license.enc`, and uses that
as `hardware_id`. This is marked in the activation payload (`fingerprint_kind:
"fallback"`) so support can detect abuse patterns.

### 6.2 Device metadata sent on activation

```json
{
  "key": "BP-PRO-…",
  "device_id": "…",
  "device_meta": {
    "name": "Leo's MacBook Pro",     // os.Hostname()
    "platform": "darwin",            // "darwin" | "windows" | "linux"
    "arch": "arm64",
    "app_version": "0.2.0",
    "fingerprint_kind": "hardware"   // or "fallback"
  }
}
```

No other identifying info is sent. **No telemetry beyond activation/validate
calls** (PRD §1 constraint preserved).

### 6.3 Device cap enforcement

The API tracks `(license_id, device_id)` pairs. On `/activate`:

- If pair exists and not deactivated → return current blob (idempotent).
- If new pair and active device count < `max_devices` → register, return blob.
- If new pair and at cap → `409 DeviceLimitReached` with list of currently
  active devices `[{device_id, name, platform, last_seen_at}]`. The UI shows a
  picker: "Deactivate one to continue." Selecting one issues
  `POST /licenses/deactivate` then retries activation.

Free plan: cap is also enforced (default `max_devices: 2`) to prevent one
email registering hundreds of devices.

### 6.4 Validate cadence & grace

- **On launch**, always attempt `POST /licenses/validate` (non-blocking after
  first success — UI proceeds with cached blob; result is reconciled).
- **Every 24h** while running, retry.
- Cache the last successful timestamp in the blob (`last_validated_at`).
- **Grace period: 3 days** for both plans. While offline within grace, full
  features remain available. After 3 days without a successful validate the
  app enters **read-only mode** (all writes blocked, modal explains why, only
  network retry + "enter key" are actionable) until a successful validate.
- A `revoked` response from the server skips grace entirely — immediate
  lockout.

---

## 7. Backend API contract

Self-hosted HTTPS service. Base URL configured at build time
(`LICENSE_API_BASE`); no fallback. All requests are JSON; all responses include
`{ok, data, error}`.

| Endpoint | Method | Purpose |
|---|---|---|
| `/v1/licenses/activate` | POST | Bind a key to a device, return signed blob |
| `/v1/licenses/validate` | POST | Re-check status; returns updated blob or `revoked`/`expired` |
| `/v1/licenses/deactivate` | POST | Remove a device from a license (used by §6.3 picker and by user-initiated "sign out") |
| `/v1/licenses/devices` | POST | List devices for a key (used by the picker) |
| `/v1/free/register` | POST | Issue a Free key given an email (double opt-in via email link) |

Request/response shapes, error codes, and rate limits are defined in the
license-service repo (out of scope for this doc). The desktop client treats
the API as a black box behind `internal/license/client.go`.

### 7.1 Error codes the client must handle

| Code | Client behavior |
|---|---|
| `InvalidKey` | Show inline error on activation form |
| `DeviceLimitReached` | Show device-picker modal (§6.3) |
| `Revoked` | Hard lockout; clear local blob; show "license revoked" screen |
| `Expired` | Show paywall modal; downgrade to read-only (Pro) or Free features (if license has a Free fallback flag) |
| `NetworkError` | Use cached blob if within grace; else read-only mode |
| `ServerError` (5xx) | Retry with backoff (1m, 5m, 30m); treat as `NetworkError` for UX |

---

## 8. Feature gating in the codebase

### 8.1 Backend (authoritative)

Every gated entry point on the `App` struct calls `license.Require(feature)`
before doing work. Example for the schema-modification path:

```go
// app.go
func (a *App) AlterTable(connID, db, table string, ops AlterOps) error {
    if err := a.licenseSvc.Require(license.FeatModifySchema); err != nil {
        return err // returned as AppError{Code: "PlanRequired", Message: "Upgrade to Pro to modify table structure", SQL: ""}
    }
    return a.engine.AlterTable(connID, db, table, ops)
}
```

Gates to add (initial set):

| Wails method | Gate |
|---|---|
| `SaveConnection` | `max_connections` (count current, reject if at cap) |
| `ExportRows`, `ExportQueryResult` | `export` |
| `AlterTable`, `CreateIndex`, `DropIndex`, `AddColumn`, `DropColumn`, `RenameColumn` | `modify_schema` |
| `ExecuteRaw` | when the destructive classifier (PRD §9) tags the statement as **DDL** (`CREATE`, `ALTER`, `DROP`, `TRUNCATE` on schema objects), require `modify_schema` even in the raw editor |
| Future `AI*` methods | `ai` |

The raw-editor DDL gate is important: Free users can run raw `SELECT` and even
raw DML, but a raw `ALTER TABLE` must be blocked by the same rule the UI
button is blocked by. The classifier already exists for safety prompts — reuse
its tags.

### 8.2 Frontend (UX only)

The frontend reads the feature matrix via `GetLicense()` and:

- Hides or disables Pro-only buttons (export, "+ Add column", etc.) with a
  lock icon and a "Pro" tooltip.
- Shows the connection cap counter in the connection list ("2 / 2").
- Routes any `PlanRequired` AppError into the paywall modal (§9).

**Hiding a button is not a security boundary.** The backend gate is.

---

## 9. UI surfaces

### 9.1 Activation screen

Shown when no valid `license.enc` exists. Two tabs:

- **Enter key** — paste a `BP-…` key, hit Activate.
- **Get Free key** — email field; submits to `/v1/free/register`; tells user
  to check email; once they paste the key from email, behaves like tab 1.

No skip button. The app is unusable until activated.

### 9.2 Paywall modal

Triggered by any `PlanRequired` AppError. Shows:

- Which feature was attempted (from `AppError.Message`).
- Pro feature highlights.
- "Upgrade" button → opens browser to checkout URL (configured at build).
- "Enter different key" → opens activation screen.
- "Maybe later" → dismisses.

### 9.3 Free-plan close confirmation (CyberDuck-style)

When a Free-plan user closes the window (Cmd-Q, red traffic light, or
File→Quit), the close is **intercepted** and a modal appears:

```
┌──────────────────────────────────────────────┐
│  Enjoying Bigphant?                          │
│                                              │
│  You're on the Free plan. Upgrade to Pro to  │
│  unlock unlimited connections, export, and   │
│  schema editing.                             │
│                                              │
│         [ Upgrade ]   [ Quit Bigphant ]      │
└──────────────────────────────────────────────┘
```

- The modal **cannot be dismissed** by clicking outside, Esc, or the window
  close button — only the two explicit buttons exit it.
- Implementation: Wails `OnBeforeClose` hook returns `true` (prevent close),
  shows the modal, then calls `runtime.Quit` only when the user clicks "Quit
  Bigphant".
- Shown **every** close on Free. Not shown on Pro.

### 9.4 Settings → License panel

Shows:

- Plan badge (Free / Pro).
- Email and license key (masked: `BP-PRO-•••••-•••••-•••••-8TJBW`).
- Devices on this license, with "Deactivate this device" and "Sign out".
- "Last validated" timestamp; "Check now" button.

---

## 10. Package layout

New Go package:

```
internal/license/
  client.go        // HTTP client for the license API
  features.go      // Feature enum + matrix types
  service.go       // Activate/Validate/Require + state machine
  blob.go          // Load/save/verify the encrypted JWT blob
  device.go        // Cross-platform device fingerprinting
  device_darwin.go // IOPlatformUUID via cgo
  device_windows.go
  device_linux.go
```

Wired into `app.go` as `a.licenseSvc *license.Service`, constructed in
`startup` after the existing `crypto`/`connections` init. All other packages
that need gating receive the service via constructor injection — no globals.

New Wails methods on `App`:

```go
func (a *App) GetLicense() (LicenseInfo, error)
func (a *App) ActivateLicense(key string) (LicenseInfo, error)
func (a *App) RequestFreeLicense(email string) error
func (a *App) DeactivateThisDevice() error
func (a *App) ListLicenseDevices() ([]Device, error)
func (a *App) ForceValidateLicense() (LicenseInfo, error)
```

---

## 11. Build & configuration

Build-time constants (Go `-ldflags -X`):

| Variable | Purpose |
|---|---|
| `LICENSE_API_BASE` | e.g. `https://api.bigphant.app` |
| `LICENSE_PUB_KEY` | Ed25519 public key (base64) for blob verification |
| `CHECKOUT_URL` | Pro upgrade URL opened from paywall |

A separate `dev` build profile points to a local mock API (`./tools/mock-license-api`)
so developers don't burn real keys during work.

---

## 12. Migration from v0.1 (unlicensed PoC)

Existing v0.1 installs (no license file) → on first launch of v0.2:

- Show activation screen.
- Their saved connections remain on disk but are **read-only** until they
  activate at least Free.
- If they have >2 saved connections and activate Free, the connection list
  shows all of them but only the first 2 (by creation order) are usable;
  others are dimmed with a "Pro" lock. They can delete extras to keep
  different ones, or upgrade.

---

## 13. Out of scope (explicit)

- Trial period for Pro (deferred; can be added as a `plan: "trial"` with an
  `expires_at` shorter than Pro).
- Team/seat licenses.
- Offline-only licenses (USB-dongle style).
- License transfer UI (deactivate-then-activate works; no first-class
  "transfer" flow).
- In-app purchase (App Store / Microsoft Store) — checkout is always web.
- Refund / billing UI — handled entirely by the license API admin surface.

---

## 14. Open questions

1. Does Free expire? (Current draft: no — `expires_at` far-future. Alternative:
   1-year renewal forces re-confirmation of the email.)
2. Should `ExecuteRaw` DML (INSERT/UPDATE/DELETE) be Free, or also gated? Draft
   says Free. Gating it makes Free nearly useless; leaving it open lets power
   users bypass the no-export gate by copy-pasting result sets.
3. What is the source of truth for plan→feature mapping — hardcoded in client
   (this spec) or returned in the JWT? Returning in the JWT lets us change
   plans server-side without shipping a new app, at the cost of trusting the
   signed blob entirely.
4. Free key delivery: email link that activates automatically (deep link
   `bigphant://activate?key=…`), or copy-paste? Deep link is nicer but adds
   URL-handler registration on three OSes.
