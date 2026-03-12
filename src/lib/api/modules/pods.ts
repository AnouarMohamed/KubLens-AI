import type { ActionResult, K8sEvent, Pod, PodCreateRequest, PodDetail } from "../../../types";
import { apiPath, requestJson, requestText } from "../core";

export const podsApi = {
  getEvents: () => requestJson<K8sEvent[]>(apiPath("events")),
  getPods: () => requestJson<Pod[]>(apiPath("pods")),
  createPod: (payload: PodCreateRequest) =>
    requestJson<ActionResult>(apiPath("pods"), {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getPodDetail: (namespace: string, name: string) => requestJson<PodDetail>(apiPath("pods", namespace, name)),
  getPodEvents: (namespace: string, name: string) => requestJson<K8sEvent[]>(apiPath("pods", namespace, name, "events")),
  getPodLogs: (namespace: string, name: string, lines = 100, container?: string) => {
    const params = new URLSearchParams();
    if (lines > 0) {
      params.set("lines", String(lines));
    }
    if (container && container.trim() !== "") {
      params.set("container", container.trim());
    }
    const suffix = params.toString();
    return requestText(`${apiPath("pods", namespace, name, "logs")}${suffix ? `?${suffix}` : ""}`);
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
    return fetch(`${apiPath("pods", namespace, name, "logs", "stream")}${suffix ? `?${suffix}` : ""}`, {
      credentials: "same-origin",
      signal,
    });
  },
  getPodDescribe: (namespace: string, name: string) => requestText(apiPath("pods", namespace, name, "describe")),
  restartPod: (namespace: string, name: string) =>
    requestJson<ActionResult>(apiPath("pods", namespace, name, "restart"), {
      method: "POST",
    }),
  deletePod: (namespace: string, name: string) =>
    requestJson<ActionResult>(apiPath("pods", namespace, name), {
      method: "DELETE",
    }),
};
