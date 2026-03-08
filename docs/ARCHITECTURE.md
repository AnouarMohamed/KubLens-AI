# Architecture

## System overview

```mermaid
flowchart TD
    Browser[" Browser\nReact + Vite"] -->|HTTP / SSE| MW

    subgraph API ["Go API Server"]
        MW["Auth · Rate Limit · Audit"] --> Handlers["Route Handlers"]
        Handlers --> Cluster["Cluster Service"]
        Handlers --> Diag["Diagnostics Engine"]
        Handlers --> Pred["Predictor Client"]
        Handlers --> Asst["Assistant"]
        Handlers --> RAG["Docs RAG"]
    end

    Cluster -->|kubectl API| K8S["Kubernetes API"]
    Cluster -->|metrics.k8s.io| Metrics["Metrics Server"]
    Pred -->|POST /predict| FastAPI["FastAPI Predictor"]
    Asst -->|OpenAI-compatible| LLM["AI Provider\n(optional)"]
    RAG -->|fetch| Docs["K8s / Docker Docs"]
```

## Auth and write gate

```mermaid
flowchart LR
    Req["Request"] --> AuthCheck{"Auth\nenabled?"}
    AuthCheck -->|No| Anon["Anonymous\npermissions"]
    AuthCheck -->|Yes| Token{"Valid\ntoken?"}
    Token -->|No| E401["401"]
    Token -->|Yes| Role["Assign role\nviewer · operator · admin"]
    Anon --> MutCheck{"Mutating\nrequest?"}
    Role --> MutCheck
    MutCheck -->|No| Handle["Handle"]
    MutCheck -->|Yes| Gate{"WRITE_ACTIONS\n_ENABLED?"}
    Gate -->|No| E403["403"]
    Gate -->|Yes| RoleCheck{"Role\nallows writes?"}
    RoleCheck -->|No| E403
    RoleCheck -->|Yes| Audit["Audit log"] --> Handle
```

## Kubernetes deployment topology

```mermaid
flowchart TD
    subgraph NS ["namespace: kubelens"]
        Ingress["Ingress / TLS"] --> SVC["Service :3000"]
        SVC --> POD["Dashboard Pod\nGo API + React dist"]
        SVC2["Service :8001"] --> PRED["Predictor Pod\nFastAPI"]
        POD -->|internal| PRED

        HPA["HPA"] -.->|scales| POD
        PDB["PDB"] -.->|protects| POD
        NP["NetworkPolicy\ndefault-deny"] -.->|governs| POD
        NP -.->|governs| PRED
    end

    POD -->|"ClusterRole: get list watch"| K8S["Kubernetes API"]
    POD -->|Secret ref| SEC[" Auth tokens · Kubeconfig"]
```

## Components

- `src/` — React frontend, feature-oriented view folders
- `backend/` — Go API + Kubernetes integrations
- `predictor/` — FastAPI risk scoring service
- `k8s/` — Kustomize base + dev/demo/prod overlays

## Backend boundaries

- `internal/cluster` — Kubernetes data reads and operational commands
- `internal/diagnostics` — rule-based analysis engine + narrative formatting
- `internal/httpapi` — transport layer, auth/audit/rate-limit middleware, route handlers
- `internal/rag` — Kubernetes + Docker docs retrieval for assistant grounding
- `internal/config` — runtime config parsing + validation
- `internal/bootstrap` — dependency assembly and server construction

## Request flow

1. UI calls `/api/*`
2. Middleware enforces auth, rate limit, audit, and policy gates
3. Handlers call cluster/diagnostics/prediction/assistant services
4. Results return as typed JSON to feature views

## Mutating action safety flow

1. Route-level role requirement (`viewer` / `operator` / `admin`)
2. Global write gate (`WRITE_ACTIONS_ENABLED`)
3. Audit event persisted with actor + route + outcome

## Operational endpoints

| Endpoint                  | Description                                     |
| ------------------------- | ----------------------------------------------- |
| `/api/healthz`            | Liveness signal                                 |
| `/api/readyz`             | Readiness + dependency checks — 503 if degraded |
| `/api/metrics`            | JSON request telemetry                          |
| `/api/metrics/prometheus` | Prometheus exposition format                    |
| `/api/openapi.yaml`       | Published API contract                          |
