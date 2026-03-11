import type { RemediationProposal } from "../../../types";

interface RejectModalProps {
  rejectingID: string | null;
  rejectReason: string;
  isActing: boolean;
  onRejectReasonChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RejectModal({
  rejectingID,
  rejectReason,
  isActing,
  onRejectReasonChange,
  onCancel,
  onConfirm,
}: RejectModalProps) {
  if (!rejectingID) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg app-shell p-4">
        <p className="text-sm font-semibold text-zinc-100">Reject Proposal {rejectingID}</p>
        <textarea
          value={rejectReason}
          onChange={(event) => onRejectReasonChange(event.target.value)}
          className="field mt-3 w-full min-h-28"
          placeholder="Reason for rejection"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onCancel} className="btn">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isActing || rejectReason.trim() === ""} className="btn-primary">
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

interface ExecuteModalProps {
  executing: RemediationProposal | null;
  canWrite: boolean;
  isActing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ExecuteModal({ executing, canWrite, isActing, onCancel, onConfirm }: ExecuteModalProps) {
  if (!executing) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl app-shell p-4">
        <p className="text-sm font-semibold text-zinc-100">Execute Proposal {executing.id}?</p>
        <p className="mt-2 text-sm text-zinc-300">Review dry-run output before execution:</p>
        <pre className="mt-2 overflow-x-auto rounded-md border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-200 whitespace-pre-wrap">
          {executing.dryRunResult}
        </pre>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onCancel} className="btn">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isActing || !canWrite} className="btn-primary">
            Confirm Execute
          </button>
        </div>
      </div>
    </div>
  );
}
