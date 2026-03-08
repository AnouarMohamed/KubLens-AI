from __future__ import annotations

import os
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field

api = FastAPI(title="k8s-ops-predictor", version="1.0.0")


class PodSummary(BaseModel):
    id: str
    name: str
    namespace: str
    status: str
    cpu: str
    memory: str
    age: str
    restarts: int


class NodeSummary(BaseModel):
    name: str
    status: str
    roles: str
    age: str
    version: str
    cpuUsage: str
    memUsage: str


class K8sEvent(BaseModel):
    type: str = ""
    reason: str = ""
    age: str = ""
    from_: str = Field(default="", alias="from")
    message: str = ""
    count: int | None = None


class PredictionSignal(BaseModel):
    key: str
    value: str


class IncidentPrediction(BaseModel):
    id: str
    resourceKind: str
    resource: str
    namespace: str | None = None
    riskScore: int
    confidence: int
    summary: str
    recommendation: str
    signals: list[PredictionSignal] = Field(default_factory=list)


class PredictionRequest(BaseModel):
    pods: list[PodSummary] = Field(default_factory=list)
    nodes: list[NodeSummary] = Field(default_factory=list)
    events: list[K8sEvent] = Field(default_factory=list)
    timestamp: str | None = None


class PredictionResponse(BaseModel):
    source: str
    generatedAt: str
    items: list[IncidentPrediction]


@api.get("/healthz")
def healthz() -> dict:
    return {"status": "ok"}


def require_predictor_secret(
    x_predictor_secret: str | None = Header(default=None, alias="X-Predictor-Secret"),
) -> None:
    expected = os.getenv("PREDICTOR_SHARED_SECRET", "").strip()
    if expected == "":
        return
    if (x_predictor_secret or "").strip() != expected:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="unauthorized predictor request")


@api.post("/predict", response_model=PredictionResponse)
def predict(request: PredictionRequest, _: None = Depends(require_predictor_secret)) -> PredictionResponse:
    items: list[IncidentPrediction] = []

    for pod in request.pods:
        score = 0
        signals: list[PredictionSignal] = []
        status = pod.status.lower().strip()
        resource_warnings = count_resource_warning_events(request.events, pod.name, pod.namespace)
        cpu_milli, cpu_known = parse_cpu_milli(pod.cpu)
        mem_mi, mem_known = parse_memory_mi(pod.memory)

        if status == "failed":
            score += 62
            signals.append(PredictionSignal(key="status", value="Failed"))
        elif status == "pending":
            score += 34
            signals.append(PredictionSignal(key="status", value="Pending"))
        elif status == "unknown":
            score += 20
            signals.append(PredictionSignal(key="status", value="Unknown"))

        if pod.restarts > 0:
            score += min(42, pod.restarts * 8)
            signals.append(PredictionSignal(key="restarts", value=str(pod.restarts)))

        if cpu_milli >= 400:
            score += 10
            signals.append(PredictionSignal(key="cpu", value=pod.cpu))

        if mem_mi >= 512:
            score += 10
            signals.append(PredictionSignal(key="memory", value=pod.memory))

        if resource_warnings > 0 and status != "running":
            score += min(12, resource_warnings * 2)

        score = clamp(score, 0, 100)
        if score < 35:
            continue

        recommendation = "Inspect pod events and logs; verify dependencies and resource limits."
        if status == "pending":
            recommendation = "Validate scheduling constraints, image pulls, and resource requests."
        elif status == "failed":
            recommendation = "Check crash loops, roll back unstable changes, and validate readiness probes."

        confidence = confidence_from_evidence(
            strong_status=status in {"failed", "pending"},
            signal_count=len(signals),
            metric_known=int(cpu_known) + int(mem_known),
            metric_signal_count=int(cpu_milli >= 400) + int(mem_mi >= 512),
            warning_matches=resource_warnings,
            restart_signal=pod.restarts > 0,
        )
        items.append(
            IncidentPrediction(
                id=f"pod-{pod.id}",
                resourceKind="Pod",
                resource=pod.name,
                namespace=pod.namespace,
                riskScore=score,
                confidence=confidence,
                summary=f"{pod.name} shows elevated risk with status {pod.status} and {pod.restarts} restarts.",
                recommendation=recommendation,
                signals=signals,
            )
        )

    for node in request.nodes:
        score = 0
        signals: list[PredictionSignal] = []
        cpu_pct, cpu_known = parse_percent(node.cpuUsage)
        mem_pct, mem_known = parse_percent(node.memUsage)
        resource_warnings = count_resource_warning_events(request.events, node.name, None)

        if node.status.strip().lower() == "notready":
            score += 75
            signals.append(PredictionSignal(key="status", value="NotReady"))

        if cpu_known and cpu_pct >= 90:
            score += 20
            signals.append(PredictionSignal(key="cpuUsage", value=node.cpuUsage))

        if mem_known and mem_pct >= 90:
            score += 20
            signals.append(PredictionSignal(key="memUsage", value=node.memUsage))

        if resource_warnings > 0 and node.status.strip().lower() != "ready":
            score += min(10, resource_warnings * 2)

        score = clamp(score, 0, 100)
        if score < 45:
            continue

        confidence = confidence_from_evidence(
            strong_status=node.status.strip().lower() == "notready",
            signal_count=len(signals),
            metric_known=int(cpu_known) + int(mem_known),
            metric_signal_count=int(cpu_known and cpu_pct >= 90) + int(mem_known and mem_pct >= 90),
            warning_matches=resource_warnings,
            restart_signal=False,
        )
        items.append(
            IncidentPrediction(
                id=f"node-{node.name.lower()}",
                resourceKind="Node",
                resource=node.name,
                riskScore=score,
                confidence=confidence,
                summary=f"Node {node.name} shows elevated operational risk.",
                recommendation="Inspect kubelet health, pressure conditions, and workload distribution.",
                signals=signals,
            )
        )

    items.sort(key=lambda x: (x.riskScore, x.confidence), reverse=True)
    items = items[:10]

    return PredictionResponse(
        source="python-fastapi",
        generatedAt=datetime.now(timezone.utc).isoformat(),
        items=items,
    )


