# Kubernetes Operations Dashboard

## Academic Project Statement

In this academic project, I designed and implemented a full-stack Kubernetes Operations Dashboard focused on observability, diagnostics, and operator productivity.  
My objective was to produce a practical system that can run in two modes:

1. Live mode against a real Kubernetes cluster.
2. Deterministic mock mode for reproducible testing and demonstrations.

This project combines:

- A React + Vite frontend for operational workflows.
- A Go backend API for Kubernetes integration and diagnostics.
- A Python FastAPI predictor microservice for incident-risk inference.
- A lightweight assistant layer with deterministic fallback.
- A terminal execution endpoint for controlled runtime commands.

## Abstract

I built this platform to study how cluster data can be transformed into actionable operator insights.  
Instead of showing raw Kubernetes objects only, the system computes summaries, health signals, and prioritized recommendations.  
The application also exposes structured API metrics and supports real pod/node usage collection via `metrics.k8s.io`.

## Core Features

- Cluster overview with health indicators and issue prioritization.
- Resource management views for pods, nodes, deployments, services, and more.
- Diagnostics engine with severity-based findings and recommendations.
- Predictive Incidents view with risk scoring and confidence by resource.
- Assistant interface for operational Q&A with deterministic fallback.
- Integrated black-themed terminal UI for direct command execution.
- Real usage metrics (CPU/memory) for pods and nodes when Metrics Server is available.
- Mock fallback mode when kubeconfig is missing or invalid.

## Architecture

### Frontend

- Framework: React + TypeScript + Vite
- Location: `src/`
- Responsibility: UI composition, feature views, and typed API integration

### Backend

- Language: Go
- HTTP stack: `net/http` + `chi`
- Location: `backend/`
- Responsibility: Kubernetes connectivity, diagnostics logic, assistant orchestration, and transport APIs

### Predictor Service

- Language: Python
- Framework: FastAPI
- Location: `predictor/`
- Responsibility: infer incident risk for pods/nodes and return ranked predictions to the Go API

### Kubernetes Integration

- Primary SDK: `client-go`
- Metrics SDK: `k8s.io/metrics`
- Real usage path:
  - Pod usage from `metrics.k8s.io` pod metrics.
  - Node usage from `metrics.k8s.io` node metrics.
  - Cluster CPU/memory derived from aggregated node usage percentages.

## Methodology and Design Decisions

I made the following engineering decisions to keep the system maintainable:

- Separated domain logic by concern (`cluster`, `diagnostics`, `httpapi`, `ai`).
- Implemented short-lived backend caching to reduce API pressure.
- Added deterministic mock stores so the project remains runnable without infrastructure dependencies.
- Chose explicit typed models between backend and frontend for contract stability.
- Preserved deterministic assistant behavior when external providers fail.

## Project Structure

```text
.
+-- backend/
|   +-- cmd/server/
|   +-- internal/
|       +-- ai/
|       +-- apperrors/
|       +-- cluster/
|       +-- diagnostics/
|       +-- httpapi/
|       +-- model/
+-- src/
|   +-- components/
|   +-- features/
|   +-- lib/
|   +-- types.ts
+-- k8s/
|   +-- namespace.yaml
|   +-- configmap.yaml
|   +-- deployment.yaml
|   +-- service.yaml
|   +-- predictor-deployment.yaml
|   +-- predictor-service.yaml
|   +-- secret.example.yaml
|   +-- kustomization.yaml
+-- predictor/
|   +-- app/main.py
|   +-- requirements.txt
|   +-- Dockerfile
+-- Dockerfile
+-- docker-compose.yml
+-- RUN_AND_USE.md
+-- README.md
```

## Local Development

### Prerequisites

- Node.js 20+
- Go 1.25+

### Install

```bash
npm install
```

