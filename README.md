# KubeLens AI

AI-powered Kubernetes operations assistant for deterministic diagnostics and root-cause analysis.

**Stack:** React + Vite, Go API, FastAPI predictor, Kustomize overlays, Helm.

---

## Product vision

KubeLens AI helps engineers diagnose cluster issues, understand failures, and optimize workloads. The differentiator is a deterministic cluster intelligence engine that produces structured diagnostics. The AI layer explains those diagnostics and suggests safe remediation steps; it does not invent facts.

---

## Architecture

```mermaid
flowchart TD
    Browser["Browser UI"] --> API
    API["Go API /api/*"] --> State["Cluster State Cache"]
    State --> Intel["Intelligence Engine"]
    Intel --> Plugins["Diagnostic Plugins"]
    Plugins --> K8S["Kubernetes API"]
    API --> Predictor["Predictor Service"]
    API --> LLM["AI Provider (optional)"]
    State --> Bus["Event Bus"] --> WS["WebSocket/SSE"] --> Browser
```

---

## Screenshots

![Overview](./screenshots/overview.png)
![Diagnostics](./screenshots/diagnostics.png)
![Assistant](./screenshots/assistant.png)
![Metrics](./screenshots/metrics.png)

---

## Demo

![Demo](./screenshots/demo.gif)

---

## What it does

| Area              | Detail                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------- |
| **Inventory**     | Pods, nodes, deployments, services, ingresses, namespaces, RBAC, events, storage, config |
| **Diagnostics**   | Deterministic intelligence engine with evidence + recommendations                        |
| **Risk scoring**  | Pod/node risk signals with confidence scoring and trend detection                        |
| **Ops assistant** | Deterministic answer with optional LLM explanation and RAG grounding                     |
| **Metrics**       | CPU/memory via `metrics.k8s.io` when Metrics Server is present                           |
| **Streaming**     | Real-time event stream over SSE/WebSocket                                                |
| **Multi-cluster** | Switch between named cluster contexts at runtime                                         |
| **Audit trail**   | Per-request log with actor attribution and outcome                                       |
| **Alerts**        | Alertmanager, Slack, PagerDuty integration                                               |

---

## Example diagnostics

```json
{
  "severity": "critical",
  "resource": "payments/payment-api",
  "namespace": "payments",
  "message": "Pod payment-api restarting due to memory limit exceeded.",
  "evidence": ["termination reason: OOMKilled", "restart count: 6", "memory usage exceeded limit"],
  "recommendation": "Increase memory limit or investigate memory leak.",
  "source": "resource-analyzer"
}
```

---

## Quick start

```bash
npm install
npm run dev
```

- Frontend -> `http://localhost:5173`
- Backend -> `http://localhost:3000`

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

| Mode   | Use case              | Auth         | Writes |
| ------ | --------------------- | ------------ | ------ |
| `dev`  | Local engineering     | Off          | Off    |
| `demo` | Safe showcase         | Off          | Off    |
| `prod` | Controlled operations | **Required** | Off    |

Write actions are opt-in in every mode. Enabling writes without auth is rejected at startup. `prod` mode refuses to boot without `AUTH_ENABLED=true` and valid tokens or OIDC configuration.

---

## Auth

Static token auth:

```env
AUTH_ENABLED=true
AUTH_TOKENS=viewer:viewer:token1,operator:operator:token2,admin:admin:token3
```

OIDC/JWT auth:

```env
AUTH_ENABLED=true
AUTH_PROVIDER=google           # google | keycloak | oidc | github
AUTH_OIDC_ISSUER_URL=""         # required for oidc/keycloak
AUTH_OIDC_CLIENT_ID=""          # optional (set if your issuer requires it)
AUTH_OIDC_USERNAME_CLAIM=""      # optional (defaults to preferred_username/email)
AUTH_OIDC_ROLE_CLAIM=""          # optional (defaults to roles/role/groups)
```

**Roles:**

| Role       | Permissions                                  |
| ---------- | -------------------------------------------- |
| `viewer`   | Read-only + assistant/stream                 |
| `operator` | viewer + write actions (if globally enabled) |
| `admin`    | operator + policy administration             |

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

# Tracing (Jaeger)
kubectl apply -k k8s/overlays/tracing

# Observability (Prometheus + Grafana)
kubectl apply -k k8s/overlays/observability
```

Each overlay carries its own RBAC ClusterRole, NetworkPolicy, configmap patches, and probe configuration. Production overlay is read-only by default.

For multi-cluster, provide named contexts:

```env
KUBECONFIG_CONTEXTS=prod:base64data,staging:base64data
```

See [k8s/README.md](k8s/README.md) for full deployment reference.

---

## Helm chart

A minimal Helm chart is available in `helm/kubelens`:

```bash
helm install kubelens ./helm/kubelens
```

---

## Predictor service

The predictor service is optional. It scores incident risk using deterministic signals and CPU trend detection (from node history). If it is unavailable, the backend falls back to local predictions.

```env
PREDICTOR_BASE_URL=http://localhost:8001
PREDICTOR_SHARED_SECRET=your-shared-secret
```

---

## Ops assistant

Optional. Configure any OpenAI-compatible provider:

```env
ASSISTANT_PROVIDER=openai_compatible
ASSISTANT_API_KEY=sk-...
ASSISTANT_MODEL=gpt-4o
ASSISTANT_RAG_ENABLED=true   # grounds responses in Kubernetes docs
```

Leave `ASSISTANT_PROVIDER=none` to disable entirely.

Local Ollama (no code changes required):

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2
```

