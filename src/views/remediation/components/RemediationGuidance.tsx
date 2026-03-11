import type { RemediationProposal } from "../../../types";
import { displayResource } from "../utils";

interface RemediationGuidanceProps {
  selectedProposal: RemediationProposal | null;
  queueHead: RemediationProposal | null;
}

export function RemediationGuidance({ selectedProposal, queueHead }: RemediationGuidanceProps) {
  return (
    <>
      {selectedProposal && (
        <div className="rounded-md border border-[#3b82f6]/40 bg-[#3b82f6]/12 px-3 py-2 text-sm text-zinc-100">
          Deep-link selected proposal: <span className="font-semibold">{selectedProposal.id}</span>
        </div>
      )}

      {queueHead && (
        <section className="surface p-3">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Operator guidance</p>
          <p className="mt-1 text-sm text-zinc-200">
            {queueHead.status === "proposed"
              ? `Top priority: review and approve ${queueHead.id} (${displayResource(queueHead)}).`
              : `Top priority: validate and execute ${queueHead.id} (${displayResource(queueHead)}).`}
          </p>
        </section>
      )}
    </>
  );
}
