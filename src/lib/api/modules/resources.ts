import type {
  ActionResult,
  ApplyResourceYAMLResponse,
  ResourceList,
  ResourceManifest,
  ScaleRequest,
} from "../../../types";
import { apiPath, requestJson } from "../core";

export const resourcesApi = {
  getNamespaces: () => requestJson<string[]>(apiPath("namespaces")),
  getResources: (kind: string) => requestJson<ResourceList>(apiPath("resources", kind)),
  getResourceYAML: (kind: string, namespace: string, name: string) =>
    requestJson<ResourceManifest>(apiPath("resources", kind, namespace, name, "yaml")),
  applyResourceYAML: (kind: string, namespace: string, name: string, payload: ResourceManifest) =>
    requestJson<ApplyResourceYAMLResponse>(apiPath("resources", kind, namespace, name, "yaml"), {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  applyResourceYAMLWithForce: (
    kind: string,
    namespace: string,
    name: string,
    payload: ResourceManifest,
    force: boolean,
  ) =>
    requestJson<ApplyResourceYAMLResponse>(
      `${apiPath("resources", kind, namespace, name, "yaml")}${force ? "?force=true" : ""}`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      },
    ),
  scaleResource: (kind: string, namespace: string, name: string, payload: ScaleRequest) =>
    requestJson<ActionResult>(apiPath("resources", kind, namespace, name, "scale"), {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  restartResource: (kind: string, namespace: string, name: string) =>
    requestJson<ActionResult>(apiPath("resources", kind, namespace, name, "restart"), {
      method: "POST",
    }),
  rollbackResource: (kind: string, namespace: string, name: string) =>
    requestJson<ActionResult>(apiPath("resources", kind, namespace, name, "rollback"), {
      method: "POST",
    }),
};
