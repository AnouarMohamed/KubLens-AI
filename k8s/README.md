# Kubernetes Manifests

This folder contains first-class Kubernetes deployment manifests for the dashboard.

## Files

- `namespace.yaml`: dedicated namespace
- `configmap.yaml`: non-secret runtime configuration
- `secret.example.yaml`: template for sensitive values
- `deployment.yaml`: workload definition
- `service.yaml`: ClusterIP service
- `predictor-deployment.yaml`: Python predictor microservice
- `predictor-service.yaml`: predictor internal service
- `kustomization.yaml`: apply all base resources

## Quick Deploy

1. Build and push both images, then update:
   - `deployment.yaml` (dashboard image)
   - `predictor-deployment.yaml` (predictor image)
2. Create secret from template:
   - `cp k8s/secret.example.yaml k8s/secret.yaml`
   - fill values
   - `kubectl apply -f k8s/secret.yaml`
3. Apply resources:
   - `kubectl apply -k k8s/`
4. Check status:
   - `kubectl -n kubernetes-operations-dashboard get pods,svc`

## Optional Local Access

```bash
kubectl -n kubernetes-operations-dashboard port-forward svc/kubernetes-operations-dashboard 3000:80
```
