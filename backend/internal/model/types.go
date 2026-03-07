package model

// PodStatus represents a Kubernetes pod phase normalized for frontend use.
type PodStatus string

const (
	PodStatusRunning   PodStatus = "Running"
	PodStatusPending   PodStatus = "Pending"
	PodStatusFailed    PodStatus = "Failed"
	PodStatusSucceeded PodStatus = "Succeeded"
	PodStatusUnknown   PodStatus = "Unknown"
)

// NodeStatus represents a Kubernetes node readiness state.
type NodeStatus string

const (
	NodeStatusReady    NodeStatus = "Ready"
	NodeStatusNotReady NodeStatus = "NotReady"
	NodeStatusUnknown  NodeStatus = "Unknown"
)

// DiagnosticSeverity models issue criticality for cluster diagnostics.
type DiagnosticSeverity string

const (
	SeverityCritical DiagnosticSeverity = "critical"
	SeverityWarning  DiagnosticSeverity = "warning"
	SeverityInfo     DiagnosticSeverity = "info"
)

type PodSummary struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Namespace string    `json:"namespace"`
	Status    PodStatus `json:"status"`
	CPU       string    `json:"cpu"`
	Memory    string    `json:"memory"`
	Age       string    `json:"age"`
	Restarts  int32     `json:"restarts"`
}

type ContainerEnv struct {
	Name  string `json:"name"`
	Value string `json:"value,omitempty"`
}

type VolumeMount struct {
	Name      string `json:"name"`
	MountPath string `json:"mountPath"`
}

type ResourcePairs struct {
	CPU    string `json:"cpu,omitempty"`
	Memory string `json:"memory,omitempty"`
}

type ContainerResources struct {
	Requests *ResourcePairs `json:"requests,omitempty"`
	Limits   *ResourcePairs `json:"limits,omitempty"`
}

type ContainerSpec struct {
	Name         string              `json:"name"`
	Image        string              `json:"image,omitempty"`
	Env          []ContainerEnv      `json:"env,omitempty"`
	VolumeMounts []VolumeMount       `json:"volumeMounts,omitempty"`
	Resources    *ContainerResources `json:"resources,omitempty"`
}

type NamedVolume struct {
	Name string `json:"name"`
}

type PodDetail struct {
	PodSummary
	Containers []ContainerSpec `json:"containers"`
	Volumes    []NamedVolume   `json:"volumes,omitempty"`
	NodeName   string          `json:"nodeName,omitempty"`
	HostIP     string          `json:"hostIP,omitempty"`
	PodIP      string          `json:"podIP,omitempty"`
}

type CPUPoint struct {
	Time  string `json:"time"`
	Value int    `json:"value"`
}

type NodeSummary struct {
	Name       string     `json:"name"`
	Status     NodeStatus `json:"status"`
	Roles      string     `json:"roles"`
	Age        string     `json:"age"`
	Version    string     `json:"version"`
	CPUUsage   string     `json:"cpuUsage"`
	MemUsage   string     `json:"memUsage"`
	CPUHistory []CPUPoint `json:"cpuHistory,omitempty"`
}

type ResourceCapacity struct {
	CPU    string `json:"cpu"`
	Memory string `json:"memory"`
	Pods   string `json:"pods"`
}

type NodeCondition struct {
	Type               string `json:"type"`
	Status             string `json:"status"`
	LastTransitionTime string `json:"lastTransitionTime"`
	Reason             string `json:"reason"`
	Message            string `json:"message"`
}

type NodeAddress struct {
	Type    string `json:"type"`
	Address string `json:"address"`
}

type NodeDetail struct {
	NodeSummary
	Capacity    ResourceCapacity `json:"capacity"`
	Allocatable ResourceCapacity `json:"allocatable"`
	Conditions  []NodeCondition  `json:"conditions"`
	Addresses   []NodeAddress    `json:"addresses"`
}

type K8sEvent struct {
	Type          string `json:"type"`
	Reason        string `json:"reason"`
	Age           string `json:"age"`
	From          string `json:"from"`
	Message       string `json:"message"`
	Count         int32  `json:"count,omitempty"`
	LastTimestamp string `json:"lastTimestamp,omitempty"`
}

type ClusterInfo struct {
	IsRealCluster bool `json:"isRealCluster"`
}

type BuildInfo struct {
	Version string `json:"version"`
	Commit  string `json:"commit"`
	BuiltAt string `json:"builtAt"`
}

type PodStats struct {
	Total   int `json:"total"`
	Running int `json:"running"`
	Pending int `json:"pending"`
	Failed  int `json:"failed"`
}

type NodeStats struct {
	Total    int `json:"total"`
	Ready    int `json:"ready"`
	NotReady int `json:"notReady"`
}

type ClusterCapacity struct {
	CPU     string `json:"cpu"`
	Memory  string `json:"memory"`
	Storage string `json:"storage"`
}

type ClusterStats struct {
	Pods    PodStats        `json:"pods"`
	Nodes   NodeStats       `json:"nodes"`
	Cluster ClusterCapacity `json:"cluster"`
}

