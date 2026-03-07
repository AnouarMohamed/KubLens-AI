# Run And Use Guide

## 1. Install

```bash
npm install
```

## 2. Start Development

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`

## 3. Use Mock Mode (No Cluster Required)

If `KUBECONFIG_DATA` is not set, the backend serves deterministic mock data automatically.

## 4. Use Live Cluster Mode

Set `KUBECONFIG_DATA` to base64 kubeconfig contents.

PowerShell:
```powershell
$bytes = [System.IO.File]::ReadAllBytes("$HOME\.kube\config")
$env:KUBECONFIG_DATA = [Convert]::ToBase64String($bytes)
npm run dev
```

## 5. Enable Real Pod/Node Metrics

This app reads usage from `metrics.k8s.io`:

```bash
kubectl get apiservices | grep metrics.k8s.io
```

If missing, install Metrics Server in your cluster.

## 6. Main Views

- `Overview`: cluster posture and prioritized risk
- `Pods`: list, detail, events, logs, restart, delete
- `Nodes`: status, detail, cordon
- `Metrics`: circular telemetry views
- `Diagnostics`: health score and issue recommendations
- `Terminal`: execute shell commands on backend host
- `Assistant`: operator Q&A with deterministic fallback

## 7. Terminal Usage Notes

- Endpoint: `POST /api/terminal/exec`
- Timeout capped at 30 seconds
- Working directory can be provided from the UI
- Use carefully in production environments

## 8. API Checks

```bash
curl http://localhost:3000/api/cluster-info
curl http://localhost:3000/api/stats
curl http://localhost:3000/api/pods
curl http://localhost:3000/api/nodes
```

## 9. Build For Deployment

```bash
npm run build
npm run start
```

## 10. Run With Docker

Build image:

```bash
npm run docker:build
```

Run container:

```bash
npm run docker:run
```

Run with Compose:

```bash
npm run docker:up
```

Stop Compose:

```bash
npm run docker:down
```

## 11. Troubleshooting

- `isRealCluster=false`: invalid or missing `KUBECONFIG_DATA`
- Pod/node usage is `N/A`: Metrics Server unavailable or RBAC denies access
- Terminal command fails: invalid cwd, command timeout, or shell error
