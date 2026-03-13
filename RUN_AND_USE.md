# Run And Use Guide

This guide focuses on practical usage of all major product features.

## 1) Install

```bash
npm install
```

## 2) Start (default safe demo mode)

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000/api`
- Default posture: `APP_MODE=demo`, read-focused, write actions disabled.

## 3) Connect to a real cluster

Set `KUBECONFIG_DATA` from your local kubeconfig.

PowerShell:

```powershell
$bytes = [System.IO.File]::ReadAllBytes("$HOME\.kube\config")
$env:KUBECONFIG_DATA = [Convert]::ToBase64String($bytes)
npm run dev
```

Verify:

```bash
kubectl cluster-info
kubectl get nodes
```

## 4) Multi-cluster switching

Provide named contexts:

```text
KUBECONFIG_CONTEXTS=prod:<base64>,staging:<base64>
```

Then switch active context from the cluster selector in the header.

## 5) Enable protected write actions

Example local setup:

```text
APP_MODE=dev
DEV_MODE=true
AUTH_ENABLED=true
AUTH_TOKENS=viewer:viewer:viewer-token,operator:operator:operator-token,admin:admin:admin-token
WRITE_ACTIONS_ENABLED=true
```

Write operations include pod restart/delete/create, resource apply/scale/restart/rollback, node cordon/uncordon/drain, and remediation execution.

## 6) Feature walkthrough by area

### Core inventory and operations

- **Pods view**: inspect details, events, logs, streaming logs, describe output, restart/delete.
- **Nodes view**: inspect details, node pods/events, cordon/uncordon, drain preview, drain execution.
- **Resource catalog views**: deployments/replicasets/statefulsets/daemonsets/jobs/cronjobs/services/ingresses/network policies/configmaps/secrets/storage/RBAC/service accounts.

### Observability and reliability

- **Overview dashboard**: KPIs, risk rails, utilization trends, event frequency, restart hotspots.
- **Metrics view**: interactive charts and API response-class telemetry.
- **Audit Trail**: live request/action stream plus historical audit list.
- **Diagnostics**: deterministic issue detection with evidence and recommendations.
- **Predictions**: risk-scored incident candidates from current runtime signals.

### Ops workflows

- **Incidents**: create incident snapshots, update runbook step status, resolve incidents.
- **Remediation**: generate proposals, approve/reject/execute proposals.
- **Cluster Memory**: persist reusable runbooks and fix patterns.
- **Postmortems**: generate and review postmortem records.
- **Risk Guard**: analyze manifest risk before apply; high-risk apply can require force override.
- **Shift Brief**: on-call handoff summary page.
- **Playbooks**: curated response guides for common production failures.

### Assistant

- **Assistant view**: ask troubleshooting questions using deterministic context.
- Optional LLM enrichment and RAG grounding are controlled by `ASSISTANT_*` and `OLLAMA_*`/embedding settings.

For full coverage, see [docs/FEATURES.md](docs/FEATURES.md).

## 7) Predictor service (optional)

```bash
npm run docker:build:predictor
npm run docker:run:predictor
```

Set:

```text
PREDICTOR_BASE_URL=http://localhost:8001
PREDICTOR_SHARED_SECRET=your-shared-secret
```

If unavailable, backend falls back to local deterministic prediction behavior.

## 8) Assistant + RAG setup (optional)

Install Ollama and pull chat + embedding models:

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2
ollama pull nomic-embed-text
```

Set:

```text
ASSISTANT_PROVIDER=openai_compatible
ASSISTANT_API_BASE_URL=http://localhost:11434/v1
ASSISTANT_MODEL=llama3.2
ASSISTANT_API_KEY=ollama
ASSISTANT_RAG_ENABLED=true
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

## 9) Alerts and ChatOps (optional)

```text
ALERTMANAGER_WEBHOOK_URL=
SLACK_WEBHOOK_URL=
PAGERDUTY_ROUTING_KEY=

CHATOPS_SLACK_WEBHOOK_URL=
CHATOPS_NOTIFY_INCIDENTS=true
CHATOPS_NOTIFY_REMEDIATIONS=true
CHATOPS_NOTIFY_POSTMORTEMS=true
CHATOPS_NOTIFY_ASSISTANT_FINDINGS=false
```

## 10) Deploy with Docker / Kubernetes

```bash
npm run docker:up
npm run docker:down
```

```bash
kubectl apply -k k8s/overlays/dev
kubectl apply -k k8s/overlays/demo
kubectl apply -k k8s/overlays/prod
kubectl apply -k k8s/overlays/tracing
kubectl apply -k k8s/overlays/observability
```

## 11) Operational API endpoints

- Liveness: `GET /api/healthz`
- Readiness: `GET /api/readyz`
- Runtime status: `GET /api/runtime`
- OpenAPI contract: `GET /api/openapi.yaml`
- JSON telemetry: `GET /api/metrics`
- Prometheus telemetry: `GET /api/metrics/prometheus`
- Streams: `GET /api/stream` (SSE), `GET /api/stream/ws` (WebSocket)

Full route list: [docs/api.md](docs/api.md)

## 12) Troubleshooting

- `403` on writes: check role and `WRITE_ACTIONS_ENABLED=true`.
- `N/A` metrics: Metrics Server missing/unhealthy (`kubectl top nodes`).
- `401` predictor: `PREDICTOR_SHARED_SECRET` mismatch.
- Startup failure in `prod`: auth not fully configured.
- No assistant responses: verify `ASSISTANT_PROVIDER` and API key/base URL.
