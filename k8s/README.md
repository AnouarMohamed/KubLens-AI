# Kubernetes Deployment Manifests

This directory uses a **base + overlays** structure.

## Layout

- `base/`: shared resources (namespace, config, deployments, services, NetworkPolicies, PDB, HPA)
- `overlays/dev`: development profile (operator RBAC + dev config)
- `overlays/demo`: read-focused demo profile (readonly RBAC)
- `overlays/prod`: production profile (auth required + stricter defaults)
- `secret.example.yaml`: secrets template

Each overlay includes explicit RBAC manifests (`clusterrole.yaml`, `clusterrolebinding.yaml`) so `kubectl kustomize` and CI validation work with root-only load restrictions.

RBAC note:

- Overlays intentionally do not grant `secrets` read access by default.
- If secret inventory is required in your environment, extend overlay RBAC explicitly.

## Deploy

### Dev overlay

```bash
kubectl apply -k k8s/overlays/dev
```

### Demo overlay

```bash
kubectl apply -k k8s/overlays/demo
```

### Prod overlay

1. Create secret:

```bash
cp k8s/secret.example.yaml k8s/secret.yaml
# fill values, especially AUTH_TOKENS
kubectl apply -f k8s/secret.yaml
```

2. Apply overlay:

```bash
kubectl apply -k k8s/overlays/prod
```

## Validate manifests locally

```bash
kubectl kustomize k8s/overlays/dev > /dev/null
kubectl kustomize k8s/overlays/demo > /dev/null
kubectl kustomize k8s/overlays/prod > /dev/null
```

CI also validates rendered manifests with `kubeconform`.
