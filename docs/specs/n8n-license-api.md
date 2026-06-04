# n8n License API (mock) — implementation guide

Move license activation/validation off the localhost `tools/mock-license-api`
and onto **n8n webhooks**, so the built `.app` can be shared with other users and
phone home to a real (mocked) endpoint.

Scope of this doc: stand up 5 webhooks (only 2 sign tokens), mock **two**
licenses (one Free, one Pro), point the app at n8n, rebuild, distribute.

---

## 1. How it fits together

The app calls `c.base + "/v1/licenses/..."` (`internal/license/client.go`). So:

| Setting | Value |
| --- | --- |
| `APIBase` (`internal/license/config.go`) | `https://automate.trato.site/webhook` |
| Webhook node paths | `v1/bigphant/activate`, `v1/bigphant/validate`, `v1/bigphant/deactivate`, `v1/bigphant/devices`, `v1/bigphant/register` |

Full URL becomes e.g. `https://automate.trato.site/webhook/v1/bigphant/activate`.
The client's request paths are set in `internal/license/client.go` (one `c.post(...)` per method).

**The real check is client-side, not HTTP.** The app verifies an
**EdDSA (Ed25519) signed JWT** returned in `data.token` against `PublicKeyB64`
and reads the entire license (plan, features, expiry) from its claims
(`internal/license/blob.go`). The HTTP envelope is just transport.

**Simplification — always respond `200`.** The client only treats HTTP **≥500**
specially (`client.go`). An `ok:false` body with the right `error.code` still
drives `InvalidKey` / `Revoked` correctly, so no per-status-code logic is needed.

Only `activate` and `validate` sign tokens. The other three are static stubs.

---

## 2. Keypair

### Option A — quick (reuse the dev keypair)

`PublicKeyB64` in `config.go` already pairs with the dev private key, so you can
paste that private key straight into n8n and **skip rebuilding the public key**.
Fine for a throwaway mock; the private key is in the public repo, so anyone can
forge licenses.

Dev private key (64-byte, seed+pub, base64):

```
7FJl75hZ2hN/pMTPv3Y8NxUyq0vQ5u6qL6+cUCcycTQQ0x14YZLBo6y2bav6q3t76SzOgFdG39YsPb6UydqfMw==
```

### Option B — recommended (fresh keypair)

Keep the private key out of the repo — only n8n holds it.

```go
// gen.go  →  go run gen.go
package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"fmt"
)

func main() {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	fmt.Println("PublicKeyB64 (-> config.go):", base64.StdEncoding.EncodeToString(pub))
	fmt.Println("PRIV_B64     (-> n8n):      ", base64.StdEncoding.EncodeToString(priv))
}
```

Put `PublicKeyB64` in `config.go`, keep `PRIV_B64` only in the n8n Code nodes.

---

## 3. The two mocked licenses

These match `internal/license/devkeys.go`, so local dev auto-activate keeps working too.

| Key | Plan | Features |
| --- | --- | --- |
| `BP-FREE-DEV00-DEV01-DEV02-DEV03` | free | 2 connections, no export/backup/schema/ai |
| `BP-PRO-DEV00-DEV01-DEV02-DEV03` | pro | unlimited connections, all features |

---

## 4. n8n setup

For **each** endpoint create: a **Webhook node** → a **Code node**.

| Endpoint | Webhook Path | What it does |
| --- | --- | --- |
| activate | `v1/bigphant/activate` | signs & returns a JWT |
| validate | `v1/bigphant/validate` | re-signs & returns a fresh JWT |
| register | `v1/bigphant/register` | static stub |
| deactivate | `v1/bigphant/deactivate` | static stub |
| devices | `v1/bigphant/devices` | static stub |

Webhook node settings:

- **HTTP Method:** `POST`
- **Path:** the path from the table above
- **Respond:** `When last node finishes`
- **Response Data:** `First Entry JSON`

The Code node returns the envelope as its first item's JSON; that becomes the
HTTP 200 response body.

> **Requirement:** the Code node uses `require('crypto')`. Self-hosted n8n needs
> env `NODE_FUNCTION_ALLOW_BUILTIN=crypto` (or `*`). n8n's built-in *Crypto* node
> **cannot** do Ed25519 — only the Code node can. If you're on n8n Cloud and the
> import is blocked, run self-hosted (Docker) for the signing workflows.

### 4.1 `activate` — Code node

