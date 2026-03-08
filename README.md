# KubeLens

A full-stack Kubernetes operations dashboard. Runs against mock data out of the box — point it at a real cluster when you're ready.

**Stack:** React + Vite · Go API · FastAPI predictor · Kustomize overlays

---

## What it does

| Area | Detail |
|---|---|
| **Inventory** | Pods, nodes, deployments, services, ingresses, namespaces, RBAC, events, storage, config — all views are live |
| **Diagnostics** | Rule-based analysis engine with remediation recommendations |
| **Risk scoring** | Evidence-based signal scoring from pod/node health indicators |
| **Ops assistant** | Deterministic flow + optional LLM provider, RAG-grounded on Kubernetes docs |
| **Metrics** | CPU/memory via `metrics.k8s.io` when Metrics Server is present |
| **Multi-cluster** | Switch between named cluster contexts at runtime |
| **Audit trail** | Per-request log with actor attribution and outcome |
| **Alerts** | Alertmanager, Slack, PagerDuty integration |

---

## Quick start

```bash
npm install
npm run dev
```

- Frontend → `http://localhost:5173`
- Backend → `http://localhost:3000`

Runs in `demo` mode with mock data. No cluster required, no config needed.

---

## Connect to a real cluster

Provide your kubeconfig as a base64 string:

**Bash:**
```bash
export KUBECONFIG_DATA=$(base64 -w 0 ~/.kube/config)
npm run dev
```

**PowerShell:**
```powershell
$bytes = [System.IO.File]::ReadAllBytes("$HOME\.kube\config")
$env:KUBECONFIG_DATA = [Convert]::ToBase64String($bytes)
npm run dev
```

For CPU/memory metrics, verify Metrics Server is running:
```bash
kubectl top nodes
kubectl top pods -A
```

---

## Modes

| Mode | Use case | Auth | Writes |
|---|---|---|---|
| `dev` | Local engineering | Off | Off |
| `demo` | Safe showcase | Off | Off |
| `prod` | Controlled operations | **Required** | Off |

Write actions are opt-in in every mode. Enabling writes without auth is rejected at startup. `prod` mode refuses to boot without `AUTH_ENABLED=true` and valid tokens.

---

## Auth

Set `AUTH_ENABLED=true` and provide tokens:

```env
AUTH_TOKENS=viewer:viewer:token1,operator:operator:token2,admin:admin:token3
```

**Roles:**

| Role | Permissions |
|---|---|
| `viewer` | Read-only + assistant/stream |
| `operator` | viewer + write actions (if globally enabled) |
| `admin` | operator + policy administration |

**Transport:**
- Primary: `Authorization: Bearer <token>`
- `X-Auth-Token` header is disabled by default and rejected in `prod`
- Mutating cookie-authenticated requests enforce same-origin checks

---

## Docker

```bash
npm run docker:up    # starts dashboard + predictor
npm run docker:down
```

Or build separately:
```bash
npm run docker:build:predictor
npm run docker:run:predictor
```

---

## Kubernetes deployment

```bash
# Development
kubectl apply -k k8s/overlays/dev

# Demo / showcase
kubectl apply -k k8s/overlays/demo

# Production
kubectl apply -k k8s/overlays/prod
```

Each overlay carries its own RBAC ClusterRole, NetworkPolicy, configmap patches, and probe configuration. Production overlay is read-only by default — no `secrets` access.

For multi-cluster, provide named contexts:
```env
KUBECONFIG_CONTEXTS=prod:base64data,staging:base64data
```

See [k8s/README.md](k8s/README.md) for full deployment reference.

---

## Predictor service

The risk scoring service runs as a separate FastAPI container. It's optional — the backend degrades gracefully if unavailable.

```env
PREDICTOR_BASE_URL=http://localhost:8001
PREDICTOR_SHARED_SECRET=your-shared-secret
```

Confidence scores are evidence-based: signal count, metric coverage, warning corroboration, and status severity are scored independently. A resource can have a high risk score with low confidence if signals are sparse.

---

## Ops assistant

