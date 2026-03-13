export interface PredictionSignal {
  key: string;
  value: string;
}

export interface IncidentPrediction {
  id: string;
  resourceKind: string;
  resource: string;
  namespace?: string;
  riskScore: number;
  confidence: number;
  summary: string;
  recommendation: string;
  signals?: PredictionSignal[];
}

export interface PredictionsResult {
  source: string;
  generatedAt: string;
  items: IncidentPrediction[];
}
