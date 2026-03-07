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

## Docker
Run full stack with compose:

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
![Predictions](screenshots/Screenshot%202026-03-07%20134415.png)

## Notes
- If predictions return 404, restart backend and confirm you are running the latest code.
- If CPU/memory show `N/A`, verify Metrics Server and `kubectl top` first.
