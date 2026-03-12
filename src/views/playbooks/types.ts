export interface Playbook {
  id: string;
  title: string;
  whenToUse: string;
  primaryGoal: string;
  commands: string[];
  steps: string[];
  verify: string[];
}

export type PlaybookDomain = "nodes" | "workloads" | "networking" | "storage" | "security" | "platform";
