import type { ActionResult, K8sEvent, Node, NodeDetail, NodeDrainPreview, Pod } from "../../../types";
import { apiRoute, requestJson } from "../core";

export const nodesApi = {
  getNodes: (signal?: AbortSignal) => requestJson<Node[]>(apiRoute("/nodes"), { signal }),
  getNodeDetail: (name: string) => requestJson<NodeDetail>(apiRoute("/nodes/{name}", { name })),
  getNodePods: (name: string) => requestJson<Pod[]>(apiRoute("/nodes/{name}/pods", { name })),
  getNodeEvents: (name: string) => requestJson<K8sEvent[]>(apiRoute("/nodes/{name}/events", { name })),
  cordonNode: (name: string) =>
    requestJson<ActionResult>(apiRoute("/nodes/{name}/cordon", { name }), {
      method: "POST",
    }),
  uncordonNode: (name: string) =>
    requestJson<ActionResult>(apiRoute("/nodes/{name}/uncordon", { name }), {
      method: "POST",
    }),
  previewNodeDrain: (name: string) => requestJson<NodeDrainPreview>(apiRoute("/nodes/{name}/drain/preview", { name })),
  drainNode: (name: string, options?: { force?: boolean; reason?: string }) =>
    requestJson<ActionResult>(`${apiRoute("/nodes/{name}/drain", { name })}${options?.force ? "?force=true" : ""}`, {
      method: "POST",
      body: JSON.stringify({
        force: options?.force ?? false,
        reason: options?.reason ?? "",
      }),
    }),
};
