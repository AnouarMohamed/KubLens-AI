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

- `dashboard/` -> overview page
- `pods/` -> pod operations view
- `nodes/` -> node operations view
- `metrics/` -> telemetry/analytics view
- `predictions/` -> incident forecast view
- `diagnostics/` -> issue analysis view
- `terminal/` -> shell execution view
- `opsassistant/` -> assistant workflow
- `resourcecatalog/` -> generic resource listing/actions
