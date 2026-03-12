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
	NodeName  string    `json:"nodeName,omitempty"`
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
	Name          string     `json:"name"`
	Status        NodeStatus `json:"status"`
	Roles         string     `json:"roles"`
	Unschedulable bool       `json:"unschedulable,omitempty"`
	Age           string     `json:"age"`
	Version       string     `json:"version"`
	CPUUsage      string     `json:"cpuUsage"`
	MemUsage      string     `json:"memUsage"`
	CPUHistory    []CPUPoint `json:"cpuHistory,omitempty"`
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

type NodeDrainPod struct {
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
	Reason    string `json:"reason,omitempty"`
}

type NodeDrainBlocker struct {
	Kind      string       `json:"kind"`
	Message   string       `json:"message"`
	Pod       NodeDrainPod `json:"pod"`
	Reference string       `json:"reference,omitempty"`
}

type NodeDrainPreview struct {
	Node        string             `json:"node"`
	Evictable   []NodeDrainPod     `json:"evictable"`
	Skipped     []NodeDrainPod     `json:"skipped"`
	Blockers    []NodeDrainBlocker `json:"blockers"`
	SafeToDrain bool               `json:"safeToDrain"`
	GeneratedAt string             `json:"generatedAt"`
}

type NodeDrainRequest struct {
	Force bool `json:"force"`
}

