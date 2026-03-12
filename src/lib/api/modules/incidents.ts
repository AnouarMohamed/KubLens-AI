import type { Incident, IncidentStepStatusPatch, Postmortem } from "../../../types";
import { apiPath, requestJson } from "../core";

export const incidentsApi = {
  createIncident: () =>
    requestJson<Incident>(apiPath("incidents"), {
      method: "POST",
      body: JSON.stringify({}),
    }),
  listIncidents: () => requestJson<Incident[]>(apiPath("incidents")),
  getIncident: (id: string) => requestJson<Incident>(apiPath("incidents", id)),
  updateIncidentStep: (id: string, stepID: string, payload: IncidentStepStatusPatch) =>
    requestJson<Incident>(apiPath("incidents", id, "steps", stepID), {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  resolveIncident: (id: string) =>
    requestJson<Incident>(apiPath("incidents", id, "resolve"), {
      method: "POST",
      body: JSON.stringify({}),
    }),
  generatePostmortem: (incidentID: string) =>
    requestJson<Postmortem>(apiPath("incidents", incidentID, "postmortem"), {
      method: "POST",
      body: JSON.stringify({}),
    }),
  listPostmortems: () => requestJson<Postmortem[]>(apiPath("postmortems")),
  getPostmortem: (id: string) => requestJson<Postmortem>(apiPath("postmortems", id)),
};
