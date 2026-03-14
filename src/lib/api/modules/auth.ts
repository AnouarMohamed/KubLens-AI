import type { AuthSession, ClusterContextList, ClusterSelectResponse } from "../../../types";
import { apiRoute, buildStreamURL, buildStreamWSURL, requestJson } from "../core";

export const authApi = {
  login: (token: string) =>
    requestJson<AuthSession>(apiRoute("/auth/login"), {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  logout: () =>
    requestJson<AuthSession>(apiRoute("/auth/logout"), {
      method: "POST",
      body: JSON.stringify({}),
    }),
  getStreamURL: () => buildStreamURL(),
  getStreamWSURL: () => buildStreamWSURL(),
  getAuthSession: () => requestJson<AuthSession>(apiRoute("/auth/session")),
  getClusters: () => requestJson<ClusterContextList>(apiRoute("/clusters")),
  selectCluster: (name: string) =>
    requestJson<ClusterSelectResponse>(apiRoute("/clusters/select"), {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
};
