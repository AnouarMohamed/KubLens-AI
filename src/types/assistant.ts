export interface AssistantResponse {
  answer: string;
  hints: string[];
  referencedResources: string[];
  references?: Array<{
    title: string;
    url: string;
    source: string;
    snippet?: string;
  }>;
  timestamp: string;
}

export interface AssistantReferenceFeedbackRequest {
  query: string;
  url: string;
  helpful: boolean;
}

export interface RAGResultTrace {
  title: string;
  url: string;
  source: string;
  finalScore: number;
  lexicalScore: number;
  semanticScore: number;
  coverageScore: number;
  sourceBoost: number;
  feedbackBoost: number;
}

export interface RAGQueryTrace {
  timestamp: string;
  query: string;
  queryTerms: string[];
  usedSemantic: boolean;
  candidateCount: number;
  resultCount: number;
  durationMs: number;
  topResults: RAGResultTrace[];
}

export interface RAGDocFeedback {
  url: string;
  helpful: number;
  notHelpful: number;
  netScore: number;
  updatedAt: string;
}

export interface RAGTelemetry {
  enabled: boolean;
  indexedAt: string;
  expiresAt: string;
  totalQueries: number;
  emptyResults: number;
  hitRate: number;
  averageResults: number;
  feedbackSignals: number;
  positiveFeedback: number;
  negativeFeedback: number;
  topFeedbackDocs: RAGDocFeedback[];
  recentQueries: RAGQueryTrace[];
}

export interface RAGMetricsSummary {
  enabled: boolean;
  totalQueries: number;
  emptyResults: number;
  hitRate: number;
  averageResults: number;
  feedbackSignals: number;
  positiveFeedback: number;
  negativeFeedback: number;
}
