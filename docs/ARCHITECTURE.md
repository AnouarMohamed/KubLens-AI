# Architecture

## System overview

```mermaid
flowchart TD
    Browser["Browser\nReact + Vite"] -->|HTTP / WebSocket| MW

    subgraph API ["Go API Server"]
        MW["Auth � Rate Limit � Audit"] --> Handlers["Route Handlers"]
        Handlers --> Cache["Cluster State Cache"]
        Cache --> Intel["Intelligence Engine"]
        Intel --> Plugins["Diagnostic Plugins"]
        Handlers --> Pred["Predictor Client"]
        Handlers --> Asst["Assistant"]
        Handlers --> RAG["Docs RAG"]
        Cache --> Bus["Event Bus"]
        Bus --> Stream["WebSocket/SSE"]
    end

    Cache -->|kubectl API| K8S["Kubernetes API"]
    Cache -->|metrics.k8s.io| Metrics["Metrics Server"]
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
    Token -->|Yes| Role["Assign role\nviewer � operator � admin"]
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
    POD -->|Secret ref| SEC["Auth tokens � Kubeconfig"]
```

## Components

- `src/` - React frontend, feature-oriented view folders
- `backend/` - Go API + Kubernetes integrations
- `predictor/` - FastAPI risk scoring service
- `k8s/` - Kustomize base + overlays (dev/demo/prod/tracing/observability)
- `helm/` - Helm chart for deployment

## Backend boundaries

- `internal/auth` - JWT/OIDC validation, roles, and request principals
- `internal/cluster` - Kubernetes data reads and operational commands
- `internal/state` - informer-backed cluster cache
- `internal/intelligence` - deterministic diagnostics + scoring
- `internal/diagnostics` - health scoring + narrative formatting
- `internal/events` - in-process event bus
- `internal/httpapi` - transport layer, auth/audit/rate-limit middleware, route handlers
- `internal/rag` - Kubernetes + Docker docs retrieval for assistant grounding
- `internal/config` - runtime config parsing + validation
- `internal/bootstrap` - dependency assembly and server construction

## Request flow

1. UI calls `/api/*`
2. Middleware enforces auth, rate limit, audit, and policy gates
3. Handlers read cached cluster state, run diagnostics/plugins, or call predictor
4. Results return as typed JSON to feature views

## Event streaming flow

1. Informers update the cluster cache
2. Cache emits events to the in-process bus
3. WebSocket/SSE stream publishes updates
4. UI refreshes views in near-real time

## Operational endpoints

| Endpoint                  | Description                                     |
| ------------------------- | ----------------------------------------------- |
| `/api/healthz`            | Liveness signal                                 |
| `/api/readyz`             | Readiness + dependency checks - 503 if degraded |
| `/api/metrics`            | JSON request telemetry                          |
| `/api/metrics/prometheus` | Prometheus exposition format                    |
| `/api/openapi.yaml`       | Published API contract                          |
