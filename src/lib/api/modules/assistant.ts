import type { ActionResult, AssistantReferenceFeedbackRequest, AssistantResponse, RAGTelemetry } from "../../../types";
import { apiRoute, requestJson } from "../core";

export const assistantApi = {
  askAssistant: (message: string, namespace?: string) =>
    requestJson<AssistantResponse>(apiRoute("/assistant"), {
      method: "POST",
      body: JSON.stringify({ message, namespace }),
    }),
  submitAssistantReferenceFeedback: (payload: AssistantReferenceFeedbackRequest) =>
    requestJson<ActionResult>(apiRoute("/assistant/references/feedback"), {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getRAGTelemetry: (limit = 24) =>
    requestJson<RAGTelemetry>(`${apiRoute("/rag/telemetry")}?limit=${encodeURIComponent(String(limit))}`),
};
