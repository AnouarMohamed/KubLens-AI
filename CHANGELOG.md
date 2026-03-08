# Changelog

All notable changes to this project are documented here.

## v0.2.0

### Added

- Authentication and role-based enforcement for dashboard API flows.
- CSRF same-origin validation for cookie-authenticated mutating routes.
- API contract tests for core endpoints, mutating action payloads, and auth error shape.
- Playwright E2E coverage for dashboard smoke and auth role matrix.
- Release/version consistency checks (`verify:release`, `verify:changelog`) in CI.
- Threat model and operations verification runbook docs.
- Runtime health/readiness endpoints and Prometheus-format metrics endpoint.
- Published OpenAPI contract endpoint (`/api/openapi.yaml`) and CI contract validation (`verify:openapi`).
- Frontend AppShell coordination split into focused hooks for view access, cluster switching, and search navigation.
- Expanded frontend hook/unit coverage for runtime/auth capability gating and context switching behavior.
- Playwright performance smoke check and CI multi-browser matrix (Chromium + Firefox on CI).

### Changed

- Audit entries now sanitize client IP representation (strip source port).
- Bootstrap auth wiring now includes header-token and trusted CSRF domain controls.
- CI pipeline now includes release discipline, OpenAPI contract checks, and stronger E2E verification.
- Kubernetes liveness/readiness probes moved to dedicated health endpoints and overlay RBAC removed default `secrets` read privilege.
