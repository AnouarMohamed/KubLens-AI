import type { ActionResult, K8sEvent, Pod, PodCreateRequest, PodDetail } from "../../../types";
import { apiRoute, requestJson, requestText } from "../core";

export const podsApi = {
  getEvents: (signal?: AbortSignal) => requestJson<K8sEvent[]>(apiRoute("/events"), { signal }),
  getPods: (signal?: AbortSignal) => requestJson<Pod[]>(apiRoute("/pods"), { signal }),
  createPod: (payload: PodCreateRequest) =>
    requestJson<ActionResult>(apiRoute("/pods"), {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getPodDetail: (namespace: string, name: string) =>
    requestJson<PodDetail>(apiRoute("/pods/{namespace}/{name}", { namespace, name })),
  getPodEvents: (namespace: string, name: string) =>
    requestJson<K8sEvent[]>(apiRoute("/pods/{namespace}/{name}/events", { namespace, name })),
  getPodLogs: (namespace: string, name: string, lines = 100, container?: string) => {
    const params = new URLSearchParams();
    if (lines > 0) {
      params.set("lines", String(lines));
    }
    if (container && container.trim() !== "") {
      params.set("container", container.trim());
    }
    const suffix = params.toString();
    return requestText(
      `${apiRoute("/pods/{namespace}/{name}/logs", { namespace, name })}${suffix ? `?${suffix}` : ""}`,
    );
  },
  streamPodLogs: (
    namespace: string,
    name: string,
    lines = 50,
    container?: string,
    signal?: AbortSignal,
  ): Promise<Response> => {
    const params = new URLSearchParams();
    if (lines > 0) {
      params.set("lines", String(lines));
    }
    if (container && container.trim() !== "") {
      params.set("container", container.trim());
    }
    const suffix = params.toString();
    return fetch(
      `${apiRoute("/pods/{namespace}/{name}/logs/stream", { namespace, name })}${suffix ? `?${suffix}` : ""}`,
      {
        credentials: "same-origin",
        signal,
      },
    );
  },
  getPodDescribe: (namespace: string, name: string) =>
    requestText(apiRoute("/pods/{namespace}/{name}/describe", { namespace, name })),
  restartPod: (namespace: string, name: string) =>
    requestJson<ActionResult>(apiRoute("/pods/{namespace}/{name}/restart", { namespace, name }), {
      method: "POST",
    }),
  deletePod: (namespace: string, name: string) =>
    requestJson<ActionResult>(apiRoute("/pods/{namespace}/{name}", { namespace, name }), {
      method: "DELETE",
    }),
};
