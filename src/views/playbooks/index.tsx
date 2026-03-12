interface Playbook {
  id: string;
  title: string;
  whenToUse: string;
  primaryGoal: string;
  commands: string[];
  steps: string[];
  verify: string[];
}

const PLAYBOOKS: Playbook[] = [
  {
    id: "node-pressure",
    title: "Node Pressure Recovery",
    whenToUse: "Node shows MemoryPressure, DiskPressure, or repeated NotReady transitions.",
    primaryGoal: "Stabilize scheduling and reduce noisy evictions before workloads are impacted cluster-wide.",
    commands: [
      "kubectl describe node <node>",
      "kubectl top node <node>",
      "kubectl get pods -A --field-selector spec.nodeName=<node>",
      "kubectl drain <node> --ignore-daemonsets --delete-emptydir-data --dry-run=server",
    ],
    steps: [
      "Cordon the node to stop new workload placement.",
      "Preview drain blockers (PDBs/system pods) and decide whether maintenance can proceed safely.",
      "Drain non-system workloads and verify critical services reschedule cleanly.",
      "Escalate to force drain only with explicit reason and change approval.",
    ],
    verify: [
      "Node conditions return to healthy (no pressure conditions).",
      "Evicted pods are Running on alternate nodes.",
      "No repeated Warning events tied to the drained node after 10 minutes.",
    ],
  },
  {
    id: "crash-loop",
    title: "CrashLoopBackOff Burst",
    whenToUse: "Multiple pods restart repeatedly in one namespace or service tier.",
    primaryGoal: "Contain blast radius quickly and recover service by finding the first failing dependency.",
    commands: [
      "kubectl get pods -A | findstr CrashLoopBackOff",
      "kubectl logs <pod> -n <namespace> --previous --tail=200",
      "kubectl describe pod <pod> -n <namespace>",
      "kubectl rollout history deployment/<deployment> -n <namespace>",
    ],
    steps: [
      "Group failing pods by deployment and identify the first restart time.",
      "Check image/config/secret changes landed immediately before the failures.",
      "Rollback or restart only the affected workload group; avoid whole-cluster actions.",
      "Record the confirmed fix pattern in Cluster Memory.",
    ],
    verify: [
      "Restart count stops increasing for 15 minutes.",
      "Service-level error rate returns to baseline.",
      "Predictions view no longer ranks the same workload as high risk.",
    ],
  },
  {
    id: "alert-fatigue",
    title: "Alert Fatigue Control",
    whenToUse: "Node rule alerts repeat faster than the team can act on them.",
    primaryGoal: "Preserve signal quality by acknowledging, snoozing, or dismissing with intent.",
    commands: [
      "kubectl get events -A --sort-by=.metadata.creationTimestamp",
      "kubectl describe node <node>",
    ],
    steps: [
      "Acknowledge alerts with a known, active mitigation in progress.",
      "Snooze alerts during maintenance windows with a bounded duration.",
      "Dismiss stale alerts only when root cause is resolved and verified.",
      "Reopen dismissed alerts immediately if the symptom returns.",
    ],
    verify: [
      "Alert queue reflects active risks, not historical noise.",
      "Snoozed alerts automatically return to active after expiry.",
      "Audit trail captures operator actions for review.",
    ],
  },
];

export default function Playbooks() {
  return (
    <div className="space-y-5">
      <header className="panel-head">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">Playbooks</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Practical response guides for recurring incidents, optimized for fast triage and safe execution.
          </p>
        </div>
      </header>

      <section className="rounded-md border border-zinc-800 bg-zinc-900/60 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Usage model</p>
        <p className="mt-2 text-sm text-zinc-300">
          Pick a playbook by symptom, execute commands in sequence, and validate outcomes before closing the incident.
        </p>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {PLAYBOOKS.map((playbook) => (
          <article key={playbook.id} className="rounded-md border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
            <div>
              <h3 className="text-lg font-semibold text-zinc-100">{playbook.title}</h3>
              <p className="mt-1 text-sm text-zinc-400">{playbook.whenToUse}</p>
            </div>

            <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Primary goal</p>
              <p className="mt-1 text-sm text-zinc-200">{playbook.primaryGoal}</p>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Command sequence</p>
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
        ))}
      </div>
    </div>
  );
}
