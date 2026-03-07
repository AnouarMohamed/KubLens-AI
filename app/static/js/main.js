// DOM Elements
const elements = {
    // Sidebar elements
    sidebarButtons: document.querySelectorAll('.nav-btn'),
    sidebarCpu: document.getElementById('sidebar-cpu'),
    sidebarCpuValue: document.getElementById('sidebar-cpu-value'),
    sidebarNodeCount: document.getElementById('sidebar-node-count'),
    
    // Dashboard elements
    podCount: document.getElementById('pod-count'),
    cpuUsage: document.getElementById('cpu-usage'),
    memoryUsage: document.getElementById('memory-usage'),
    alertBadge: document.getElementById('alert-badge'),
    clusterLogs: document.getElementById('cluster-logs'),
    clearLogsBtn: document.getElementById('clear-logs'),
    lastUpdated: document.getElementById('last-updated'),
    resourceChart: document.getElementById('resource-chart'),
    scanButton: document.getElementById('scan-button'),
    costDisplay: document.getElementById('cost-display'),
    scanResultsList: document.getElementById('scan-results-list'),
    costBreakdownList: document.getElementById('cost-breakdown-list'),
    
    // Nodes elements
    nodeList: document.getElementById('node-list'),
    nodeSearch: document.getElementById('node-search'),
    
    // Pods elements
    podList: document.getElementById('pod-list')?.querySelector('tbody'),
    podSearch: document.getElementById('pod-search'),
    
    // Terminal elements
    terminalContainer: document.getElementById('terminal-container'),
    
    // Tab sections
    tabs: {
        dashboard: document.getElementById('dashboard-section'),
        nodes: document.getElementById('nodes-section'),
        pods: document.getElementById('pods-section'),
        terminal: document.getElementById('terminal-section')
    }
};

// State management
const clusterData = {
    nodes: [],
    pods: [],
    lastUpdated: null,
    alerts: [],
    historical: {
        cpu: [],
        memory: [],
        timestamps: []
    }
};

let resourceChart = null;
let socket = null;
let dataUpdateInterval = null;
let alertCheckInterval = null;

// Main initialization
document.addEventListener('DOMContentLoaded', () => {
    if (!elements.resourceChart) return;

    try {
        initResourceChart();
        setupEventListeners();
        setupTabNavigation();
        initAlertSystem();
        startDataPolling();
        initCostAnalysis();
    } catch (error) {
        console.error('Initialization failed:', error);
        addLogEntry(`Initialization error: ${error.message}`, 'error');
    }
});

// Event listeners
function setupEventListeners() {
    // Sidebar navigation
    elements.sidebarButtons.forEach(button => {
        button.addEventListener('click', handleTabClick);
    });

    // Clear logs button
    if (elements.clearLogsBtn) {
        elements.clearLogsBtn.addEventListener('click', clearLogs);
    }

    // Search functionality
    if (elements.nodeSearch) {
        elements.nodeSearch.addEventListener('input', debounce(filterNodes, 300));
    }

    if (elements.podSearch) {
        elements.podSearch.addEventListener('input', debounce(filterPods, 300));
    }

    // Security scan
    if (elements.scanButton) {
        elements.scanButton.addEventListener('click', startSecurityScan);
    }
}

// Tab navigation
function setupTabNavigation() {
    // Set dashboard as default active tab
    switchTab('dashboard');
}

function handleTabClick(e) {
    e.preventDefault();
    const tabName = e.currentTarget.dataset.section;
    switchTab(tabName);
}

function switchTab(tabName) {
    // Update sidebar buttons
    elements.sidebarButtons.forEach(button => {
        button.classList.remove('active');
        if (button.dataset.section === tabName) {
            button.classList.add('active');
        }
    });

    // Hide all tab content
    Object.values(elements.tabs).forEach(section => {
        if (section) section.classList.add('hidden');
    });

    // Show selected tab
    if (elements.tabs[tabName]) {
        elements.tabs[tabName].classList.remove('hidden');
    }
}

// Data polling
function startDataPolling() {
    updateClusterData();
    dataUpdateInterval = setInterval(updateClusterData, 5000);
}

async function updateClusterData() {
    try {
        const [k8sRes, alertsRes] = await Promise.all([
            fetch('/api/k8s'),
            fetch('/api/alerts')
        ]);

        if (!k8sRes.ok) throw new Error(`K8s error: ${k8sRes.status}`);
        if (!alertsRes.ok) throw new Error(`Alerts error: ${alertsRes.status}`);

        const k8sData = await k8sRes.json();
        const alertsData = await alertsRes.json();

        Object.assign(clusterData, k8sData);
        clusterData.alerts = alertsData;

        updateDashboard();
        updateNodes();
        updatePods();
        updateTimestamps();
        updateAlerts();

    } catch (error) {
        console.error("Data update failed:", error);
        addLogEntry(`[ERROR] Update failed: ${error.message}`, 'error');
    }
}

