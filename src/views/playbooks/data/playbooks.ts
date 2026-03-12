import type { Playbook } from "../types";
import { NETWORKING_PLAYBOOKS } from "./domains/networking";
import { NODE_PLAYBOOKS } from "./domains/nodes";
import { PLATFORM_PLAYBOOKS } from "./domains/platform";
import { SECURITY_PLAYBOOKS } from "./domains/security";
import { STORAGE_PLAYBOOKS } from "./domains/storage";
import { WORKLOAD_PLAYBOOKS } from "./domains/workloads";

export const PLAYBOOKS: Playbook[] = [
  ...NODE_PLAYBOOKS,
  ...WORKLOAD_PLAYBOOKS,
  ...NETWORKING_PLAYBOOKS,
  ...STORAGE_PLAYBOOKS,
  ...SECURITY_PLAYBOOKS,
  ...PLATFORM_PLAYBOOKS,
];
