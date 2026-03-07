from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI
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


@api.post("/predict", response_model=PredictionResponse)
def predict(request: PredictionRequest) -> PredictionResponse:
    warning_events = count_warning_events(request.events)
    items: list[IncidentPrediction] = []

    for pod in request.pods:
        score = 0
        signals: list[PredictionSignal] = []

        status = pod.status.lower().strip()
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

        cpu_milli = parse_cpu_milli(pod.cpu)
        if cpu_milli >= 400:
            score += 10
            signals.append(PredictionSignal(key="cpu", value=pod.cpu))

        mem_mi = parse_memory_mi(pod.memory)
        if mem_mi >= 512:
            score += 10
            signals.append(PredictionSignal(key="memory", value=pod.memory))

        if warning_events > 0 and status != "running":
            score += min(12, warning_events // 2)

        score = clamp(score, 0, 100)
        if score < 35:
            continue

        recommendation = "Inspect pod events and logs; verify dependencies and resource limits."
        if status == "pending":
            recommendation = "Validate scheduling constraints, image pulls, and resource requests."
        elif status == "failed":
            recommendation = "Check crash loops, roll back unstable changes, and validate readiness probes."

        confidence = clamp(round(45 + score * 0.45), 50, 95)
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

        if node.status.strip().lower() == "notready":
            score += 75
            signals.append(PredictionSignal(key="status", value="NotReady"))

        cpu_pct = parse_percent(node.cpuUsage)
        if cpu_pct >= 90:
            score += 20
            signals.append(PredictionSignal(key="cpuUsage", value=node.cpuUsage))

        mem_pct = parse_percent(node.memUsage)
        if mem_pct >= 90:
            score += 20
            signals.append(PredictionSignal(key="memUsage", value=node.memUsage))

        score = clamp(score, 0, 100)
        if score < 45:
            continue

        confidence = clamp(50 + score // 2, 55, 96)
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


def count_warning_events(events: list[K8sEvent]) -> int:
    warning_reasons = {"backoff", "failed", "unhealthy", "oomkilled"}
    total = 0
    for event in events:
        if event.type.strip().lower() == "warning":
            total += 1
            continue
        if event.reason.strip().lower() in warning_reasons:
            total += 1
    return total


def parse_cpu_milli(value: str) -> int:
    raw = value.strip().lower()
    if not raw or raw == "n/a":
        return 0
    try:
        if raw.endswith("m"):
            return int(float(raw[:-1] or 0))
        return int(float(raw) * 1000)
    except ValueError:
        return 0


def parse_memory_mi(value: str) -> int:
    raw = value.strip().lower()
    if not raw or raw == "n/a":
        return 0
    try:
        if raw.endswith("mi"):
            return int(float(raw[:-2] or 0))
        if raw.endswith("gi"):
            return int(float(raw[:-2] or 0) * 1024)
        if raw.endswith("ki"):
            return int(float(raw[:-2] or 0) / 1024)
        if raw.endswith("b"):
            return int(float(raw[:-1] or 0) / (1024 * 1024))
    except ValueError:
        return 0
    return 0


def parse_percent(value: str) -> float:
    raw = value.strip().lower().replace("%", "")
    if not raw or raw == "n/a":
        return 0.0
    try:
        parsed = float(raw)
    except ValueError:
        return 0.0
    return max(0.0, min(100.0, parsed))


def clamp(value: int, low: int, high: int) -> int:
    if value < low:
        return low
    if value > high:
        return high
    return value
