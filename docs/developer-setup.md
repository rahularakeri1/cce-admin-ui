# Developer Setup — Admin UI

Design stage — no code yet. Mirrors `cce-insights-ui`'s tooling; see
[cce-admin-service/docs/developer-setup.md](../../cce-admin-service/docs/developer-setup.md) for the
backend half of this same local loop.

## Prerequisites

- **Node 20+** (required — not just recommended). Tailwind CSS 4's native `@tailwindcss/oxide`
  engine ships platform binaries gated on `node >= 20`; npm silently skips installing it on Node
  18 rather than erroring, which surfaces later as a confusing "Cannot find native binding" build
  failure that *looks* like the unrelated npm optional-dependencies bug
  ([npm/cli#4828](https://github.com/npm/cli/issues/4828)) it happens to share an error message
  with. If you hit that error, check your Node version before chasing the npm bug — on Node 18 the
  fix is `npm install @tailwindcss/oxide-linux-x64-gnu@<matching-version> --no-save` (or the
  platform-appropriate package), but upgrading to Node 20+ avoids needing this workaround at all.
- npm 10+
- The platform's shared local infra running (`deploy-scripts/local`) — Keycloak realm `cce`, backend
  reachable on `localhost:8085`

## 1. Scaffold

```bash
npm create vite@latest cce-admin-ui -- --template react-ts
cd cce-admin-ui
npm install react-router-dom @tanstack/react-query @tanstack/react-table \
  react-hook-form zod @hookform/resolvers keycloak-js date-fns
npm install -D tailwindcss @heroicons/react vitest @testing-library/react msw
```

Folder layout (PRD §6): `pages/ components/ hooks/ api/ auth/ schemas/ context/`.

## 2. Environment

| Var | Default | Notes |
|---|---|---|
| `VITE_KEYCLOAK_URL` | `${origin}/auth` | `http://localhost:8081` locally against the shared infra |
| `VITE_KEYCLOAK_REALM` | required | `cce` locally — same realm `cce-insights-ui` uses |
| `VITE_KEYCLOAK_CLIENT_ID` | `cce-admin-ui` | Needs its own Keycloak client (public, PKCE) — not yet in `k8s/seeds/cce-realm.json`, create manually in the admin console until it is |
| `VITE_API_BASE_URL` | `""` | Empty locally (Vite proxy handles `/admin/v1/*` → `localhost:8085`) |

```ts
// vite.config.ts — dev proxy
server: {
  port: 3002,
  proxy: { '/admin/v1': 'http://localhost:8085' },
}
```

## 3. Build order (suggested, matches milestone F1 in the PRD)

1. `auth/` first — `initAuth()`, `getToken()`, context. Nothing else can be meaningfully tested
   without it since every API call needs a token.
2. `api/client.ts` (typed wrapper, `ApiError`) — see
   [api-integration.md](api-integration.md#1-api-client).
3. MSW handlers mirroring
   [cce-admin-service/docs/api-reference.md](../../cce-admin-service/docs/api-reference.md), including
   a toggleable `KEYCLOAK_SYNC_FAILED` response.
4. App shell: sidebar from `GET /me/menus?console=ADMIN` + header from `GET /me` (Milestone 7; a role sees only the tabs it carries). Milestone 8: the Protocols tab calls `cce-protocol-service` through the gateway — the dev server forwards `/v1/protocol` to the local gateway (`:8090`), which routes it to the protocol service on `:8091`.
5. Screens in PRD milestone order: Roles (F2) → Permissions tab (F3) → Users (F4) → Menus (F5) — see
   [cce-admin-ui-subtasks.txt] for the exact dependency-ordered breakdown.

## 4. Scripts

`npm run dev` (port 3002), `build` (`tsc -b` then Vite), `test`, `test:ci`, `lint`.

## 5. Running against the real backend

Once `cce-admin-service` is up locally (its own developer-setup.md), point this app at it directly
via the Vite proxy above — no MSW. Run the PRD's scenarios S1–S6 end to end before considering a
milestone done (same E2E gate as the backend).

### Running the Protocols page locally (Milestone 8)

The page needs the whole chain, not just this app: Vite (`:3002`) → local gateway (`:8090`) → `cce-protocol-service`
(`:8091`). Start the protocol service with `SERVER_PORT=8091 ./gradlew bootRun` and the gateway with
`cce-admin-service/scripts/run-gateway-local.sh` (it routes `/v1/protocol/**`), run the gateway sync once after
`cce-admin-service` has applied V5 (see that repo's developer-setup), and sign in as a `SUPER_ADMIN`. If the
protocol service is stopped, the page says "Protocol service unavailable" (the gateway answers `500`). To try the
upload, use a copy of `emr-service-protocol.json` with a **different `version`** — the original is usually already
loaded — and retire only that copy: retiring a protocol stops it matching events.
