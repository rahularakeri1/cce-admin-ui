# Deployment Guide — Admin UI

Design stage. Mirrors `cce-insights-ui`'s Docker/Caddy pattern.

## Build

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
ARG VITE_KEYCLOAK_URL
ARG VITE_KEYCLOAK_REALM="cce"
ARG VITE_KEYCLOAK_CLIENT_ID="cce-admin-ui"
ARG VITE_API_BASE_URL=""
ENV VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL \
    VITE_KEYCLOAK_REALM=$VITE_KEYCLOAK_REALM \
    VITE_KEYCLOAK_CLIENT_ID=$VITE_KEYCLOAK_CLIENT_ID \
    VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 3002
```

`VITE_*` values are baked in at build time — unlike auth-optional `cce-insights-ui`, there is no
runtime flag to toggle; **each environment needs its own image build** (developer-setup.md §2).

## Caddyfile

```caddyfile
:3002 {
    encode zstd gzip
    handle /admin/v1/* {
        reverse_proxy gateway-service:8090
    }
    handle {
        root * /srv
        try_files {path} /index.html
        file_server
    }
    header {
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}
```

Routes `/admin/v1/*` to `gateway-service`, **not** directly to `cce-admin-service` — the service is
not internet-facing
([cce-admin-service/docs/architecture-overview.md §4](../../cce-admin-service/docs/architecture-overview.md#4-system-context)).

## Prerequisites before first deploy

- `cce-admin-service` deployed and reachable through `gateway-service`.
- A Keycloak client `cce-admin-ui` (public, PKCE) exists in the target realm — not yet part of any
  seed file (`k8s/seeds/cce-realm.json` only has `gateway-service` and
  `openhim-emitter-adaptor`); add it there as part of this service's rollout rather than creating it
  by hand per environment.
- At least one bootstrap `SUPER_ADMIN` user exists — see
  [cce-admin-service/docs/deployment-guide.md § First deploy](../../cce-admin-service/docs/deployment-guide.md#first-deploy-to-a-new-environment).
  There is no way to create the first user through this UI.
