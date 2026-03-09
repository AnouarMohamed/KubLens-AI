# Backend Internal Modules

`backend/internal` is organized by domain and responsibility:

- `ai/` -> assistant provider interfaces + implementations
- `apperrors/` -> shared sentinel/domain errors
- `auth/` -> JWT/OIDC auth, roles, and request principal handling
- `cluster/` -> Kubernetes data access, mapping, and actions
- `config/` -> env parsing, mode defaults, and startup validation
- `bootstrap/` -> dependency assembly and server construction
- `diagnostics/` -> health scoring + issue inference
- `events/` -> in-process event bus for streaming updates
- `httpapi/` -> HTTP handlers, routing, transport concerns
- `intelligence/` -> deterministic diagnostic engine and scoring
- `model/` -> canonical backend API models
- `rag/` -> documentation retrieval and grounding for assistant responses
- `state/` -> informer-backed cluster cache

Navigation tips:

- Start at `cmd/server/main.go` for runtime wiring.
- Follow request flow in `internal/httpapi/server.go`.
- Core Kubernetes interactions are in `internal/cluster/`.

Use-case file conventions:

- `cluster/`
  - `query_*` -> read/list/detail operations
  - `command_*` -> mutating actions
  - `mapper_*` -> model mapping logic
  - `service_*` -> service lifecycle/cache/runtime wiring
  - `support_*` -> shared utility helpers
- `diagnostics/`
  - `analysis_*` -> diagnosis and scoring engine logic
  - `present_*` -> narrative/output formatting
