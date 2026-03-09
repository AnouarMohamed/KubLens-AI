import ReactMarkdown from "react-markdown";
import type { AssistantMessage as Message } from "../types";

interface Props {
  message: Message;
  copied: boolean;
  onCopy: (message: Message) => void;
  onRunPrompt: (prompt: string) => void;
}

export default function AssistantMessage({ message, copied, onCopy, onRunPrompt }: Props) {
  return (
    <article className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[92%] lg:max-w-[86%]">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">
            {message.role === "user" ? "Operator" : "Assistant"}
          </p>
          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
            <span>{formatTimestamp(message.timestamp)}</span>
            {message.role === "assistant" && (
              <button onClick={() => onCopy(message)} className="hover:text-zinc-300">
                {copied ? "Copied" : "Copy"}
              </button>
            )}
          </div>
        </div>

        <div
          className={`rounded-lg border px-3.5 py-3 text-sm leading-relaxed ${
            message.role === "user"
              ? "border-[#00d4a8]/55 bg-[#00d4a8]/14 text-zinc-100"
              : message.isError
                ? "border-[#ff4444]/45 bg-[#ff4444]/12 text-zinc-100"
                : "border-zinc-700 bg-zinc-800/55 text-zinc-200"
          }`}
        >
          {message.role === "assistant" ? (
            <AssistantContent content={message.content} />
          ) : (
            <p className="whitespace-pre-wrap">{message.content}</p>
          )}
        </div>

        {message.role === "assistant" && ((message.hints?.length ?? 0) > 0 || (message.resources?.length ?? 0) > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {(message.hints ?? []).slice(0, 5).map((hint) => (
              <button key={`${message.id}-${hint}`} onClick={() => onRunPrompt(hint)} className="btn-sm bg-zinc-800/70">
                {hint}
              </button>
            ))}
            {(message.resources ?? []).slice(0, 4).map((resource) => (
              <button
                key={`${message.id}-${resource}`}
                onClick={() => onRunPrompt(toDiagnosePrompt(resource))}
                className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
              >
                {resource}
              </button>
            ))}
          </div>
        )}

        {message.role === "assistant" && (message.references?.length ?? 0) > 0 && (
          <div className="mt-2 rounded-md border border-zinc-700 bg-zinc-900/60 p-2">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-semibold">Documentation</p>
            <div className="mt-1.5 space-y-1.5">
              {message.references?.map((ref) => (
                <a
                  key={`${message.id}-${ref.url}`}
                  href={ref.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-md border border-zinc-700 bg-zinc-800/60 px-2 py-1.5 hover:bg-zinc-800"
                >
                  <p className="text-xs font-semibold text-zinc-100">{ref.title}</p>
                  <p className="text-[11px] text-zinc-500">{ref.source}</p>
                  {ref.snippet && <p className="text-[11px] text-zinc-300 mt-1 leading-relaxed">{ref.snippet}</p>}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function AssistantContent({ content }: { content: string }) {
  if (shouldRenderMarkdown(content)) {
    return (
      <div className="space-y-2">
        <ReactMarkdown
          components={{
            p: ({ children }) => <p className="text-sm text-zinc-200 leading-relaxed">{children}</p>,
            ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 text-zinc-200">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 text-zinc-200">{children}</ol>,
            li: ({ children }) => <li className="text-sm">{children}</li>,
            code: ({ children }) => {
              const text = String(children);
              const isInlineCode = !text.includes("\n");
              return isInlineCode ? (
                <code className="rounded bg-zinc-900 px-1 py-0.5 text-[12px] text-zinc-100">{children}</code>
              ) : (
                <code className="block whitespace-pre-wrap rounded-md border border-zinc-700 bg-zinc-900 p-2 text-[12px] text-zinc-100">
                  {children}
                </code>
              );
            },
            pre: ({ children }) => <pre className="overflow-x-auto">{children}</pre>,
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {content.split("\n").map((line, index) => (
        <AssistantLine key={index} line={line} />
      ))}
    </div>
  );
}

function AssistantLine({ line }: { line: string }) {
  const trimmed = line.trim();
  if (trimmed === "") {
    return <div className="h-1" />;
  }

  const severityMatch = trimmed.match(/^(CRITICAL|WARNING|INFO):\s*(.*)$/i);
  if (severityMatch) {
    const severity = severityMatch[1].toUpperCase();
    const details = severityMatch[2];
    const tone =
      severity === "CRITICAL"
        ? "border-[#ff4444]/45 bg-[#ff4444]/12"
        : severity === "WARNING"
          ? "border-[#eab308]/45 bg-[#eab308]/10"
          : "border-[#3b82f6]/45 bg-[#3b82f6]/10";

    return (
      <div className={`rounded-md border px-2 py-1.5 ${tone}`}>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-100">{severity}</span>
        {details && <p className="mt-1 text-sm text-zinc-100">{details}</p>}
      </div>
    );
  }

  if (/^Recommended action:/i.test(trimmed)) {
    return (
      <div className="rounded-md border border-zinc-700 bg-zinc-900/70 px-2 py-1.5">
        <p className="text-sm text-zinc-200">
          <span className="font-semibold text-zinc-100">Action:</span> {trimmed.replace(/^Recommended action:\s*/i, "")}
        </p>
      </div>
    );
  }

  return <p className="text-sm text-zinc-200 whitespace-pre-wrap">{line}</p>;
}

function shouldRenderMarkdown(content: string): boolean {
  return /```|^#{1,6}\s|\n-\s|\n\d+\.\s|`[^`]+`/m.test(content);
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString();
}

function toDiagnosePrompt(resource: string): string {
  const trimmed = resource.trim();
  if (trimmed === "") {
    return "Show cluster health";
  }
  const podName = trimmed.includes("/") ? (trimmed.split("/").pop() ?? trimmed) : trimmed;
  return `Diagnose ${podName}`;
}
