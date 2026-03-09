# Threat Model

This document defines high-risk attack paths for KubeLens AI and the explicit controls that block them.

## Scope

- Frontend (`src/`)
- Backend API and middleware (`backend/internal/httpapi`)
- Cluster command/data integration (`backend/internal/cluster`)
- Optional integrations (assistant provider, predictor, alert webhooks)

## Assets

- Kubernetes credentials (`KUBECONFIG_DATA`, context payloads)
- Cluster state and resource manifests
- Operator actions (restart, delete, scale, rollback)
- Audit trail integrity
- Runtime auth/session state

## Trust boundaries

1. Browser client -> backend API (`/api/*`)
2. Backend -> Kubernetes API
3. Backend -> external integrations (AI, predictor, alert channels)

## Abuse cases and controls

| Threat                                 | Primary Risk                                | Control                                                                         |
| -------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------- |
| Missing/invalid auth token             | Unauthorized reads/writes                   | `authMiddleware` requires token when auth is enabled                            |
| Privilege escalation via role misuse   | Viewer/operator performing admin operations | Route-level role gates in `requiredRole()`                                      |
| CSRF on cookie-auth writes             | Cross-site mutating requests                | Same-origin `Origin`/`Referer` check for cookie-auth mutating methods           |
| Header token replay/sprawl             | Weak non-standard token transport           | `X-Auth-Token` disabled by default; hard-failed in prod config                  |
| Write action misuse                    | High-impact resource mutation               | Global `WRITE_ACTIONS_ENABLED` gate + role checks                               |
| Rate-limit bypass via source variation | API resource exhaustion                     | Per-IP limiter keying on canonicalized host (ignores source port)               |
| Audit poisoning/leakage                | Forensics loss or secret exposure           | Structured audit entries, sanitized client IP/path fields, no token persistence |

## Explicit non-goals (current release)

- No interactive OAuth browser login flows yet (JWT/OIDC bearer validation is supported)
- No hardware-backed secret management in local mode
- No signed audit log chain/tamper-evidence yet

## Verification references

- `backend/internal/httpapi/security_test.go`
- `backend/internal/httpapi/auth_audit_test.go`
- `backend/internal/httpapi/contract_test.go`
- `docs/OPERATIONS_VERIFICATION.md`
