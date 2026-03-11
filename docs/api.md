# API Guide

KubeLens API is served under `/api` and documented formally in `backend/internal/httpapi/openapi.yaml`.

This guide provides a practical overview of endpoint groups, auth behavior, and common request patterns.

## Base URL

- Local dev: `http://localhost:3000/api`
- In-cluster: service/ingress URL + `/api`

## Authentication and authorization

KubeLens supports token and cookie-based session auth.

### Login flow

1. `POST /auth/login` with `{ "token": "<bearer-token>" }`
2. Server validates token and sets an HttpOnly session cookie.
3. Client can query `GET /auth/session` for active session state.

### Roles

- `viewer`: read/assist/stream operations
- `operator`: viewer + mutating operations (when global write gate is enabled)
- `admin`: operator + policy/admin operations

### Error model

Non-success responses use:

```json
{ "error": "message" }
```

## Endpoint groups

## System and runtime

- `GET /healthz`
- `GET /readyz`
- `GET /openapi.yaml`
- `GET /version`
- `GET /runtime`
- `GET /metrics`
- `GET /metrics/prometheus`

## Auth and session

- `GET /auth/session`
- `POST /auth/login`
- `POST /auth/logout`

## Cluster context and streaming

- `GET /clusters`
- `POST /clusters/select`
- `GET /stream` (SSE)
- `GET /stream/ws` (WebSocket)

## Core Kubernetes inventory

- `GET /namespaces`
- `GET /pods`
- `GET /pods/{namespace}/{name}`
- `GET /pods/{namespace}/{name}/events`
- `GET /pods/{namespace}/{name}/logs`
- `GET /pods/{namespace}/{name}/logs/stream`
- `GET /pods/{namespace}/{name}/describe`
- `GET /nodes`
- `GET /nodes/{name}`
- `GET /resources/{kind}`
- `GET /resources/{kind}/{namespace}/{name}/yaml`
- `GET /events`
- `GET /stats`

## Mutating cluster operations

- `POST /pods`
- `POST /pods/{namespace}/{name}/restart`
- `DELETE /pods/{namespace}/{name}`
- `POST /nodes/{name}/cordon`
- `PUT /resources/{kind}/{namespace}/{name}/yaml`
- `POST /resources/{kind}/{namespace}/{name}/scale`
- `POST /resources/{kind}/{namespace}/{name}/restart`
- `POST /resources/{kind}/{namespace}/{name}/rollback`

## Intelligence and assistant

- `GET /diagnostics`
- `GET /predictions`
- `POST /assistant`
- `POST /assistant/references/feedback`
- `GET /rag/telemetry`

## Incident and remediation workflows

- `POST /incidents`
- `GET /incidents`
- `GET /incidents/{id}`
- `PATCH /incidents/{id}/steps/{step}`
- `POST /incidents/{id}/resolve`
- `POST /incidents/{id}/postmortem`
- `GET /postmortems`
- `GET /postmortems/{id}`
- `POST /remediation/propose`
- `GET /remediation`
- `POST /remediation/{id}/approve`
- `POST /remediation/{id}/execute`
- `POST /remediation/{id}/reject`

## Memory and risk guard

- `GET /memory/runbooks`
- `POST /memory/runbooks`
- `PUT /memory/runbooks/{id}`
- `GET /memory/fixes`
- `POST /memory/fixes`
- `POST /risk-guard/analyze`

## Alerts and audit

- `POST /alerts/dispatch`
- `POST /alerts/test`
- `GET /audit`

## Example requests

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"token":"viewer-token"}'
```

### Create incident snapshot

```bash
curl -X POST http://localhost:3000/api/incidents \
  -H "Authorization: Bearer operator-token"
```

### Analyze manifest risk

```bash
curl -X POST http://localhost:3000/api/risk-guard/analyze \
  -H "Authorization: Bearer viewer-token" \
  -H "Content-Type: application/json" \
  -d '{"manifest":"apiVersion: apps/v1\nkind: Deployment\n..."}'
```

## Environment variables related to API behavior

- `APP_MODE`, `DEV_MODE`
- `AUTH_ENABLED`, `AUTH_TOKENS`, `AUTH_PROVIDER`, `AUTH_OIDC_*`
- `WRITE_ACTIONS_ENABLED`
- `RATE_LIMIT_ENABLED`, `RATE_LIMIT_REQUESTS`, `RATE_LIMIT_WINDOW_SECONDS`
- `PREDICTOR_BASE_URL`, `PREDICTOR_SHARED_SECRET`
- `ASSISTANT_PROVIDER`, `ASSISTANT_*`
- `CHATOPS_*`

## Source of truth

For exact schemas, status codes, and parameter definitions, use:

- `backend/internal/httpapi/openapi.yaml`
