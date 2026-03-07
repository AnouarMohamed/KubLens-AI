# Components

This directory contains **reusable UI building blocks**.

Guidelines:

- Keep these components presentation-focused.
- Avoid page-level data orchestration here (use `src/views/`).
- Group feature-specific subcomponents in child folders:
  - `components/pods/*`
  - `components/nodes/*`

Examples in this folder:

- `Sidebar.tsx` -> app navigation
- `pods/PodDetailModal.tsx` -> pod detail modal
- `nodes/NodeDetailModal.tsx` -> node detail modal
