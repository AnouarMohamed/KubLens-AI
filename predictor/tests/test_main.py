from fastapi.testclient import TestClient
from predictor.app.main import api

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
