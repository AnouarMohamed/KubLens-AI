# KubeLens AI

A full-stack Kubernetes operations dashboard for cluster visibility, diagnostics, incident prediction, and guided actions.

## What this project does
- Shows live cluster inventory: pods, nodes, workloads, networking, storage, and RBAC resources.
- Pulls real CPU/memory usage through `metrics.k8s.io` when Metrics Server is available.
- Runs diagnostics with severity-ranked findings and recommendations.
- Runs incident prediction with a Python predictor service and safe local fallback.
- Supports operator actions: pod create/restart/delete, node cordon, workload scale/restart/rollback, YAML edit/apply.

## Architecture (short)
- Frontend: React + Vite (`src/`)
- Backend API: Go + client-go (`backend/`)
- Optional predictor: FastAPI (`predictor/`)
- Deployment: Docker Compose and Kubernetes manifests (`docker-compose.yml`, `k8s/`)

## Codebase separation
This repository now enforces a clearer structure to keep it scalable.

### Frontend
- Views are isolated by feature folder: `src/views/<view>/index.tsx`
- Each view has local extension points:
  - `components/`
  - `hooks/`
  - `api/`
- Shared UI lives in `src/components/`
- Shared data/API utilities live in `src/types.ts` and `src/lib/api.ts`

### Backend
- `backend/internal/cluster/`
  - `query_*` for reads
  - `command_*` for writes/actions
  - `mapper_*` for K8s -> API model mapping
  - `service_*` for service runtime and cache
  - `support_*` for common helpers
- `backend/internal/diagnostics/`
  - `analysis_*` for diagnostics logic
  - `present_*` for output narrative formatting

## Quality gates
Local and CI checks now enforce structure and quality.

- `npm run lint`
  - TypeScript compile checks
  - Structure/import rules (`scripts/structure-lint.mjs`)
- `npm run test:go`
- `npm run build`

CI workflow:
- `.github/workflows/ci.yml`
- Runs on push and pull requests

## Quick start (mock mode)
Use this when you do not want to connect to a real cluster.

```bash
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`

If `KUBECONFIG_DATA` is missing, backend falls back to deterministic mock data.

## Run with real cluster + real metrics
1. Confirm cluster access:
```bash
kubectl cluster-info
kubectl get nodes
```

2. Confirm Metrics Server is available:
```bash
kubectl top nodes
kubectl top pods -A
```

3. Set `KUBECONFIG_DATA`.

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

## Predictor service (optional)
Run the predictor in Docker:

```bash
npm run docker:build:predictor
npm run docker:run:predictor
```

Then set backend env:
- `PREDICTOR_URL=http://localhost:8001/predict`

## Docker
Run full stack with compose:

```bash
npm run docker:up
npm run docker:down
```

## Kubernetes deployment
Use the manifests in `k8s/`:

```bash
kubectl apply -k k8s
```

See details:
- `k8s/README.md`
- `RUN_AND_USE.md`

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

## Notes
- If predictions return 404, restart backend and confirm you are running the latest code.
- If CPU/memory show `N/A`, verify Metrics Server and `kubectl top` first.