Optional. Configure any OpenAI-compatible provider:

```env
ASSISTANT_PROVIDER=openai
ASSISTANT_API_KEY=sk-...
ASSISTANT_MODEL=gpt-4o
ASSISTANT_RAG_ENABLED=true   # grounds responses in Kubernetes docs
```

Leave `ASSISTANT_PROVIDER=none` to disable entirely.

---

## Observability

| Endpoint | Description |
|---|---|
| `GET /api/healthz` | Liveness |
| `GET /api/readyz` | Readiness + cluster/predictor/auth checks (503 if degraded) |
| `GET /api/metrics` | JSON request telemetry |
| `GET /api/metrics/prometheus` | Prometheus exposition format |
| `GET /api/openapi.yaml` | Published API contract |

---

## Configuration reference

Copy `.env.example` to `.env` and set what you need. Key variables:

```env
APP_MODE=demo                    # dev | demo | prod
DEV_MODE=false                   # convenience fallbacks for local dev only

KUBECONFIG_DATA=                 # base64 kubeconfig for single cluster
KUBECONFIG_CONTEXTS=             # name:base64,name:base64 for multi-cluster

AUTH_ENABLED=false
AUTH_TOKENS=                     # user:role:token,user:role:token
WRITE_ACTIONS_ENABLED=false

PREDICTOR_BASE_URL=
PREDICTOR_SHARED_SECRET=

ASSISTANT_PROVIDER=none
ASSISTANT_API_KEY=
ASSISTANT_MODEL=

RATE_LIMIT_ENABLED=true
RATE_LIMIT_REQUESTS=300
RATE_LIMIT_WINDOW_SECONDS=60

ALERTMANAGER_WEBHOOK_URL=
SLACK_WEBHOOK_URL=
PAGERDUTY_ROUTING_KEY=
```

---

## Development

```bash
npm run lint              # ESLint
npm run test:web          # Vitest (frontend)
npm run test:go           # Go tests
npm run test:predictor    # Pytest
npm run test:e2e          # Playwright (Chromium + Firefox)
npm run build             # Production build
```

CI runs all of the above plus:
- Release/version consistency across `package.json`, Docker image tags, and k8s manifests
- Changelog discipline check
- OpenAPI contract validation
- Kustomize build + kubeconform schema validation for all overlays
- Docker builds for both images

Nothing merges unless all gates pass.

---

## Troubleshooting

**Metrics show `N/A`** — Metrics Server is not installed or not healthy. Verify with `kubectl top nodes`.

**Predictions fall back to degraded** — Predictor is unreachable. Check `PREDICTOR_BASE_URL` and `/api/readyz`.

**`403` on write operations** — Either the role doesn't permit writes, or `WRITE_ACTIONS_ENABLED=false`. Both must allow it.

**Startup fails in `prod` mode** — `AUTH_ENABLED=true` and `AUTH_TOKENS` are required. `DEV_MODE=true` is rejected in prod.

**`401` on predictor** — `PREDICTOR_SHARED_SECRET` must match between dashboard and predictor service.

---

## Security

- Non-root container, read-only root filesystem, dropped capabilities
- NetworkPolicy default-deny with explicit allow paths
- PDB + HPA included in all overlays
- Per-request audit log with actor attribution
- Rate limiting on all `/api/*` routes
- CSRF same-origin enforcement on mutating cookie-authenticated requests

Full details: [SECURITY.md](docs/SECURITY.md) · [THREAT_MODEL.md](docs/THREAT_MODEL.md) · [OPERATIONS_VERIFICATION.md](docs/OPERATIONS_VERIFICATION.md)

---

## Architecture

```
React + Vite  ──►  Go API (/api/*)  ──►  Kubernetes API
                       │             ──►  metrics.k8s.io
                       │             ──►  FastAPI Predictor
                       │             ──►  AI Provider (optional)
                       │             ──►  Docs RAG Service
                       └─────────────►  Audit Log
```

Full details: [ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## Changelog

[CHANGELOG.md](CHANGELOG.md)