def count_resource_warning_events(events: list[K8sEvent], resource: str, namespace: str | None) -> int:
    resource_name = resource.strip().lower()
    namespace_name = (namespace or "").strip().lower()
    total = 0

    for event in events:
        event_type = event.type.strip().lower()
        event_reason = event.reason.strip().lower()
        if event_type != "warning" and event_reason not in {"backoff", "failed", "unhealthy", "oomkilled"}:
            continue

        haystack = f"{event.reason} {event.message} {event.from_}".lower()
        if resource_name not in haystack and (namespace_name == "" or namespace_name not in haystack):
            continue

        total += max(1, event.count or 1)

    return total


def confidence_from_evidence(
    *,
    strong_status: bool,
    signal_count: int,
    metric_known: int,
    metric_signal_count: int,
    warning_matches: int,
    restart_signal: bool,
) -> int:
    confidence = 35
    if strong_status:
        confidence += 18

    confidence += min(24, signal_count * 6)
    confidence += min(16, metric_known * 8)
    confidence += min(10, metric_signal_count * 5)
    confidence += min(12, warning_matches * 3)
    if restart_signal:
        confidence += 6

    if signal_count <= 1:
        confidence -= 8
    if metric_known == 0 and not strong_status:
        confidence -= 10

    return clamp(confidence, 35, 96)


def parse_cpu_milli(value: str) -> tuple[int, bool]:
    raw = value.strip().lower()
    if not raw or raw == "n/a":
        return 0, False
    try:
        if raw.endswith("m"):
            return int(float(raw[:-1] or 0)), True
        return int(float(raw) * 1000), True
    except ValueError:
        return 0, False


def parse_memory_mi(value: str) -> tuple[int, bool]:
    raw = value.strip().lower()
    if not raw or raw == "n/a":
        return 0, False
    try:
        if raw.endswith("mi"):
            return int(float(raw[:-2] or 0)), True
        if raw.endswith("gi"):
            return int(float(raw[:-2] or 0) * 1024), True
        if raw.endswith("ki"):
            return int(float(raw[:-2] or 0) / 1024), True
        if raw.endswith("b"):
            return int(float(raw[:-1] or 0) / (1024 * 1024)), True
    except ValueError:
        return 0, False
    return 0, False


def parse_percent(value: str) -> tuple[float, bool]:
    raw = value.strip().lower().replace("%", "")
    if not raw or raw == "n/a":
        return 0.0, False
    try:
        parsed = float(raw)
    except ValueError:
        return 0.0, False
    return max(0.0, min(100.0, parsed)), True


def clamp(value: int, low: int, high: int) -> int:
    if value < low:
        return low
    if value > high:
        return high
    return value
