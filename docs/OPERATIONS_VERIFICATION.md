# Operations Verification Runbook

Use this checklist after deploys and before enabling write features in shared environments.

## 1. Runtime posture

```bash
curl -s http://localhost:3000/api/runtime | jq
```

Verify:

- `mode` is expected (`dev`/`demo`/`prod`)
- `authEnabled=true` in production
- `writeActionsEnabled` matches intended posture

## 2. Auth and role gating

1. Login as viewer token (`/api/auth/login`) and call `POST /api/pods`
   Expected: `403` with `{"error":"..."}`.
2. Login as operator token and call `POST /api/pods`
   Expected: `200` when `WRITE_ACTIONS_ENABLED=true`, else `403`.

## 3. CSRF protection for cookie-auth writes

With a valid session cookie:

- `POST /api/pods` with `Origin: https://evil.example`
  Expected: `403` (`cross-site request blocked`).
- Same request with same-origin `Origin` or valid `Referer`
  Expected: request proceeds to normal auth/validation path.

## 4. Audit trail verification

```bash
curl -s http://localhost:3000/api/audit?limit=20 | jq
```

Verify:

- Mutating actions are recorded (`pod.create`, `resource.scale`, etc.)
- `clientIp` does not include source port
- Entries do not contain bearer token values

## 5. API contract verification

Run:

```bash
npm run test:go
```

Critical contract suites:

- `TestAPIContractCoreEndpoints`
- `TestAPIContractMutatingActionResultShape`
- `TestAPIContractErrorShapeForAuthFailures`

## 6. Browser smoke verification

Run:

```bash
npm run test:e2e
```

Expected:

- Core navigation smoke passes
- Auth role matrix checks pass (viewer/operator/admin policy behavior)

## 7. Tracing verification (optional)

If OTEL export is enabled:

1. Open the Jaeger UI and select service `kubelens-backend`.
2. Trigger a prediction request (`GET /api/predictions`).
3. Verify the trace shows browser → API → k8s client → predictor as a single timeline.
