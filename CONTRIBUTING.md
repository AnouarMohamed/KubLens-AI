# Contributing

## Local setup

```bash
npm install
```

## Start app

```bash
npm run dev
```

## Quality gates (run before PR)

```bash
npm run lint
npm run test:go
npm run test:web
npm run test:predictor
npm run verify:docs
npm run build
```

## Structure conventions

- Frontend views live in `src/views/<feature>/index.tsx`
- Keep cross-view imports out of feature internals
- Keep `src/App.tsx` composition-only
- Backend entrypoint logic belongs in `internal/config` and `internal/bootstrap`
- HTTP handlers should stay transport-thin and delegate logic to domain services

## Commit discipline

- Keep commits focused by subsystem
- Add or update tests for security-sensitive changes
- Update docs when behavior or configuration changes
- Keep `docs/FEATURES.md` in sync when adding or changing user-facing features
- Ensure `npm run verify:docs` passes before merge

## Security and release controls

- Security-sensitive transport/auth changes must include regression tests.
- Production release artifacts must follow signed-release and SBOM policy in `docs/SUPPLY_CHAIN_POLICY.md`.
- Secrets must be rotated and documented per `docs/SECRET_ROTATION_RUNBOOK.md`.
- Documentation updates and review cadence are governed by `docs/DOCUMENTATION_GOVERNANCE.md`.
