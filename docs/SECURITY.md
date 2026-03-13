# Security And Trust Boundaries

## Trust boundaries

- Browser/UI input is untrusted.
- Backend API is the policy enforcement boundary.
- Kubernetes credentials/context payloads are high-trust secrets.
- External providers (assistant, predictor, alert channels, ChatOps) are outbound trust boundaries.

## Runtime security controls

## Auth and authorization

- Token/session authentication with explicit role mapping (`viewer`, `operator`, `admin`)
- Route-level minimum role checks
- Optional OIDC/JWT issuer + claim mapping
- `X-Auth-Token` transport disabled by default and rejected in `prod`

## Write safety

- Global write gate: mutating cluster actions require `WRITE_ACTIONS_ENABLED=true`
- Mutating routes still require authorized role (`operator`/`admin`)
- In `prod`, remediation execution enforces four-eyes separation (approver != executor)

## Request protection

- Rate limiting on `/api/*`
- Same-origin CSRF checks for cookie-authenticated mutating requests
- Request timeout middleware on non-streaming paths
- Recovery middleware for panic containment

## Audit and traceability

- Per-request audit records with actor, route, status, and latency
- Action-specific audit labels for critical operations
- Optional OpenTelemetry traces for backend and predictor paths

## Deployment hardening

- Non-root containers
- Dropped Linux capabilities
- Read-only root filesystem posture in deployment overlays
- NetworkPolicy with explicit allow paths
- RBAC manifests per overlay
- PDB/HPA for availability posture

## Operational recommendations

- Use `APP_MODE=prod` with `AUTH_ENABLED=true` in shared environments.
- Keep write actions disabled unless operationally required.
- Rotate static tokens and prefer OIDC/JWT where possible.
- Restrict egress to approved integrations only.
- Review audit logs regularly and alert on suspicious write attempts.

## Related docs

- [THREAT_MODEL.md](THREAT_MODEL.md)
- [OPERATIONS_VERIFICATION.md](OPERATIONS_VERIFICATION.md)
- [api.md](api.md)