```env
ASSISTANT_PROVIDER=openai_compatible
ASSISTANT_API_BASE_URL=http://localhost:11434/v1
ASSISTANT_MODEL=llama3.2
ASSISTANT_API_KEY=ollama
```

RAG embeddings (optional):

```env
ASSISTANT_EMBEDDING_MODEL=nomic-embed-text
ASSISTANT_EMBEDDING_BASE_URL=http://localhost:11434/v1
# ASSISTANT_EMBEDDING_API_KEY defaults to ASSISTANT_API_KEY
```

---

## Observability

| Endpoint                      | Description                                                 |
| ----------------------------- | ----------------------------------------------------------- |
| `GET /api/healthz`            | Liveness                                                    |
| `GET /api/readyz`             | Readiness + cluster/predictor/auth checks (503 if degraded) |
| `GET /api/metrics`            | JSON request telemetry                                      |
| `GET /api/metrics/prometheus` | Prometheus exposition format                                |
| `GET /api/openapi.yaml`       | Published API contract                                      |

Grafana + Prometheus are available via the `observability` overlay.

---

## Tracing (OpenTelemetry)

The API and predictor emit OpenTelemetry traces when an OTLP endpoint is configured.

Environment variables:

```text
OTEL_EXPORTER_OTLP_ENDPOINT=host:port
OTEL_EXPORTER_OTLP_PROTOCOL=grpc
OTEL_EXPORTER_OTLP_INSECURE=true
OTEL_SERVICE_NAME=kubelens-backend
OTEL_PREDICTOR_SERVICE_NAME=kubelens-predictor
OTEL_TRACES_SAMPLE_RATIO=1
```

Kubernetes tracing overlay (includes in-cluster Jaeger):

```bash
kubectl apply -k k8s/overlays/tracing
kubectl -n kubernetes-operations-dashboard port-forward svc/k8s-ops-jaeger 16686:16686
```

Trace expectation:

- browser -> API -> k8s client -> predictor should appear as a single timeline in Jaeger.

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
AUTH_PROVIDER=                   # google | keycloak | oidc | github
AUTH_OIDC_ISSUER_URL=
AUTH_OIDC_CLIENT_ID=
AUTH_OIDC_USERNAME_CLAIM=
AUTH_OIDC_ROLE_CLAIM=
WRITE_ACTIONS_ENABLED=false

PREDICTOR_BASE_URL=
PREDICTOR_SHARED_SECRET=

ASSISTANT_PROVIDER=none
ASSISTANT_API_BASE_URL=
ASSISTANT_API_KEY=
ASSISTANT_MODEL=
ASSISTANT_RAG_ENABLED=true
ASSISTANT_EMBEDDING_MODEL=
ASSISTANT_EMBEDDING_BASE_URL=
ASSISTANT_EMBEDDING_API_KEY=

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
npm run lint              # ESLint + Prettier
npm run test:web          # Vitest (frontend)
npm run test:go           # Go tests
npm run ci:backend        # Backend CI parity (fmt + vet + ineffassign + tests)
npm run test:predictor    # Pytest
npm run test:e2e          # Playwright (Chromium + Firefox)
npm run build             # Production build
```

CI runs all of the above plus:

- Release/version consistency across `package.json`, Docker image tags, and k8s manifests
- Changelog discipline check
- OpenAPI contract validation
- Kustomize build + kubeconform schema validation for all overlays
- Go linting via `go vet` and `ineffassign`
- Trivy filesystem scan + hadolint for Dockerfiles
- Docker builds for both images

---

## Troubleshooting

**Metrics show `N/A`** -> Metrics Server is not installed or not healthy. Verify with `kubectl top nodes`.

**Predictions fall back to degraded** -> Predictor is unreachable. Check `PREDICTOR_BASE_URL` and `/api/readyz`.

**`403` on write operations** -> Either the role does not permit writes, or `WRITE_ACTIONS_ENABLED=false`. Both must allow it.

**Startup fails in `prod` mode** -> `AUTH_ENABLED=true` and `AUTH_TOKENS` or OIDC config are required.

**`401` on predictor** -> `PREDICTOR_SHARED_SECRET` must match between dashboard and predictor service.

---

## Security

- Non-root container, read-only root filesystem, dropped capabilities
- NetworkPolicy default-deny with explicit allow paths
- PDB + HPA included in all overlays
- Per-request audit log with actor attribution
- Rate limiting on all `/api/*` routes
- CSRF same-origin enforcement on mutating cookie-authenticated requests

Full details: [SECURITY.md](docs/SECURITY.md) � [THREAT_MODEL.md](docs/THREAT_MODEL.md) � [OPERATIONS_VERIFICATION.md](docs/OPERATIONS_VERIFICATION.md)

---

## Comparison

| Capability                   | KubeLens AI | Lens    | k9s     | kubectl  |
| ---------------------------- | ----------- | ------- | ------- | -------- |
| Deterministic diagnostics    | Yes         | No      | No      | No       |
| AI explanation layer         | Yes         | No      | No      | No       |
| Real-time event streaming    | Yes         | Partial | Partial | No       |
| Multi-cluster context switch | Yes         | Yes     | Yes     | Manual   |
| Built-in audit trail         | Yes         | No      | No      | No       |
| API-first automation         | Yes         | No      | No      | CLI only |

---

## Changelog

[CHANGELOG.md](CHANGELOG.md)
