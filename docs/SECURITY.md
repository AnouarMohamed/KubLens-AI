# Security And Trust Boundaries

## Trust boundaries

- Browser UI is untrusted input.
- Backend API is policy enforcement boundary.
- Kubernetes API credentials are high-trust secrets.
- External integrations (AI provider, alert webhooks) are network trust boundaries.

## Enforced controls

- Bearer token auth with role-based permissions
- Global write-action feature gate
- Terminal execution off by default, admin-only when enabled
- Terminal requires global write enablement and admin role when enabled
- Terminal deny/allow policy + timeout + output cap
- Per-route audit logging with actor attribution
- Request rate limiting

## Deployment controls

- ServiceAccounts + explicit ClusterRole bindings
- NetworkPolicy defaults deny and explicit allow paths
- Pod security context (non-root, no privilege escalation, dropped caps)
- PDB + HPA included for runtime resilience

## Operational recommendations

- Use `prod` overlay with real secrets and managed ingress/TLS
- Keep write actions disabled unless operationally required
- Rotate auth tokens and avoid static long-lived credentials
- Restrict network egress beyond provided defaults where possible

See also:

- `docs/THREAT_MODEL.md`
- `docs/OPERATIONS_VERIFICATION.md`
