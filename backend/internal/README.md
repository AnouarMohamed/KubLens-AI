# Backend Internal Modules

`backend/internal` is organized by domain and responsibility:

- `ai/` -> assistant provider interfaces + implementations
- `apperrors/` -> shared sentinel/domain errors
- `cluster/` -> Kubernetes data access, mapping, and actions
- `diagnostics/` -> health scoring + issue inference
- `httpapi/` -> HTTP handlers, routing, transport concerns
- `model/` -> canonical backend API models
- `rag/` -> documentation retrieval and grounding for assistant responses

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
