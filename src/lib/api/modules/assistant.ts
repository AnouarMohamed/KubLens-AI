import type { ActionResult, AssistantReferenceFeedbackRequest, AssistantResponse, RAGTelemetry } from "../../../types";
import { apiPath, requestJson } from "../core";

export const assistantApi = {
  askAssistant: (message: string, namespace?: string) =>
    requestJson<AssistantResponse>(apiPath("assistant"), {
      method: "POST",
      body: JSON.stringify({ message, namespace }),
    }),
  submitAssistantReferenceFeedback: (payload: AssistantReferenceFeedbackRequest) =>
    requestJson<ActionResult>(apiPath("assistant", "references", "feedback"), {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getRAGTelemetry: (limit = 24) =>
    requestJson<RAGTelemetry>(`${apiPath("rag", "telemetry")}?limit=${encodeURIComponent(String(limit))}`),
};
