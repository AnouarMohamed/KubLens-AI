package model

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
