import { useEffect, useMemo, useRef, useState, type KeyboardEventHandler } from "react";
import { api } from "../../lib/api";
import type { TerminalExecResponse } from "../../types";

interface TerminalEntry {
  id: number;
  command: string;
  cwd: string;
  running: boolean;
  response?: TerminalExecResponse;
  error?: string;
}

const QUICK_COMMANDS = [
  "kubectl get pods -A",
  "kubectl get nodes",
  "kubectl top pods -A",
  "kubectl get events -A --sort-by=.metadata.creationTimestamp | Select-Object -Last 20",
];

export default function Terminal() {
  const [cwd, setCwd] = useState("");
  const [command, setCommand] = useState("");
  const [timeoutSeconds, setTimeoutSeconds] = useState(10);
  const [entries, setEntries] = useState<TerminalEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [counter, setCounter] = useState(1);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!outputRef.current) {
      return;
    }
    outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [entries]);

  const prompt = useMemo(() => {
    if (cwd.trim() === "") {
      return "k8s-ops:/";
    }
    return `k8s-ops:${cwd}`;
  }, [cwd]);

  const runCommand = async (value?: string) => {
    const runValue = (value ?? command).trim();
    if (runValue === "" || isRunning) {
      return;
    }

    const entryID = counter;
    setCounter((prev) => prev + 1);
    setIsRunning(true);
    setCommand("");
    setHistory((prev) => [runValue, ...prev.filter((item) => item !== runValue)].slice(0, 100));
    setHistoryIndex(null);

    const nextEntry: TerminalEntry = {
      id: entryID,
      command: runValue,
      cwd,
      running: true,
    };
    setEntries((prev) => [...prev, nextEntry]);

    try {
      const response = await api.execTerminal({
        command: runValue,
        cwd: cwd.trim() || undefined,
        timeoutSeconds,
      });
      setEntries((prev) =>
        prev.map((entry) => (entry.id === entryID ? { ...entry, running: false, response, cwd: response.cwd } : entry)),
      );
      if (cwd.trim() === "") {
        setCwd(response.cwd);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Terminal execution failed";
      setEntries((prev) => prev.map((entry) => (entry.id === entryID ? { ...entry, running: false, error: message } : entry)));
    } finally {
      setIsRunning(false);
    }
  };

  const onCommandKeyDown: KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void runCommand();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (history.length === 0) {
        return;
      }
      const nextIndex = historyIndex === null ? 0 : Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(nextIndex);
      setCommand(history[nextIndex] ?? "");
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (history.length === 0) {
        return;
      }
      if (historyIndex === null) {
        return;
      }
      const nextIndex = historyIndex - 1;
      if (nextIndex < 0) {
        setHistoryIndex(null);
        setCommand("");
        return;
      }
      setHistoryIndex(nextIndex);
      setCommand(history[nextIndex] ?? "");
    }
  };

  return (
    <div className="space-y-4">
      <header className="panel-head">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">Cluster Terminal</h2>
          <p className="text-sm text-zinc-500 mt-1">Run live shell commands from the dashboard runtime.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500">
            Timeout (s)
            <input
              value={timeoutSeconds}
              onChange={(event) => setTimeoutSeconds(Number.parseInt(event.target.value, 10) || 10)}
              type="number"
              min={2}
              max={30}
              className="field-sm ml-2 w-20"
            />
          </label>
          <button
            onClick={() => setEntries([])}
            className="btn h-9"
          >
            Clear
          </button>
        </div>
      </header>

      <section className="surface p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {QUICK_COMMANDS.map((item) => (
            <button
              key={item}
              onClick={() => {
                setCommand(item);
                void runCommand(item);
              }}
              disabled={isRunning}
              className="btn-sm bg-zinc-950"
            >
              {item}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_2.5fr_auto] gap-2">
          <input
            value={cwd}
            onChange={(event) => setCwd(event.target.value)}
            placeholder="Working directory (optional)"
            className="field"
          />
          <input
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            onKeyDown={onCommandKeyDown}
            placeholder="Type command and press Enter"
            className="field"
          />
          <button
            onClick={() => void runCommand()}
            disabled={isRunning || command.trim() === ""}
            className="btn-primary"
          >
            {isRunning ? "Running..." : "Run"}
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-zinc-800 bg-black">
        <header className="border-b border-zinc-800 bg-black px-4 py-2">
          <p className="font-mono text-xs text-zinc-400">{prompt}</p>
        </header>
        <div ref={outputRef} className="h-[58vh] overflow-y-auto bg-black p-4 font-mono text-[13px] leading-relaxed text-[#d8f8d0]">
          {entries.length === 0 && <p className="text-zinc-500">No commands yet. Start with `kubectl get pods -A`.</p>}

          {entries.map((entry) => (
            <div key={entry.id} className="mb-4">
              <p className="text-[#e5e7eb]">
                <span className="text-[#2496ed]">$</span> {entry.command}
              </p>

              {entry.running && <p className="text-zinc-500">running...</p>}

              {entry.error && <p className="text-[#f87171]">{entry.error}</p>}

              {entry.response && (
                <>
                  {entry.response.stdout.trim() !== "" && <pre className="whitespace-pre-wrap text-[#d8f8d0]">{entry.response.stdout}</pre>}
                  {entry.response.stderr.trim() !== "" && <pre className="whitespace-pre-wrap text-[#fca5a5]">{entry.response.stderr}</pre>}
                  {entry.response.stdout.trim() === "" && entry.response.stderr.trim() === "" && <p className="text-zinc-500">(no output)</p>}
                  <p className="text-[11px] text-zinc-500">
                    exit {entry.response.exitCode} | {entry.response.durationMs}ms | {entry.response.cwd}
                  </p>
                </>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