### Run (frontend + backend)

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`

### Useful Commands

- `npm run test:go` -> run backend tests
- `npm run lint` -> TypeScript type-check
- `npm run build` -> build frontend
- `npm run start` -> run backend server

## Live Cluster Setup

The backend expects a base64 kubeconfig payload in `KUBECONFIG_DATA`.

PowerShell:

```powershell
$bytes = [System.IO.File]::ReadAllBytes("$HOME\.kube\config")
$env:KUBECONFIG_DATA = [Convert]::ToBase64String($bytes)
```

Then start:

```bash
npm run dev
```

## Real Metrics Requirements

To populate pod/node usage from real data, the cluster must expose:

- `metrics.k8s.io` API (typically via Metrics Server)

Validation:

```bash
kubectl get apiservices | grep metrics.k8s.io
```

If metrics are unavailable, the app remains functional and shows `N/A` for usage fields.

## Full Dockerization

This project is fully containerized:

1. Main application image (Node build stage + Go build stage + Alpine runtime).
2. Python predictor image (FastAPI + uvicorn).
3. Unified orchestration through `docker-compose.yml`.

### Build image

```bash
npm run docker:build
```

### Run container

```bash
npm run docker:run
```

Open:

- `http://localhost:3000`

### Run with Docker Compose

```bash
npm run docker:up
```

Stop:

```bash
npm run docker:down
```

Compose reads variables from your shell or `.env` file.

## Kubernetes Deployment Manifests

To make this repository complete for cluster deployment, I included first-class manifests in `k8s/`.

### Included resources

- `k8s/namespace.yaml`
- `k8s/configmap.yaml`
- `k8s/deployment.yaml`
- `k8s/service.yaml`
- `k8s/predictor-deployment.yaml`
- `k8s/predictor-service.yaml`
- `k8s/secret.example.yaml`
- `k8s/kustomization.yaml`

### Deploy workflow

1. Build and publish images:
   - `docker build -t <registry>/kubernetes-operations-dashboard:<tag> .`
   - `docker build -t <registry>/k8s-ops-predictor:<tag> ./predictor`
   - `docker push <registry>/kubernetes-operations-dashboard:<tag>`
   - `docker push <registry>/k8s-ops-predictor:<tag>`
2. Update image fields in:
   - `k8s/deployment.yaml`
   - `k8s/predictor-deployment.yaml`
3. Create a real secret file from template:
   - `cp k8s/secret.example.yaml k8s/secret.yaml`
   - set `KUBECONFIG_DATA` and optional `ASSISTANT_API_KEY`
   - `kubectl apply -f k8s/secret.yaml`
4. Apply manifests:
   - `kubectl apply -k k8s/`
5. Validate:
   - `kubectl -n kubernetes-operations-dashboard get pods,svc`

### Access the dashboard

```bash
kubectl -n kubernetes-operations-dashboard port-forward svc/kubernetes-operations-dashboard 3000:80
```

Then open `http://localhost:3000`.

## Environment Variables

- `KUBECONFIG_DATA`: base64 kubeconfig payload
- `PORT`: backend port (`3000` by default)
- `DIST_DIR`: static assets directory (`dist` by default)
- `PREDICTOR_BASE_URL`: predictor endpoint (for example `http://k8s-ops-predictor:8001`)
- `PREDICTOR_TIMEOUT_SECONDS`: predictor request timeout
- `ASSISTANT_PROVIDER`: `none` or `openai_compatible`
- `ASSISTANT_TIMEOUT_SECONDS`: assistant timeout
- `ASSISTANT_API_BASE_URL`: provider base URL
- `ASSISTANT_API_KEY`: API key
- `ASSISTANT_MODEL`: model id
- `ASSISTANT_TEMPERATURE`: generation temperature
- `ASSISTANT_MAX_TOKENS`: output token cap

## API Verification

```bash
curl http://localhost:3000/api/cluster-info
curl http://localhost:3000/api/stats
curl http://localhost:3000/api/pods
curl http://localhost:3000/api/nodes
curl http://localhost:3000/api/diagnostics
curl http://localhost:3000/api/predictions
```

## Screenshots

I keep image assets under [`screenshots`](./screenshots).  
Conventions are documented in [`screenshots/README.md`](./screenshots/README.md).

## Additional Documentation

- Detailed run guide: [RUN_AND_USE.md](./RUN_AND_USE.md)

## Conclusion

Through this project, I implemented a production-oriented Kubernetes dashboard with clear separation of concerns, reproducible execution modes, and containerized deployment support.  
The final system is designed to be demonstrable in academic settings and directly useful in practical operations workflows.
