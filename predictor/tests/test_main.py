from fastapi.testclient import TestClient
from predictor.app.main import K8sEvent, api, confidence_from_evidence, count_resource_warning_events

client = TestClient(api)


def test_healthz_ok() -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_predict_returns_risk_items() -> None:
    payload = {
        "pods": [
            {
                "id": "p1",
                "name": "payment-gateway",
                "namespace": "prod",
                "status": "Failed",
                "cpu": "450m",
                "memory": "600Mi",
                "age": "5m",
                "restarts": 4,
            }
        ],
        "nodes": [],
        "events": [{"type": "Warning", "reason": "BackOff", "age": "1m", "from": "kubelet", "message": "loop"}],
    }

    response = client.post("/predict", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["source"] == "python-fastapi"
    assert len(data["items"]) == 1
    assert data["items"][0]["riskScore"] >= 35


def test_predict_handles_invalid_usage_values() -> None:
    payload = {
        "pods": [
            {
                "id": "p2",
                "name": "auth",
                "namespace": "prod",
                "status": "Pending",
                "cpu": "not-a-number",
                "memory": "broken",
                "age": "1m",
                "restarts": 2,
            }
        ],
        "nodes": [
            {
                "name": "node-1",
                "status": "NotReady",
                "roles": "worker",
                "age": "1d",
                "version": "1.31",
                "cpuUsage": "bad%",
                "memUsage": "also-bad",
            }
        ],
    }

    response = client.post("/predict", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["source"] == "python-fastapi"


def test_predict_rejects_invalid_contract() -> None:
    response = client.post("/predict", json={"pods": "bad"})
    assert response.status_code == 422


def test_predict_requires_shared_secret_when_configured(monkeypatch) -> None:
    monkeypatch.setenv("PREDICTOR_SHARED_SECRET", "secret-123")
    payload = {"pods": [], "nodes": [], "events": []}

    unauthorized = client.post("/predict", json=payload)
    assert unauthorized.status_code == 401

    authorized = client.post("/predict", json=payload, headers={"X-Predictor-Secret": "secret-123"})
    assert authorized.status_code == 200
    monkeypatch.delenv("PREDICTOR_SHARED_SECRET", raising=False)


def test_confidence_from_evidence_rewards_richer_signals() -> None:
    sparse = confidence_from_evidence(
        strong_status=False,
        signal_count=1,
        metric_known=0,
        metric_signal_count=0,
        warning_matches=0,
        restart_signal=False,
    )
    rich = confidence_from_evidence(
        strong_status=True,
        signal_count=4,
        metric_known=2,
        metric_signal_count=2,
        warning_matches=3,
        restart_signal=True,
    )

    assert rich > sparse


def test_count_resource_warning_events_matches_message_and_count() -> None:
    events = [
        K8sEvent(
            type="Warning",
            reason="BackOff",
            age="1m",
            **{"from": "kubelet"},
            message="pod payment-gateway in namespace production restarted repeatedly",
            count=3,
        ),
        K8sEvent(
            type="Warning",
            reason="Failed",
            age="2m",
            **{"from": "kubelet"},
            message="node node-worker-3 kubelet not ready",
            count=2,
        ),
    ]

    assert count_resource_warning_events(events, "payment-gateway", "production") == 3
    assert count_resource_warning_events(events, "node-worker-3", None) == 2