type DiagnosticIssue struct {
	Severity       DiagnosticSeverity `json:"severity"`
	Title          string             `json:"title"`
	Resource       string             `json:"resource,omitempty"`
	Details        string             `json:"details"`
	Recommendation string             `json:"recommendation"`
}

type DiagnosticsResult struct {
	Summary        string            `json:"summary"`
	Timestamp      string            `json:"timestamp"`
	CriticalIssues int               `json:"criticalIssues"`
	WarningIssues  int               `json:"warningIssues"`
	HealthScore    int               `json:"healthScore"`
	Issues         []DiagnosticIssue `json:"issues"`
}

type PredictionSignal struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type IncidentPrediction struct {
	ID             string             `json:"id"`
	ResourceKind   string             `json:"resourceKind"`
	Resource       string             `json:"resource"`
	Namespace      string             `json:"namespace,omitempty"`
	RiskScore      int                `json:"riskScore"`
	Confidence     int                `json:"confidence"`
	Summary        string             `json:"summary"`
	Recommendation string             `json:"recommendation"`
	Signals        []PredictionSignal `json:"signals,omitempty"`
}

type PredictionsResult struct {
	Source      string               `json:"source"`
	GeneratedAt string               `json:"generatedAt"`
	Items       []IncidentPrediction `json:"items"`
}

type DocumentationReference struct {
	Title   string `json:"title"`
	URL     string `json:"url"`
	Source  string `json:"source"`
	Snippet string `json:"snippet,omitempty"`
}

type AssistantResponse struct {
	Answer              string                   `json:"answer"`
	Hints               []string                 `json:"hints"`
	ReferencedResources []string                 `json:"referencedResources"`
	References          []DocumentationReference `json:"references,omitempty"`
	Timestamp           string                   `json:"timestamp"`
}

type ResourceRecord struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Namespace string `json:"namespace,omitempty"`
	Status    string `json:"status"`
	Age       string `json:"age"`
	Summary   string `json:"summary,omitempty"`
}

type ResourceList struct {
	Kind  string           `json:"kind"`
	Items []ResourceRecord `json:"items"`
}

type PodCreateRequest struct {
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
	Image     string `json:"image"`
}

type ScaleRequest struct {
	Replicas int32 `json:"replicas"`
}

type ResourceManifest struct {
	YAML string `json:"yaml"`
}

type ActionResult struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type TerminalExecRequest struct {
	Command        string `json:"command"`
	Cwd            string `json:"cwd,omitempty"`
	TimeoutSeconds int    `json:"timeoutSeconds,omitempty"`
}

type TerminalExecResponse struct {
	Command    string `json:"command"`
	Cwd        string `json:"cwd"`
	Stdout     string `json:"stdout"`
	Stderr     string `json:"stderr"`
	ExitCode   int    `json:"exitCode"`
	DurationMs int64  `json:"durationMs"`
	Timestamp  string `json:"timestamp"`
}

type SessionUser struct {
	Name string `json:"name"`
	Role string `json:"role"`
}

type AuthSession struct {
	Enabled       bool         `json:"enabled"`
	Authenticated bool         `json:"authenticated"`
	User          *SessionUser `json:"user,omitempty"`
	Permissions   []string     `json:"permissions"`
}

type AuditEntry struct {
	ID         string `json:"id"`
	Timestamp  string `json:"timestamp"`
	RequestID  string `json:"requestId,omitempty"`
	Method     string `json:"method"`
	Path       string `json:"path"`
	Route      string `json:"route,omitempty"`
	Action     string `json:"action,omitempty"`
	Status     int    `json:"status"`
	DurationMs int64  `json:"durationMs"`
	Bytes      int64  `json:"bytes"`
	ClientIP   string `json:"clientIp,omitempty"`
	User       string `json:"user,omitempty"`
	Role       string `json:"role,omitempty"`
	Success    bool   `json:"success"`
}

type AuditLogResponse struct {
	Total int          `json:"total"`
	Items []AuditEntry `json:"items"`
}

type StreamEvent struct {
	Type      string `json:"type"`
	Timestamp string `json:"timestamp"`
	Payload   any    `json:"payload"`
}

type ClusterContext struct {
	Name          string `json:"name"`
	IsRealCluster bool   `json:"isRealCluster"`
}

type ClusterContextList struct {
	Selected string           `json:"selected"`
	Items    []ClusterContext `json:"items"`
}

type ClusterSelectRequest struct {
	Name string `json:"name"`
}

type ClusterSelectResponse struct {
	Selected string `json:"selected"`
}

type AlertChannelResult struct {
	Channel string `json:"channel"`
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

type AlertDispatchRequest struct {
	Title    string   `json:"title"`
	Message  string   `json:"message"`
	Severity string   `json:"severity,omitempty"`
	Source   string   `json:"source,omitempty"`
	Tags     []string `json:"tags,omitempty"`
}

type AlertDispatchResponse struct {
	Success bool                 `json:"success"`
	Results []AlertChannelResult `json:"results"`
}