type K8sEvent struct {
	Type          string `json:"type"`
	Reason        string `json:"reason"`
	Age           string `json:"age"`
	From          string `json:"from"`
	Message       string `json:"message"`
	Namespace     string `json:"namespace,omitempty"`
	Resource      string `json:"resource,omitempty"`
	ResourceKind  string `json:"resourceKind,omitempty"`
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

type RuntimeStatus struct {
	Mode                string   `json:"mode"`
	DevMode             bool     `json:"devMode"`
	Insecure            bool     `json:"insecure"`
	IsRealCluster       bool     `json:"isRealCluster"`
	AuthEnabled         bool     `json:"authEnabled"`
	WriteActionsEnabled bool     `json:"writeActionsEnabled"`
	PredictorEnabled    bool     `json:"predictorEnabled"`
	PredictorHealthy    bool     `json:"predictorHealthy"`
	PredictorLastError  string   `json:"predictorLastError,omitempty"`
	AssistantEnabled    bool     `json:"assistantEnabled"`
	RAGEnabled          bool     `json:"ragEnabled"`
	AlertsEnabled       bool     `json:"alertsEnabled"`
	Warnings            []string `json:"warnings"`
}

type HealthCheck struct {
	Name        string `json:"name"`
	OK          bool   `json:"ok"`
	Message     string `json:"message"`
	LastSuccess string `json:"lastSuccess,omitempty"`
	LastFailure string `json:"lastFailure,omitempty"`
}

type HealthStatus struct {
	Status    string        `json:"status"`
	Timestamp string        `json:"timestamp"`
	Checks    []HealthCheck `json:"checks"`
	Build     BuildInfo     `json:"build"`
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
	Resource       string             `json:"resource,omitempty"`
	Namespace      string             `json:"namespace,omitempty"`
	Message        string             `json:"message"`
	Evidence       []string           `json:"evidence,omitempty"`
	Recommendation string             `json:"recommendation"`
	Source         string             `json:"source,omitempty"`
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

type IncidentStatus string

const (
	IncidentStatusOpen     IncidentStatus = "open"
	IncidentStatusResolved IncidentStatus = "resolved"
)

type RunbookStepStatus string

const (
	RunbookStepStatusPending    RunbookStepStatus = "pending"
	RunbookStepStatusInProgress RunbookStepStatus = "in_progress"
	RunbookStepStatusDone       RunbookStepStatus = "done"
	RunbookStepStatusSkipped    RunbookStepStatus = "skipped"
)

type TimelineEntryKind string

const (
	TimelineEntryKindDiagnostic TimelineEntryKind = "diagnostic"
	TimelineEntryKindEvent      TimelineEntryKind = "event"
	TimelineEntryKindPrediction TimelineEntryKind = "prediction"
	TimelineEntryKindAction     TimelineEntryKind = "action"
)

type TimelineEntry struct {
	Timestamp string            `json:"timestamp"`
	Kind      TimelineEntryKind `json:"kind"`
	Source    string            `json:"source"`
	Summary   string            `json:"summary"`
	Resource  string            `json:"resource"`
	Severity  string            `json:"severity"`
}

type RunbookStep struct {
	ID          string            `json:"id"`
	Title       string            `json:"title"`
	Description string            `json:"description"`
	Command     string            `json:"command"`
	Status      RunbookStepStatus `json:"status"`
	Mandatory   bool              `json:"mandatory"`
}

type Incident struct {
	ID                       string          `json:"id"`
	Title                    string          `json:"title"`
	Severity                 string          `json:"severity"`
	Status                   IncidentStatus  `json:"status"`
	Summary                  string          `json:"summary"`
	OpenedAt                 string          `json:"openedAt"`
	ResolvedAt               string          `json:"resolvedAt"`
	Timeline                 []TimelineEntry `json:"timeline"`
	Runbook                  []RunbookStep   `json:"runbook"`
	AffectedResources        []string        `json:"affectedResources"`
	AssociatedRemediationIDs []string        `json:"associatedRemediationIds"`
}

type IncidentStepStatusPatch struct {
	Status RunbookStepStatus `json:"status"`
}

type RemediationKind string

const (
	RemediationKindRestartPod         RemediationKind = "restart_pod"
	RemediationKindCordonNode         RemediationKind = "cordon_node"
	RemediationKindRollbackDeployment RemediationKind = "rollback_deployment"
)

type RemediationProposal struct {
	ID              string          `json:"id"`
	Kind            RemediationKind `json:"kind"`
	Status          string          `json:"status"`
	IncidentID      string          `json:"incidentId"`
	Resource        string          `json:"resource"`
	Namespace       string          `json:"namespace"`
	Reason          string          `json:"reason"`
	RiskLevel       string          `json:"riskLevel"`
	DryRunResult    string          `json:"dryRunResult"`
	ExecutionResult string          `json:"executionResult"`
	CreatedAt       string          `json:"createdAt"`
	UpdatedAt       string          `json:"updatedAt"`
	ApprovedBy      string          `json:"approvedBy"`
	ApprovedAt      string          `json:"approvedAt"`
	RejectedBy      string          `json:"rejectedBy"`
	RejectedAt      string          `json:"rejectedAt"`
	RejectedReason  string          `json:"rejectedReason"`
	ExecutedBy      string          `json:"executedBy"`
	ExecutedAt      string          `json:"executedAt"`
}

type RemediationRejectRequest struct {
	Reason string `json:"reason"`
}

type MemoryRunbook struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Tags        []string `json:"tags"`
	Description string   `json:"description"`
	Steps       []string `json:"steps"`
	UsageCount  int      `json:"usageCount"`
	CreatedAt   string   `json:"createdAt"`
	UpdatedAt   string   `json:"updatedAt"`
}

type MemoryRunbookUpsertRequest struct {
	Title       string   `json:"title"`
	Tags        []string `json:"tags"`
	Description string   `json:"description"`
	Steps       []string `json:"steps"`
}

type MemoryFixPattern struct {
	ID          string          `json:"id"`
	IncidentID  string          `json:"incidentId"`
	ProposalID  string          `json:"proposalId"`
	Title       string          `json:"title"`
	Description string          `json:"description"`
	Resource    string          `json:"resource"`
	Kind        RemediationKind `json:"kind"`
	RecordedBy  string          `json:"recordedBy"`
	RecordedAt  string          `json:"recordedAt"`
}

type MemoryFixCreateRequest struct {
	IncidentID  string          `json:"incidentId"`
	ProposalID  string          `json:"proposalId"`
	Title       string          `json:"title"`
	Description string          `json:"description"`
	Resource    string          `json:"resource"`
	Kind        RemediationKind `json:"kind"`
}

type RiskCheck struct {
	Name       string `json:"name"`
	Passed     bool   `json:"passed"`
	Detail     string `json:"detail"`
	Suggestion string `json:"suggestion"`
	Score      int    `json:"score"`
}

type RiskReport struct {
	Score   int         `json:"score"`
	Level   string      `json:"level"`
	Summary string      `json:"summary"`
	Checks  []RiskCheck `json:"checks"`
}

type RiskAnalyzeRequest struct {
	Manifest string `json:"manifest"`
}

type ResourceApplyRiskResponse struct {
	Message       string     `json:"message"`
	RequiresForce bool       `json:"requiresForce"`
	Report        RiskReport `json:"report"`
}

type PostmortemMethod string

const (
	PostmortemMethodTemplate PostmortemMethod = "template"
	PostmortemMethodAI       PostmortemMethod = "ai"
)

type Postmortem struct {
	ID               string           `json:"id"`
	IncidentID       string           `json:"incidentId"`
	IncidentTitle    string           `json:"incidentTitle"`
	Severity         string           `json:"severity"`
	OpenedAt         string           `json:"openedAt"`
	ResolvedAt       string           `json:"resolvedAt"`
	Duration         string           `json:"duration"`
	GeneratedAt      string           `json:"generatedAt"`
	Method           PostmortemMethod `json:"method"`
	RootCause        string           `json:"rootCause"`
	Impact           string           `json:"impact"`
	Prevention       string           `json:"prevention"`
	TimelineMarkdown string           `json:"timelineMarkdown"`
	RunbookMarkdown  string           `json:"runbookMarkdown"`
	Timeline         []TimelineEntry  `json:"timeline"`
	Runbook          []RunbookStep    `json:"runbook"`
}

type DocumentationReference struct {
	Title   string `json:"title"`
	URL     string `json:"url"`
	Source  string `json:"source"`
	Snippet string `json:"snippet,omitempty"`
}

type RAGResultTrace struct {
	Title         string  `json:"title"`
	URL           string  `json:"url"`
	Source        string  `json:"source"`
	FinalScore    float64 `json:"finalScore"`
	LexicalScore  float64 `json:"lexicalScore"`
	SemanticScore float64 `json:"semanticScore"`
	CoverageScore float64 `json:"coverageScore"`
	SourceBoost   float64 `json:"sourceBoost"`
	FeedbackBoost float64 `json:"feedbackBoost"`
}

type RAGQueryTrace struct {
	Timestamp      string           `json:"timestamp"`
	Query          string           `json:"query"`
	QueryTerms     []string         `json:"queryTerms"`
	UsedSemantic   bool             `json:"usedSemantic"`
	CandidateCount int              `json:"candidateCount"`
	ResultCount    int              `json:"resultCount"`
	DurationMs     float64          `json:"durationMs"`
	TopResults     []RAGResultTrace `json:"topResults"`
}

type RAGDocFeedback struct {
	URL        string `json:"url"`
	Helpful    uint64 `json:"helpful"`
	NotHelpful uint64 `json:"notHelpful"`
	NetScore   int64  `json:"netScore"`
	UpdatedAt  string `json:"updatedAt"`
}

type RAGTelemetry struct {
	Enabled          bool             `json:"enabled"`
	IndexedAt        string           `json:"indexedAt"`
	ExpiresAt        string           `json:"expiresAt"`
	TotalQueries     uint64           `json:"totalQueries"`
	EmptyResults     uint64           `json:"emptyResults"`
	HitRate          float64          `json:"hitRate"`
	AverageResults   float64          `json:"averageResults"`
	FeedbackSignals  uint64           `json:"feedbackSignals"`
	PositiveFeedback uint64           `json:"positiveFeedback"`
	NegativeFeedback uint64           `json:"negativeFeedback"`
	TopFeedbackDocs  []RAGDocFeedback `json:"topFeedbackDocs"`
	RecentQueries    []RAGQueryTrace  `json:"recentQueries"`
}

type AssistantReferenceFeedbackRequest struct {
	Query   string `json:"query"`
	URL     string `json:"url"`
	Helpful bool   `json:"helpful"`
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
