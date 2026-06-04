# Mock license API

Local dev server for `docs/specs/plans-and-licensing.md`.

```bash
go run ./tools/mock-license-api
```

Listens on `http://127.0.0.1:8787` (override with `PORT`).

## Dev keys (use these)

| Key | Plan |
|-----|------|
| `BP-FREE-DEV00-DEV01-DEV02-DEV03` | **Free** — 2 connections, no export/schema |
| `BP-PRO-DEV00-DEV01-DEV02-DEV03` | **Pro** — unlimited connections, all features |

Paste either key in the app activation screen (with this server running), or set:

```bash
export BIGPHANT_DEV_LICENSE=pro   # or free
wails dev
```

Auto-activation only works when `internal/license.APIBase` points at this mock server (default `http://127.0.0.1:8787`).

`POST /v1/free/register` with `{ "email": "you@example.com" }` also issues a one-off Free key (printed in the server log).
