import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../lib/api";
import type { AssistantResponse, DiagnosticsResult, DiagnosticIssue } from "../../../types";
import type { AssistantMessage } from "../types";

export const basePrompts = [
  "Diagnose payment-gateway",
  "Show cluster health",
  "What should I fix first?",
  "Show failed pods",
  "Generate deployment manifest",
] as const;

const initialAssistantMessageTemplate: Omit<AssistantMessage, "id" | "timestamp"> = {
  role: "assistant",
  content: "Assistant is ready. Ask for diagnostics, root causes, and concrete next actions.",
  hints: [...basePrompts],
};

export function useAssistantChat() {
  const [messages, setMessages] = useState<AssistantMessage[]>([createAssistantIntroMessage()]);
  const [isLoading, setIsLoading] = useState(false);
  const diagnosticsLoaded = useRef(false);

  useEffect(() => {
    if (diagnosticsLoaded.current) {
      return;
    }
    diagnosticsLoaded.current = true;
    let cancelled = false;

    const loadDiagnostics = async () => {
      try {
        const diagnostics = await api.getDiagnostics();
        if (cancelled) {
          return;
        }
        const intro = buildDiagnosticsIntroMessage(diagnostics);
        if (!intro) {
          return;
        }
        setMessages((state) => [...state, intro]);
      } catch {
        // Ignore diagnostics preload failures.
      }
    };

    void loadDiagnostics();
    return () => {
      cancelled = true;
    };
  }, []);

  const lastAssistant = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant" && !message.isError),
    [messages],
  );

  const suggestionPool = useMemo(() => {
    const fromHints = lastAssistant?.hints ?? [];
    const fromResources = (lastAssistant?.resources ?? []).map((resource) => toDiagnosePrompt(resource));
    return dedupeStrings([...basePrompts, ...fromHints, ...fromResources]).slice(0, 10);
  }, [lastAssistant?.hints, lastAssistant?.resources]);

  const send = async (content: string, namespace?: string) => {
    const message = content.trim();
    if (message === "" || isLoading) {
      return;
    }

    const userMessage: AssistantMessage = {
      id: createID(),
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
    };
    setMessages((state) => [...state, userMessage]);
    setIsLoading(true);

    try {
      const response: AssistantResponse = await api.askAssistant(message, namespace);
      const assistantMessage: AssistantMessage = {
        id: createID(),
        role: "assistant",
        content: response.answer,
        timestamp: response.timestamp,
        query: message,
        hints: response.hints,
        resources: response.referencedResources,
        references: response.references,
      };
      setMessages((state) => [...state, assistantMessage]);
    } catch (err) {
      setMessages((state) => [
        ...state,
        {
          id: createID(),
          role: "assistant",
          isError: true,
          content: `Request failed: ${err instanceof Error ? err.message : "Unknown error"}`,
          timestamp: new Date().toISOString(),
          hints: ["Show cluster health", "What should I fix first?"],
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const clear = () => {
    setMessages([createAssistantIntroMessage()]);
  };

  return {
    messages,
    isLoading,
    lastAssistant,
    suggestionPool,
    send,
    clear,
  };
}

function createAssistantIntroMessage(): AssistantMessage {
  return {
    id: createID(),
    timestamp: new Date().toISOString(),
    ...initialAssistantMessageTemplate,
  };
}

function buildDiagnosticsIntroMessage(diagnostics: DiagnosticsResult): AssistantMessage | null {
  const issues = diagnostics.issues ?? [];
  const visibleIssues = issues.filter((issue) => issue.severity !== "info");

  const lines: string[] = [];
  if (visibleIssues.length === 0) {
    lines.push("Diagnostics check is clean. No critical or warning issues detected.");
  } else {
    lines.push(
      `I can see ${diagnostics.criticalIssues} critical and ${diagnostics.warningIssues} warning issues in this cluster.`,
    );
    lines.push("");
    lines.push("Top findings:");
    for (const issue of visibleIssues.slice(0, 3)) {
      lines.push(formatIssueLine(issue));
    }
    lines.push("");
    lines.push("Want me to investigate any of these?");
  }

  const resources = issues
    .map((issue) => issue.resource)
    .filter((resource): resource is string => typeof resource === "string" && resource.trim() !== "");

  const hints = visibleIssues.length
    ? ["What should I fix first?", "Show failed pods", "Show node risks"]
    : ["Show cluster health", "What should I fix first?"];

  return {
    id: createID(),
    role: "assistant",
    content: lines.join("\n"),
    timestamp: new Date().toISOString(),
    hints,
    resources,
  };
}

function formatIssueLine(issue: DiagnosticIssue): string {
  const resource = issue.resource ? ` (${issue.resource})` : "";
  const evidence = (issue.evidence ?? []).join(" | ");
  return `- ${issue.message}${resource}: ${evidence || "no evidence captured yet"}`;
}

function dedupeStrings(values: readonly string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (normalized === "") {
      continue;
    }
    if (!out.includes(normalized)) {
      out.push(normalized);
    }
  }
  return out;
}

function toDiagnosePrompt(resource: string): string {
  const trimmed = resource.trim();
  if (trimmed === "") {
    return "Show cluster health";
  }
  const podName = trimmed.includes("/") ? (trimmed.split("/").pop() ?? trimmed) : trimmed;
  return `Diagnose ${podName}`;
}

function createID(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
