import type { ResourceRecord } from "../../types";

export interface DeploymentDetail {
  target: ResourceRecord;
  yaml: string;
}
