import { useState } from "react";
import type { Playbook, PlaybookDomain } from "../types";
import { domainLabel } from "../utils";

interface PlaybookCardProps {
  playbook: Playbook;
  domain: PlaybookDomain;
}

export function PlaybookCard({ playbook, domain }: PlaybookCardProps) {
  const [copyState, setCopyState] = useState<"idle" | "ok" | "err">("idle");

  const copyCommands = async () => {
    try {
      await navigator.clipboard.writeText(playbook.commands.join("\n"));
      setCopyState("ok");
      window.setTimeout(() => setCopyState("idle"), 1200);
    } catch {
      setCopyState("err");
      window.setTimeout(() => setCopyState("idle"), 1500);
    }
  };

  return (
    <article className="rounded-md border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-zinc-100">{playbook.title}</h3>
          <p className="mt-1 text-sm text-zinc-400">{playbook.whenToUse}</p>
        </div>
        <span className="rounded-md border border-zinc-700 bg-zinc-800/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-300">
          {domainLabel(domain)}
        </span>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Primary goal</p>
        <p className="mt-1 text-sm text-zinc-200">{playbook.primaryGoal}</p>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Command sequence</p>
          <button onClick={() => void copyCommands()} className="btn-sm border-zinc-600">
            {copyState === "idle" ? "Copy Commands" : copyState === "ok" ? "Copied" : "Copy Failed"}
          </button>
        </div>
        <pre className="mt-2 overflow-auto rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-200">
          {playbook.commands.join("\n")}
        </pre>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Execution steps</p>
        <ol className="mt-2 list-decimal pl-5 space-y-1 text-sm text-zinc-300">
          {playbook.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Exit criteria</p>
        <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-zinc-300">
          {playbook.verify.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </article>
  );
}
