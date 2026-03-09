# Run And Use Guide

## 1) Install

```bash
npm install
```

## 2) Start (default safe demo mode)

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`

Default behavior:

- `APP_MODE=demo`
- read-focused permissions
- write actions disabled

## 3) Live cluster mode

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

## 4) Real metrics

The dashboard uses `metrics.k8s.io` when available.

Check:

```bash
kubectl top nodes
kubectl top pods -A
```

## 5) Enable protected operations

Example (local dev):

```text
APP_MODE=dev
DEV_MODE=true
AUTH_ENABLED=true
WRITE_ACTIONS_ENABLED=true
```

For production, keep `DEV_MODE=false` and set explicit `AUTH_TOKENS`.

## 6) Predictor service

```bash
npm run docker:build:predictor
npm run docker:run:predictor
```

Set:

```text
PREDICTOR_BASE_URL=http://localhost:8001
PREDICTOR_SHARED_SECRET=your-shared-secret
```

## 7) Ops assistant (optional)

### Enable semantic RAG (recommended)

Install Ollama and pull both chat + embedding models:

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text
ollama pull llama3.2
```

Set environment values:

```text
ASSISTANT_PROVIDER=openai_compatible
ASSISTANT_API_BASE_URL=http://localhost:11434/v1
ASSISTANT_MODEL=llama3.2
ASSISTANT_API_KEY=ollama
ASSISTANT_RAG_ENABLED=true
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

Behavior:

- Without `OLLAMA_BASE_URL`, assistant documentation retrieval falls back to keyword matching.
- Without `ASSISTANT_PROVIDER`, assistant Q&A is disabled, but deterministic diagnostics still run.

## 8) Docker compose

```bash
npm run docker:up
npm run docker:down
```

## 9) Kubernetes overlays

```bash
kubectl apply -k k8s/overlays/dev
kubectl apply -k k8s/overlays/demo
kubectl apply -k k8s/overlays/prod
```

## 10) Tracing (optional)

Set OTLP exporter env vars (local or deployment):

```text
OTEL_EXPORTER_OTLP_ENDPOINT=host:port
OTEL_EXPORTER_OTLP_PROTOCOL=grpc
OTEL_EXPORTER_OTLP_INSECURE=true
OTEL_SERVICE_NAME=kubelens-backend
OTEL_PREDICTOR_SERVICE_NAME=kubelens-predictor
OTEL_TRACES_SAMPLE_RATIO=1
```

Kubernetes tracing overlay (includes Jaeger):

```bash
kubectl apply -k k8s/overlays/tracing
kubectl -n kubernetes-operations-dashboard port-forward svc/k8s-ops-jaeger 16686:16686
```

## 11) Troubleshooting

- `403` on write endpoints: role or global feature gate is blocking
- `N/A` metrics: Metrics Server missing/unhealthy
- predictions fallback source: predictor unavailable
- startup error in prod mode: missing `AUTH_TOKENS` with `AUTH_ENABLED=true`

## 12) Operational endpoints

- Liveness: `GET /api/healthz`
- Readiness with dependency checks: `GET /api/readyz`
- OpenAPI contract: `GET /api/openapi.yaml`
- Prometheus metrics export: `GET /api/metrics/prometheus`
- Pod logs (tail): `GET /api/pods/{namespace}/{name}/logs?lines=50&container=name`
