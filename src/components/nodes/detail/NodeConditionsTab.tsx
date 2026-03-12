import type { NodeDetail } from "../../../types";

interface NodeConditionsTabProps {
  selectedNode: NodeDetail;
}

export function NodeConditionsTab({ selectedNode }: NodeConditionsTabProps) {
  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Conditions</p>
      <div className="mt-2 rounded-md border border-zinc-800 overflow-hidden">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Reason</th>
              <th className="px-4 py-3 font-semibold">Last Transition</th>
              <th className="px-4 py-3 font-semibold">Message</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 text-zinc-200">
            {selectedNode.conditions.map((condition) => (
              <tr key={`${condition.type}-${condition.reason}`}>
                <td className="px-4 py-3 font-medium">{condition.type}</td>
                <td className="px-4 py-3">{condition.status}</td>
                <td className="px-4 py-3 text-zinc-400">{condition.reason || "-"}</td>
                <td className="px-4 py-3 text-zinc-400">{condition.lastTransitionTime || "-"}</td>
                <td className="px-4 py-3 text-zinc-400">{condition.message || "-"}</td>
              </tr>
            ))}
            {selectedNode.conditions.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-zinc-500" colSpan={5}>
                  No condition rows available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">Addresses</p>
      <div className="mt-2 rounded-md border border-zinc-800 divide-y divide-zinc-800">
        {selectedNode.addresses.map((address) => (
          <div
            key={`${address.type}-${address.address}`}
            className="px-4 py-2 text-sm flex items-center justify-between gap-3"
          >
            <span className="font-medium text-zinc-100">{address.type}</span>
            <span className="text-zinc-400">{address.address}</span>
          </div>
        ))}
        {selectedNode.addresses.length === 0 && (
          <p className="px-4 py-3 text-sm text-zinc-500">No address rows available.</p>
        )}
      </div>
    </section>
  );
}
