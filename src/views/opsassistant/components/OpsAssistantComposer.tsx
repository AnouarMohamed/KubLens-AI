import type { AssistantIntent } from "../constants";

interface OpsAssistantComposerProps {
  input: string;
  intentMode: AssistantIntent;
  isLoading: boolean;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
}

export function OpsAssistantComposer({
  input,
  intentMode,
  isLoading,
  onInputChange,
  onSubmit,
}: OpsAssistantComposerProps) {
  return (
    <footer className="border-t border-zinc-700 px-5 py-4 bg-zinc-900">
      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.key === "Enter" && !event.shiftKey) || (event.key === "Enter" && event.ctrlKey)) {
              event.preventDefault();
              onSubmit();
            }
          }}
          placeholder="Ask for diagnostics, root cause analysis, manifest templates, or action priorities"
          className="field min-h-11 h-11 max-h-32 flex-1 resize-y py-2"
        />
        <button onClick={onSubmit} disabled={!input.trim() || isLoading} className="btn-solid h-11 px-5">
          Send
        </button>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">
        Enter to send. Shift+Enter for newline. Current mode: {intentMode}.
      </p>
    </footer>
  );
}