// Alert system
function initAlertSystem() {
    checkAlerts();
    alertCheckInterval = setInterval(checkAlerts, 30000);
}

async function checkAlerts() {
    try {
        const response = await fetch('/api/alerts');
        if (!response.ok) throw new Error('Alert fetch failed');

        const alerts = await response.json();
        updateAlerts(alerts);

        if (alerts.length > 0) {
            alerts.forEach(alert => {
                addLogEntry(`[${alert.severity.toUpperCase()}] ${alert.message}`, 'error');
            });
        }
    } catch (error) {
        console.error('Alert check failed:', error);
    }
}

function updateAlerts(alerts) {
    if (!elements.alertBadge) return;

    const alertCount = alerts?.length || clusterData.alerts?.length || 0;
    elements.alertBadge.textContent = alertCount;

    if (alertCount > 0) {
        elements.alertBadge.style.display = 'flex';
    } else {
        elements.alertBadge.style.display = 'none';
    }
}

// Cost analysis
async function initCostAnalysis() {
    try {
        const response = await fetch('/api/cost');
        if (!response.ok) throw new Error('Cost fetch failed');

        const costData = await response.json();
        renderCostData(costData);
    } catch (error) {
        console.error('Cost analysis failed:', error);
        addLogEntry(`[ERROR] Cost update: ${error.message}`, 'error');
    }
}

function renderCostData(costData) {
    if (elements.costDisplay) {
        elements.costDisplay.textContent = `$${costData.daily.toFixed(2)}`;
    }

    if (elements.costBreakdownList && costData.breakdown) {
        elements.costBreakdownList.innerHTML = costData.breakdown.map(item => `
            <li>
                <span class="service">${item.service}</span>
                <span class="amount">$${item.cost.toFixed(2)}</span>
            </li>
        `).join('');
    }
}

// Security scan
async function startSecurityScan() {
    try {
        elements.scanButton.disabled = true;
        elements.scanButton.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" class="spinner"><path fill="currentColor" d="M12,4V2A10,10 0 0,0 2,12H4A8,8 0 0,1 12,4Z"/></svg> Scanning...';
        addLogEntry('[SCAN] Security scan started');

        const response = await fetch('/api/scan', { method: 'POST' });
        if (!response.ok) throw new Error('Scan failed');

        const results = await response.json();
        renderScanResults(results);
        addLogEntry('[SCAN] Security scan completed');

    } catch (error) {
        console.error('Scan failed:', error);
        addLogEntry(`[ERROR] Scan failed: ${error.message}`, 'error');
    } finally {
        elements.scanButton.disabled = false;
        elements.scanButton.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm-7 7H3v4c0 1.1.9 2 2 2h4v-2H5v-4zM5 5h4V3H5c-1.1 0-2 .9-2 2v4h2V5zm14-2h-4v2h4v4h2V5c0-1.1-.9-2-2-2zm0 16h-4v2h4c1.1 0 2-.9 2-2v-4h-2v4z"/></svg> Scan Now';
    }
}

function renderScanResults(results) {
    if (!elements.scanResultsList || !results.vulnerabilities) return;

    elements.scanResultsList.innerHTML = results.vulnerabilities.map(vuln => `
        <li class="${vuln.severity}">
            <strong>${vuln.name}</strong> (${vuln.severity})
            <div>Component: ${vuln.component}</div>
        </li>
    `).join('');
}

// Terminal management
function openTerminal(podName) {
    if (!elements.terminalContainer) return;

    try {
        if (socket) {
            socket.disconnect();
        }

        elements.terminalContainer.innerHTML = '';
        const term = new Terminal();
        term.open(elements.terminalContainer);

        // Use relative path with current protocol
        const protocol = window.location.protocol.includes('https') ? 'wss' : 'ws';
        const socketUrl = `${protocol}://${window.location.host}`;

        socket = io(socketUrl, {
            transports: ['websocket'],
            path: '/socket.io'
        });

        socket.on('connect', () => {
            term.write(`Connected to ${podName}\r\n$ `);
        });

        socket.on('output', (data) => {
            term.write(data);
        });

        socket.on('error', (error) => {
            console.error('Socket error:', error);
            term.write('\r\nConnection error\r\n');
        });

        term.onData(data => {
            socket.emit('message', data);
        });

    } catch (error) {
        console.error('Terminal initialization failed:', error);
    }
}

