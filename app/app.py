import os
import random
import logging
import subprocess
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor
from flask import Flask, render_template, jsonify, send_from_directory, request
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_socketio import SocketIO
from prometheus_client import start_http_server, Gauge, generate_latest

# Initialize Flask app
app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='gevent')

# Configuration (environment-variable driven)
NODE_NAMES = os.getenv("NODE_NAMES", "k8s-node-1,k8s-node-2,k8s-node-3").split(",")
POD_NAMES = os.getenv("POD_NAMES", "nginx,redis,postgres,web,api").split(",")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")  # Restrict in production!

# Security & Rate Limiting
CORS(app, resources={r"/*": {"origins": CORS_ORIGINS}})
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"]
)

# Metrics
ALERTS_GAUGE = Gauge('cluster_alerts', 'Active cluster alerts')
CPU_GAUGE = Gauge('cluster_cpu_usage', 'Cluster CPU usage percent')
MEMORY_GAUGE = Gauge('cluster_memory_usage', 'Cluster memory usage percent')
PODS_GAUGE = Gauge('cluster_pods', 'Number of running pods')
NODES_GAUGE = Gauge('cluster_nodes', 'Number of active nodes')

# State
historical_data = {
    "timestamps": [],
    "cpu": [],
    "memory": []
}

# Logging
logging.basicConfig(level=logging.INFO)
app.logger = logging.getLogger(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/k8s')
@limiter.limit("10 per minute")
def cluster_data():
    try:
        # Generate realistic node metrics
        nodes = []
        for i, name in enumerate(NODE_NAMES):
            base_load = 30 + (i * 7)  # Varies by node
            nodes.append({
                "name": name,
                "cpu": max(5, min(95, base_load + random.randint(-15, 15))),
                "memory": max(10, min(90, base_load + random.randint(-10, 20))),
                "status": "Ready" if random.random() > 0.1 else "NotReady",
                "pods": random.randint(1, 10)
            })

        # Generate pods with realistic relationships
        pods = []
        for _ in range(random.randint(8, 25)):
            host_node = random.choice(nodes)
            pods.append({
                "name": f"{random.choice(POD_NAMES)}-{random.randint(1000, 9999)}",
                "status": random.choices(
                    ["Running", "Pending", "Error"], 
                    weights=[8, 1, 1]
                )[0],
                "node": host_node["name"],
                "age": f"{random.randint(1, 72)}h",
                "restarts": random.randint(0, 5)
            })

        # Calculate metrics
        avg_cpu = round(sum(n["cpu"] for n in nodes) / len(nodes), 1)
        avg_memory = round(sum(n["memory"] for n in nodes) / len(nodes), 1)

        # Update historical data (last 12 points)
        now = datetime.now(timezone.utc)
        historical_data["timestamps"].append(now.strftime("%H:%M"))
        historical_data["cpu"].append(avg_cpu)
        historical_data["memory"].append(avg_memory)
        for key in historical_data:
            historical_data[key] = historical_data[key][-12:]

        # Update Prometheus metrics
        CPU_GAUGE.set(avg_cpu)
        MEMORY_GAUGE.set(avg_memory)
        PODS_GAUGE.set(len(pods))
        NODES_GAUGE.set(len(nodes))

        return jsonify({
            "nodes": nodes,
            "pods": pods,
            "status": "success",
            "last_updated": now.isoformat(),
            "averages": {"cpu": avg_cpu, "memory": avg_memory},
            "historical": historical_data
        })
    except Exception as e:
        app.logger.error(f"Error in cluster_data: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/alerts')
@limiter.limit("5 per minute")
def get_alerts():
    try:
        alerts = []
        if random.random() > 0.7:  # 30% chance of demo alert
            alerts.append({
                "severity": random.choice(["warning", "critical"]),
                "message": random.choice([
                    "High CPU load on node-3",
                    "Memory pressure on worker-2",
                    "Pod crashloop detected",
                    "Node disk space low",
                    "Network latency increased"
                ]),
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
        ALERTS_GAUGE.set(len(alerts))
        return jsonify(alerts)
    except Exception as e:
        app.logger.error(f"Error in get_alerts: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/scan', methods=['POST'])
@limiter.limit("1 per minute")
def start_scan():
    try:
        # Simulate scanning process
        results = {
            "status": "completed",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "vulnerabilities": [
                {
                    "id": f"CVE-2023-{random.randint(1000, 9999)}",
                    "severity": random.choice(["critical", "high", "medium"]),
                    "component": random.choice(["kube-apiserver", "etcd", "kubelet", "container-runtime"]),
                    "description": random.choice([
                        "Privilege escalation vulnerability",
                        "Denial of service risk",
                        "Information disclosure flaw"
                    ])
                } for _ in range(random.randint(0, 5))
            ]
        }
        return jsonify(results)
    except Exception as e:
        app.logger.error(f"Scan error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/cost')
@limiter.limit("5 per minute")
def cost_analysis():
    try:
        now = datetime.now(timezone.utc)
        daily_cost = round(random.uniform(150, 300), 2)
        
        return jsonify({
            "daily": daily_cost,
            "predicted_monthly": round(daily_cost * 30 * random.uniform(0.9, 1.1), 2),
            "breakdown": [
                {"service": "Compute", "cost": round(daily_cost * 0.6, 2)},
                {"service": "Storage", "cost": round(daily_cost * 0.25, 2)},
                {"service": "Network", "cost": round(daily_cost * 0.15, 2)}
            ],
            "timestamp": now.isoformat()
        })
    except Exception as e:
        app.logger.error(f"Cost analysis error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/nodes/<node_name>')
@limiter.limit("10 per minute")
def node_details(node_name):
    try:
        # Simulate node details
        return jsonify({
            "name": node_name,
            "status": "Ready",
            "capacity": {
                "cpu": random.randint(4, 16),
                "memory": f"{random.randint(16, 64)}Gi",
                "pods": random.randint(50, 200)
            },
            "usage": {
                "cpu": f"{random.randint(30, 80)}%",
                "memory": f"{random.randint(40, 90)}%",
                "pods": random.randint(5, 40)
            },
            "conditions": [
                {
                    "type": "Ready",
                    "status": "True",
                    "lastHeartbeatTime": (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
                }
            ]
        })
    except Exception as e:
        app.logger.error(f"Node details error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/metrics')
def metrics():
    return generate_latest()

@app.route('/health')
def health():
    return jsonify({"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()})

@app.route('/static/<path:path>')
def static_files(path):
    return send_from_directory('static', path)

# WebSocket handlers
@socketio.on('connect')
def handle_connect():
    app.logger.info(f"Client connected: {request.sid}")

@socketio.on('disconnect')
def handle_disconnect():
    app.logger.info(f"Client disconnected: {request.sid}")

@socketio.on('terminal_command')
def handle_terminal_command(data):
    try:
        pod_name = data.get('pod')
        command = data.get('command')
        
        if not pod_name or not command:
            socketio.emit('terminal_output', {'output': 'Error: Missing pod name or command'})
            return

        # Basic command validation
        allowed_commands = ['ls', 'pwd', 'echo', 'whoami', 'date', 'ps', 'netstat']
        if command.split()[0] not in allowed_commands:
            socketio.emit('terminal_output', {
                'output': f"Error: Command not allowed. Allowed commands: {', '.join(allowed_commands)}"
            })
            return

        # Simulate command execution
        output = f"$ {command}\n"
        output += f"Executing in pod {pod_name}\n"
        output += "file1.txt file2.log\n" if "ls" in command else "Command executed\n"
        
        socketio.emit('terminal_output', {'output': output})
    except Exception as e:
        app.logger.error(f"Terminal error: {e}")
        socketio.emit('terminal_output', {'output': f"Error: {str(e)}"})

def run_metrics_server():
    try:
        start_http_server(9100)
        app.logger.info("Metrics server started on port 9100")
    except Exception as e:
        app.logger.error(f"Failed to start metrics server: {e}")

# Create WSGI application for Gunicorn
# WSGI compatibility
application = app

if __name__ == '__main__':
    executor = ThreadPoolExecutor(max_workers=2)
    executor.submit(run_metrics_server)
    socketio.run(app, host='0.0.0.0', port=5000, debug=False)
