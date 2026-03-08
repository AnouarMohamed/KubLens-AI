# Changelog

All notable changes to this project are documented here.

## v0.2.0

### Added

- Authentication and role-based enforcement for dashboard API flows.
- CSRF same-origin validation for cookie-authenticated mutating routes.
- Terminal policy hardening tests for operator bypass patterns.
- API contract tests for core endpoints, mutating action payloads, and auth error shape.
- Playwright E2E coverage for dashboard smoke and auth role matrix.
- Release/version consistency checks (`verify:release`, `verify:changelog`) in CI.
- Threat model and operations verification runbook docs.

### Changed

- Audit entries now sanitize client IP representation (strip source port).
- Bootstrap auth wiring now includes header-token and trusted CSRF domain controls.
- CI pipeline now includes release discipline and stronger E2E verification.