// Dashboard updates
function updateDashboard() {
    if (!clusterData.averages) return;

    const avgCpu = clusterData.averages.cpu || 0;
    const avgMemory = clusterData.averages.memory || 0;
    const healthyNodes = clusterData.nodes.filter(n => n.status === 'Ready').length;

    if (elements.podCount) elements.podCount.textContent = clusterData.pods.length;
    if (elements.cpuUsage) elements.cpuUsage.textContent = `${avgCpu}%`;
    if (elements.memoryUsage) elements.memoryUsage.textContent = `${avgMemory}%`;
    if (elements.sidebarCpu) elements.sidebarCpu.style.width = `${avgCpu}%`;
    if (elements.sidebarCpuValue) elements.sidebarCpuValue.textContent = `${avgCpu}%`;
    if (elements.sidebarNodeCount) elements.sidebarNodeCount.textContent = clusterData.nodes.length;

    updateResourceChart();
}

// Chart management
function initResourceChart() {
    if (!elements.resourceChart) return;

    const ctx = elements.resourceChart.getContext('2d');
    resourceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'CPU Usage',
                data: [],
                borderColor: '#1a73e8',
                backgroundColor: 'rgba(26, 115, 232, 0.1)',
                borderWidth: 2,
                tension: 0.3,
                fill: true
            }, {
                label: 'Memory Usage',
                data: [],
                borderColor: '#34a853',
                backgroundColor: 'rgba(52, 168, 83, 0.1)',
                borderWidth: 2,
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { 
                    display: true,
                    position: 'top'
                } 
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: { stepSize: 20 },
                    grid: { color: 'rgba(0, 0, 0, 0.05)' }
                },
                x: {
                    grid: { color: 'rgba(0, 0, 0, 0.05)' }
                }
            }
        }
    });
}

function updateResourceChart() {
    if (!resourceChart || !clusterData.historical) return;

    resourceChart.data.labels = clusterData.historical.timestamps;
    resourceChart.data.datasets[0].data = clusterData.historical.cpu;
    resourceChart.data.datasets[1].data = clusterData.historical.memory;
    resourceChart.update();
}

// Node and Pod rendering
function updateNodes() {
    if (!elements.nodeList || !clusterData.nodes.length) return;

    elements.nodeList.innerHTML = clusterData.nodes.map(node => `
        <div class="node-card" data-name="${node.name.toLowerCase()}">
            <div class="node-header">
                <h3>
                    <span class="status-indicator status-${node.status.toLowerCase()}"></span>
                    ${node.name}
                </h3>
                <span class="node-status">${node.status}</span>
            </div>
            <div class="resource-meter">
                <div class="meter-label">
                    <span>CPU</span>
                    <span>${node.cpu}%</span>
                </div>
                <div class="meter-bar">
                    <div class="fill" style="width: ${node.cpu}%"></div>
                </div>
            </div>
            <div class="resource-meter">
                <div class="meter-label">
                    <span>Memory</span>
                    <span>${node.memory}%</span>
                </div>
                <div class="meter-bar">
                    <div class="fill" style="width: ${node.memory}%"></div>
                </div>
            </div>
        </div>
    `).join('');
}

function updatePods() {
    if (!elements.podList || !clusterData.pods.length) return;

    elements.podList.innerHTML = clusterData.pods.map(pod => `
        <tr data-name="${pod.name.toLowerCase()}" data-status="${pod.status.toLowerCase()}" data-node="${pod.node.toLowerCase()}">
            <td>${pod.name}</td>
            <td><span class="status-badge status-${pod.status.toLowerCase()}">${pod.status}</span></td>
            <td>${pod.node}</td>
            <td>${pod.age}</td>
            <td><button class="terminal-btn" data-pod="${pod.name}">Terminal</button></td>
        </tr>
    `).join('');
}

// Helper functions
function updateTimestamps() {
    if (!elements.lastUpdated) return;
    const now = new Date();
    elements.lastUpdated.textContent = `Last updated: ${now.toLocaleTimeString()}`;
}

function addLogEntry(message, type = 'info') {
    if (!elements.clusterLogs) return;

    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    elements.clusterLogs.prepend(logEntry);

    // Auto-scroll to top
    elements.clusterLogs.scrollTop = 0;
}

function clearLogs() {
    if (elements.clusterLogs) {
        elements.clusterLogs.innerHTML = '';
    }
}

function filterNodes() {
    if (!elements.nodeSearch || !elements.nodeList) return;

    const searchTerm = elements.nodeSearch.value.toLowerCase();
    document.querySelectorAll('.node-card').forEach(card => {
        card.style.display = card.dataset.name.includes(searchTerm) ? 'block' : 'none';
    });
}

function filterPods() {
    if (!elements.podSearch || !elements.podList) return;

    const searchTerm = elements.podSearch.value.toLowerCase();
    document.querySelectorAll('#pod-list tr').forEach(row => {
        row.style.display = row.dataset.name.includes(searchTerm) ? '' : 'none';
    });
}

function debounce(fn, delay) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (dataUpdateInterval) clearInterval(dataUpdateInterval);
    if (alertCheckInterval) clearInterval(alertCheckInterval);
    if (socket) socket.disconnect();
});
