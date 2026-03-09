# Changelog

All notable changes to this project are documented here.

## v0.3.0

### Added

- End-to-end OpenTelemetry tracing across backend API, Kubernetes client calls, and predictor service continuation.
- Tracing overlay hardening with explicit Jaeger OTLP egress policies and production overlay secretKeyRef wiring for sensitive env vars.
- Predictor telemetry startup safeguards and expanded predictor unit coverage for node scoring and metric parsing paths.

### Changed

- Dashboard and pods UI were refined into a dense terminal-forward style with sharper status signaling and safer destructive action confirmation.
- Dashboard Pod Lifecycle Mix now uses a compact deterministic bar composition with summary metrics, and restart severity thresholds are consistent across views.
- Backend request decoding now preserves detailed JSON parse failures outside prod mode while keeping production-safe generic messages.
- SSE emission, stream snapshot sizing, and route/span naming were tightened for better reliability and observability cardinality control.
- RAG index construction now fetches source documents concurrently to reduce refresh latency under slow documentation endpoints.
- CI hardening: backend tests run with `-race`, E2E has a job timeout, and Docker build job includes post-build smoke checks.
- Release metadata bumped to `v0.3.0` across package/docker/helm/k8s artifacts.

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
