# KubeLens AI

KubeLens AI is a Kubernetes operations dashboard built for two realities:
- quick local demos with deterministic mock data
- real cluster operations with live Kubernetes + metrics APIs

It combines observability, diagnostics, predictions, assistant guidance, and safe operational actions in one interface.

## What you get
- Cluster inventory: pods, nodes, workloads, networking, storage, RBAC
- Real-time usage: CPU and memory (when `metrics.k8s.io` is available)
- Diagnostics engine: deterministic issue scoring and recommendations
- Predictions engine: Python predictor service with local fallback
- Ops actions: create/restart/delete pod, cordon node, scale/restart/rollback workloads, edit/apply YAML
- In-app terminal execution with timeout and output capture

## How the system works
- Frontend: React + Vite (`src/`)
- Backend: Go + client-go (`backend/`)
- Optional ML service: FastAPI predictor (`predictor/`)

Request flow:
1. UI calls `/api/*`
2. Backend reads cluster state from Kubernetes API
3. Backend enriches with metrics from Metrics Server
4. Diagnostics/predictions are generated
5. UI renders tables, charts, and recommendations

## Mock mode vs real mode

### Mock mode (default if no kubeconfig)
Use mock mode when you want to run and test UX/logic without cluster access.

Behavior:
- Backend starts with deterministic pod/node/resource data
- Diagnostics and predictions still work (using local rules/fallback)
- Resource actions are simulated in-memory

### Real mode (live cluster)
Use real mode when you want actual cluster data and real actions.

Behavior:
- Backend reads live objects from Kubernetes API
- CPU/memory usage comes from `metrics.k8s.io` if available
- Resource actions execute against your cluster

## Run guide

### 1) Local quick start (mock)
```bash
npm install
npm run dev
```
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`

### 2) Real cluster setup
Verify access:
```bash
kubectl cluster-info
kubectl get nodes
```

Verify metrics:
```bash
kubectl top nodes
kubectl top pods -A
```

Set kubeconfig payload.

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

### 3) Optional predictor service
```bash
npm run docker:build:predictor
npm run docker:run:predictor
```
Set:
- `PREDICTOR_URL=http://localhost:8001/predict`

### 4) Docker full stack
```bash
npm run docker:up
npm run docker:down
```

### 5) Kubernetes deployment
```bash
kubectl apply -k k8s
```
See:
- `k8s/README.md`
- `RUN_AND_USE.md`

## How key features work

### Diagnostics
- Rule-based engine (`backend/internal/diagnostics/analysis_*`)
- Scans pod/node snapshots for risk patterns (failed pod, pending pod, high restarts, not-ready node)
- Produces:
  - health score
  - severity-ranked issues
  - human-readable summary

### Predictions
- Backend endpoint: `/api/predictions`
- Tries Python predictor service first
- If predictor is unavailable, backend returns local fallback predictions
- Frontend handles legacy route fallback (`/api/predictive-incidents`) if needed

### Assistant
- Endpoint: `/api/assistant`
- Intent-based local response path (diagnose/health/manifest/priority)
- Optional AI provider enhancement if configured
- Safe fallback to deterministic answer if provider fails

### Terminal
- Endpoint: `/api/terminal/exec`
- Executes command in shell (`powershell` on Windows, `sh -lc` on Unix)
- Guardrails:
  - command required
  - max length: 2000 chars
  - timeout clamped (default 10s, max 30s)
  - captures stdout/stderr and exit code

## Error handling and troubleshooting

Common cases and what to do:
- `404` on predictions page:
  - restart backend and ensure latest API routes are running
- CPU/memory shows `N/A`:
  - Metrics Server missing or unavailable
  - check `kubectl top nodes` and `kubectl top pods -A`
- Assistant output is generic:
  - provider may be unavailable; app is using deterministic fallback
  - check provider env config and backend logs
- Terminal command fails:
  - inspect returned `stderr`, `exitCode`, and `durationMs`
  - verify working directory and command syntax

## Implementation guide (extend the project)

### Frontend structure
- Views are feature folders: `src/views/<view>/index.tsx`
- Each view can own:
  - `components/`
  - `hooks/`
  - `api/`
- Shared modules:
  - `src/components/`
  - `src/lib/api.ts`
  - `src/types.ts`

### Backend structure
- `backend/internal/cluster/`
  - `query_*` read paths
  - `command_*` write/action paths
  - `mapper_*` normalization
  - `service_*` runtime/cache setup
  - `support_*` helper utilities
- `backend/internal/diagnostics/`
  - `analysis_*` diagnosis logic
  - `present_*` narrative formatting

### Recommended workflow for a new feature
1. Add backend model in `backend/internal/model/types.go` if needed
2. Add cluster/query/command logic in matching `query_*` or `command_*` files
3. Expose endpoint in `backend/internal/httpapi/*`
4. Add typed frontend API call in `src/lib/api.ts`
5. Implement UI in `src/views/<feature>/`
6. Add tests and run quality gates

## Quality gates
- `npm run lint` (TypeScript + structure/import rules)
- `npm run test:go`
- `npm run build`

CI is configured in:
- `.github/workflows/ci.yml`

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
<img width="1572" height="912" alt="image" src="https://github.com/user-attachments/assets/5fdfd9ce-2827-429e-a9c8-d737fe94eb72" />

