# Kubernetes Operations Dashboard

A full-stack Kubernetes dashboard for daily ops work:

- React + Vite frontend (`src/`)
- Go API backend (`backend/`)
- Real cluster mode via `client-go` + `metrics.k8s.io`
- Deterministic mock fallback when no kubeconfig is provided
- Built-in terminal execution endpoint for cluster diagnostics

## What Is Working

- Live pods, nodes, namespaces, events, resource catalog, and diagnostics
- Real pod and node usage (CPU/memory) when Metrics Server is installed
- Cluster stats API computed from real node usage in live mode
- Assistant panel with deterministic fallback behavior
- Terminal screen in black console style for operational commands

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Start app (API + frontend):
```bash
npm run dev
```

3. Open:
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000`

## Enable Real Cluster + Real Metrics

1. Ensure your Kubernetes cluster has Metrics Server:
```bash
kubectl get apiservices | grep metrics.k8s.io
```

2. Base64-encode kubeconfig and set `KUBECONFIG_DATA`.

PowerShell:
```powershell
$bytes = [System.IO.File]::ReadAllBytes("$HOME\.kube\config")
$env:KUBECONFIG_DATA = [Convert]::ToBase64String($bytes)
npm run dev
```

3. Verify:
- `GET /api/cluster-info` => `isRealCluster: true`
- `GET /api/nodes` => `cpuUsage` and `memUsage` no longer `N/A`
- `GET /api/pods` => `cpu` and `memory` populated from metrics API

If Metrics Server is missing or blocked by RBAC, the app still runs, but usage fields remain `N/A`.

## Run Modes

- `npm run dev`: frontend + backend in dev mode
- `npm run start`: run backend only (serves built frontend from `dist/` if present)
- `npm run build`: build frontend
- `npm run test:go`: run backend tests

## Environment Variables

- `KUBECONFIG_DATA`: base64 kubeconfig payload
- `PORT`: backend port (default `3000`)
- `DIST_DIR`: static files dir (default `dist`)
- `ASSISTANT_PROVIDER`: `none` or `openai_compatible`
- `ASSISTANT_TIMEOUT_SECONDS`: provider timeout
- `ASSISTANT_API_BASE_URL`: OpenAI-compatible endpoint
- `ASSISTANT_API_KEY`: API key
- `ASSISTANT_MODEL`: model id
- `ASSISTANT_TEMPERATURE`: optional float
- `ASSISTANT_MAX_TOKENS`: optional int

## Screenshots

Use the [`screenshots`](./screenshots) folder for UI captures.  
Guidance and naming conventions are in [`screenshots/README.md`](./screenshots/README.md).

## Additional Docs

- Run + usage guide: [RUN_AND_USE.md](./RUN_AND_USE.md)
