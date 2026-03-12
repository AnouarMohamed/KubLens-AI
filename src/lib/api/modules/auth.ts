import type { AuthSession, ClusterContextList, ClusterSelectResponse } from "../../../types";
import { apiPath, buildStreamURL, buildStreamWSURL, requestJson } from "../core";

export const authApi = {
  login: (token: string) =>
    requestJson<AuthSession>(apiPath("auth", "login"), {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  logout: () =>
    requestJson<AuthSession>(apiPath("auth", "logout"), {
      method: "POST",
      body: JSON.stringify({}),
    }),
  getStreamURL: () => buildStreamURL(),
  getStreamWSURL: () => buildStreamWSURL(),
  getAuthSession: () => requestJson<AuthSession>(apiPath("auth", "session")),
  getClusters: () => requestJson<ClusterContextList>(apiPath("clusters")),
  selectCluster: (name: string) =>
    requestJson<ClusterSelectResponse>(apiPath("clusters", "select"), {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
};
