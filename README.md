# KubeLens AI

KubeLens AI is a full-stack Kubernetes operations dashboard designed for two workflows:

- fast local evaluation with deterministic mock data
- controlled live-cluster operations with explicit security gates

It combines inventory, diagnostics, predictions, assistant guidance, audit history, and operator actions under one UI.

## What is implemented today

- Live or mock cluster inventory across workloads, networking, storage, access, and events
- Metrics integration (`metrics.k8s.io`) when Metrics Server is available
- Diagnostics engine (rule-based risk scoring + recommendations)
- Predictor service (FastAPI) with backend fallback behavior
- Assistant with deterministic flow + optional provider + docs RAG grounding
- Role-based auth session, audit trail, rate limiting, and terminal policy controls
- Multi-cluster selection (`/api/clusters`, `/api/clusters/select`)
- Kubernetes deployment base + `dev`/`demo`/`prod` overlays with RBAC, NetworkPolicy, PDB, HPA

## Safety model (important)

Secure defaults are now enforced:

- `APP_MODE` defaults to `demo`
- `WRITE_ACTIONS_ENABLED=false` by default
- `TERMINAL_ENABLED=false` by default
- no fallback auth tokens unless `DEV_MODE=true`
- `prod` mode requires auth and explicit tokens

When running in `dev`/`demo` or insecure combinations, the UI shows a warning banner and capability state.

## Mode matrix

| Mode   | Intended use               | Auth default | Write actions | Terminal |
| ------ | -------------------------- | ------------ | ------------- | -------- |
| `dev`  | local engineering          | off          | off           | off      |
| `demo` | safe showcase/read-focused | off          | off           | off      |
| `prod` | controlled operations      | on           | off           | off      |

Notes:

- writes and terminal are opt-in in every mode.
- enabling writes/terminal without auth is rejected at startup.

## Architecture

```mermaid
flowchart LR
  UI[React + Vite UI] --> API[Go API /api/*]
  API --> K8S[Kubernetes API]
  API --> METRICS[metrics.k8s.io]
  API --> RAG[Docs RAG Service]
  API --> AI[Optional AI Provider]
  API --> PRED[FastAPI Predictor]
  API --> AUDIT[Audit Log Store]
```

More details: [Architecture](docs/ARCHITECTURE.md)

## Run locally

### 1) Install

```bash
npm install
```

### 2) Start in default demo mode (safe)

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`

In this mode:

- data can be mock if no kubeconfig is supplied
- mutating actions and terminal are blocked unless explicitly enabled

## Run with a real cluster + real metrics

### 1) Verify cluster connectivity

```bash
kubectl cluster-info
kubectl get nodes
```

### 2) Verify metrics pipeline

```bash
kubectl top nodes
kubectl top pods -A
```

### 3) Provide kubeconfig payload

PowerShell:

```powershell
$bytes = [System.IO.File]::ReadAllBytes("$HOME\.kube\config")
$env:KUBECONFIG_DATA = [Convert]::ToBase64String($bytes)
npm run dev
```

Bash:

```bash
export KUBECONFIG_DATA=$(base64 -w 0 ~/.kube/config)
npm run dev
```

## Auth and RBAC

### Token format

`AUTH_TOKENS` uses:

```text
user:role:token,user:role:token
```

Example:

```text
viewer:viewer:token1,operator:operator:token2,admin:admin:token3
```

### Roles

- `viewer`: read-only + assistant/stream
- `operator`: viewer + write actions (if globally enabled)
- `admin`: operator + terminal (if enabled)

## Terminal policy

When terminal is enabled, command execution is constrained by:

- allow prefixes (`TERMINAL_ALLOWED_PREFIXES`)
- deny prefixes (`TERMINAL_DENIED_PREFIXES`)
- kubectl verb allowlist (`TERMINAL_KUBECTL_ALLOWED_VERBS`)
- forbidden shell operators
- command timeout cap
- output size cap (`TERMINAL_MAX_OUTPUT_BYTES`)

## Predictor service

The predictor is a first-class service (`predictor/`):

- contract-based FastAPI endpoint: `POST /predict`
- input validation via Pydantic
- tests for valid/invalid requests
- backend fallback path if predictor is unavailable

Run predictor locally:

```bash
npm run docker:build:predictor
npm run docker:run:predictor
```

Set backend endpoint:

```text
PREDICTOR_BASE_URL=http://localhost:8001
```

## Docker

```bash
npm run docker:up
npm run docker:down
```

## Kubernetes deployment

Overlay-based deploy:

```bash
kubectl apply -k k8s/overlays/dev
kubectl apply -k k8s/overlays/demo
kubectl apply -k k8s/overlays/prod
```

Default root target:

```bash
kubectl apply -k k8s
```

Details: [k8s/README.md](k8s/README.md)

## Quality gates

```bash
npm run lint
npm run test:go
npm run test:web
npm run test:predictor
npm run build
```

CI validates:

- frontend lint/tests/build
- backend tests + gofmt check
- predictor lint/tests
- Docker builds (dashboard + predictor)
- kustomize + manifest schema validation

## Troubleshooting

- `404` on predictions:
  - verify backend is running latest code
  - verify predictor URL and service health (`/healthz`)
- CPU/memory as `N/A`:
  - metrics server likely unavailable; validate with `kubectl top`
- `403` for writes or terminal:
  - expected unless both role and global feature flags allow it
- Auth in prod fails on startup:
  - set `AUTH_ENABLED=true` and provide `AUTH_TOKENS` (or secret in k8s)

## Screenshots

![Screenshot 1](screenshots/Screenshot%202026-03-07%20133914.png)
![Screenshot 2](screenshots/Screenshot%202026-03-07%20133928.png)
![Screenshot 3](screenshots/Screenshot%202026-03-07%20134004.png)
![Screenshot 4](screenshots/Screenshot%202026-03-07%20134029.png)
![Screenshot 5](screenshots/Screenshot%202026-03-07%20134040.png)
![Screenshot 6](screenshots/Screenshot%202026-03-07%20134107.png)
![Screenshot 7](screenshots/Screenshot%202026-03-07%20134152.png)
![Screenshot 8](screenshots/Screenshot%202026-03-07%20134252.png)
![Screenshot 9](screenshots/Screenshot%202026-03-07%20134328.png)
![Screenshot 10](screenshots/Screenshot%202026-03-07%20134342.png)
![Screenshot 11](screenshots/Screenshot%202026-03-07%20134356.png)
![Screenshot 12](screenshots/Screenshot%202026-03-07%20134415.png)
![Screenshot 13](screenshots/Screenshot%202026-03-07%20134428.png)
![Screenshot 14](screenshots/Screenshot%202026-03-07%20134458.png)
