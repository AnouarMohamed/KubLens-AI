# Architecture Overview

## Components

- `src/`: React frontend (feature-oriented view folders)
- `backend/`: Go API + Kubernetes integrations
- `predictor/`: FastAPI prediction service
- `k8s/`: base + overlay deployment manifests

## Backend boundaries

- `internal/cluster`: Kubernetes data reads and operational commands
- `internal/diagnostics`: deterministic diagnostics analysis + narrative formatting
- `internal/httpapi`: transport layer, auth/audit/rate-limit middleware, route handlers
- `internal/rag`: Kubernetes + Docker docs retrieval support
- `internal/config`: runtime config parsing + validation
- `internal/bootstrap`: dependency assembly and server construction

## Request flow

1. UI calls `/api/*`
2. API middleware enforces auth, rate limit, audit, and policy gates
3. Handlers call cluster/diagnostics/prediction/assistant services
4. Results return as typed JSON responses to feature views

## Safety flow for mutating actions

1. Route-level role requirement (`viewer`/`operator`/`admin`)
2. Global write gate (`WRITE_ACTIONS_ENABLED`)
3. Terminal-specific policy gate (`TERMINAL_*` rules)
4. Audit event persisted with actor + route + outcome