```js
const crypto = require('crypto');

const PRIV_B64 = 'PASTE_PRIV_B64_HERE'; // 64-byte ed25519 key (seed+pub)

const LICENSES = {
  'BP-FREE-DEV00-DEV01-DEV02-DEV03': { plan: 'free', email: 'free@bigphant.app' },
  'BP-PRO-DEV00-DEV01-DEV02-DEV03':  { plan: 'pro',  email: 'pro@bigphant.app'  },
};
const FEATURES = {
  free: { max_connections: 2,  export: false, backup: false, modify_schema: false, ai: false },
  pro:  { max_connections: -1, export: true,  backup: true,  modify_schema: true,  ai: true  },
};

const b64url = (b) =>
  Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function privKey() {
  const raw = Buffer.from(PRIV_B64, 'base64'); // expect 64 bytes (seed+pub) or 32 (seed)
  if (raw.length !== 64 && raw.length !== 32) {
    throw new Error(`PRIV_B64 decoded to ${raw.length} bytes — expected 32 or 64. Did you paste the real key?`);
  }
  const seed = raw.subarray(0, 32);
  const der = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]);
  return crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
}

function sign(key, lic, deviceId) {
  const now = Math.floor(Date.now() / 1000);
  const exp = lic.plan === 'free' ? now + 10 * 365 * 24 * 3600 : now + 365 * 24 * 3600;
  const payload = {
    sub: 'lic_' + lic.plan, plan: lic.plan, email: lic.email, device_id: deviceId,
    issued_at: now, iat: now, exp, features: FEATURES[lic.plan],
    max_devices: 2, last_validated_at: now, license_key: key,
  };
  const head = b64url(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.sign(null, Buffer.from(head + '.' + body), privKey());
  return head + '.' + body + '.' + b64url(sig);
}

const req = $input.first().json.body || {};
const key = String(req.key || '').trim().toUpperCase();
const lic = LICENSES[key];
if (!lic) return [{ json: { ok: false, error: { code: 'InvalidKey', message: 'unknown license key' } } }];
return [{ json: { ok: true, data: { token: sign(key, lic, req.device_id || '') } } }];
```

### 4.2 `validate` — Code node

Copy the same helpers (`PRIV_B64`, `LICENSES`, `FEATURES`, `b64url`, `privKey`,
`sign`) from §4.1, then append:

```js
const req = $input.first().json.body || {};
let claims = {};
try {
  claims = JSON.parse(
    Buffer.from(String(req.token || '').split('.')[1] || '', 'base64').toString()
  );
} catch (e) {}
const key = String(claims.license_key || '').toUpperCase();
const lic = LICENSES[key];
if (!lic) return [{ json: { ok: false, error: { code: 'Revoked', message: 'license not found' } } }];
return [{ json: { ok: true, data: { token: sign(key, lic, req.device_id || claims.device_id || '') } } }];
```

### 4.3 Static stubs — Code node (one line each)

```js
// v1/free/register
return [{ json: { ok: true, data: { message: 'registered' } } }];
```

```js
// v1/licenses/deactivate
return [{ json: { ok: true, data: null } }];
```

```js
// v1/licenses/devices
return [{ json: { ok: true, data: [] } }];
```

### 4.4 Activate the workflows

Toggle each workflow **Active** so the production `/webhook/...` URLs go live
(the `/webhook-test/...` URLs only fire while the editor is open).

---

## 5. Point the app at n8n & distribute

Already wired in `internal/license/config.go`:

```go
var (
	APIBase      = "https://automate.trato.site/webhook"
	PublicKeyB64 = devPublicKeyB64 // or your fresh public key from §2 Option B
	CheckoutURL  = "https://bigphant.app/checkout"
)
```

> **Local dev tradeoff:** this default now points at production n8n, so `wails dev`
> no longer talks to `tools/mock-license-api`, and the localhost dev auto-activate
> (`service.go`) is off (it only fires for `http://127.0.0.1`). To run against the
> local mock again, temporarily set `APIBase` back to `http://127.0.0.1:8787`, or
> keep production as default and override for dev builds with ldflags:
>
> ```bash
> wails dev -ldflags "-X bigphant/internal/license.APIBase=http://127.0.0.1:8787"
> ```

Then build and share the `.app`:

```bash
wails build -platform darwin/universal
```

Users enter `BP-FREE-DEV00-DEV01-DEV02-DEV03` or `BP-PRO-DEV00-DEV01-DEV02-DEV03`.
The local dev auto-activate path (`service.go`) stays off automatically because
it only fires when `APIBase` starts with `http://127.0.0.1`.

---

## 6. Verify

```bash
# activate (should return ok:true with a token)
curl -s https://automate.trato.site/webhook/v1/bigphant/activate \
  -H 'Content-Type: application/json' \
  -d '{"key":"BP-PRO-DEV00-DEV01-DEV02-DEV03","device_id":"test","device_meta":{"name":"mac"}}'

# unknown key (should return ok:false, code InvalidKey)
curl -s https://automate.trato.site/webhook/v1/bigphant/activate \
  -H 'Content-Type: application/json' \
  -d '{"key":"BP-NOPE","device_id":"test"}'
```

Paste the returned `token` into <https://jwt.io> — header should be `alg: EdDSA`,
and the payload should carry the right `plan` / `features`. Then activate inside
the app and confirm the license panel shows the expected plan.

---

## 7. Notes & limits (mock only)

- **No device tracking.** Every activation returns a token, so the same key works
  for all users — which is what you want for sharing. The `DeviceLimitReached`
  (409) path never triggers.
- **`validate` trusts the token's `license_key`** to re-issue; it doesn't verify
  the signature server-side. Acceptable for a mock; a real API would verify and
  check revocation/subscription status.
- **Reusing the dev keypair (§2 Option A) means licenses are forgeable** by anyone
  with the repo. Use Option B before any real distribution.
- This replaces `tools/mock-license-api` only as the *network* endpoint; that
  local server stays useful for offline dev against `http://127.0.0.1:8787`.
```
