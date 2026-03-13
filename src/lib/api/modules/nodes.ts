import type { ActionResult, K8sEvent, Node, NodeDetail, NodeDrainPreview, Pod } from "../../../types";
import { apiPath, requestJson } from "../core";

export const nodesApi = {
  getNodes: (signal?: AbortSignal) => requestJson<Node[]>(apiPath("nodes"), { signal }),
  getNodeDetail: (name: string) => requestJson<NodeDetail>(apiPath("nodes", name)),
  getNodePods: (name: string) => requestJson<Pod[]>(apiPath("nodes", name, "pods")),
  getNodeEvents: (name: string) => requestJson<K8sEvent[]>(apiPath("nodes", name, "events")),
  cordonNode: (name: string) =>
    requestJson<ActionResult>(apiPath("nodes", name, "cordon"), {
      method: "POST",
    }),
  uncordonNode: (name: string) =>
    requestJson<ActionResult>(apiPath("nodes", name, "uncordon"), {
      method: "POST",
    }),
  previewNodeDrain: (name: string) => requestJson<NodeDrainPreview>(apiPath("nodes", name, "drain", "preview")),
  drainNode: (name: string, options?: { force?: boolean; reason?: string }) =>
    requestJson<ActionResult>(`${apiPath("nodes", name, "drain")}${options?.force ? "?force=true" : ""}`, {
      method: "POST",
      body: JSON.stringify({
        force: options?.force ?? false,
        reason: options?.reason ?? "",
      }),
    }),
};
