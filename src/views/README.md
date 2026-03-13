# Views

This directory contains **page-level screens** (route/view feature folders).

Rules:

- Every view lives in its own folder: `src/views/<view>/index.tsx`.
- Keep `index.tsx` focused on orchestration and state wiring.
- Reusable UI blocks belong in `src/components/`.
- Keep view-private code in local folders:
  - `components/` for local presentational blocks
  - `hooks/` for view-specific hooks
  - `api/` for view-specific transport wrappers
- Avoid cross-view imports (enforced by `npm run lint:structure`).

Current views:

- `dashboard/` -> cluster overview and health KPIs
- `pods/` -> pod operations, logs, restart/delete
- `deployments/` -> deployment controls and rollout health
- `nodes/` -> node health + maintenance operations
- `events/` -> cluster event feed
- `namespaces/` -> namespace inventory
- `rbac/` -> access policy inventory
- `metrics/` -> telemetry and trend analytics
- `audit/` -> live request/action audit stream
- `predictions/` -> incident risk scoring
- `diagnostics/` -> deterministic findings and recommendations
- `opsassistant/` -> assistant Q&A with optional RAG references
- `incident/` -> incident timeline/runbook workflow
- `remediation/` -> proposal approval/execution workflow
- `memory/` -> runbook and fix-pattern memory
- `shiftbrief/` -> on-call handoff snapshot
- `playbooks/` -> curated operational response guides
- `riskguard/` -> manifest risk analysis
- `postmortem/` -> generated postmortems
- `resourcecatalog/` -> generic view for remaining Kubernetes resource kinds
