import type { Playbook, PlaybookDomain } from "./types";

const DOMAIN_ORDER: PlaybookDomain[] = ["nodes", "workloads", "networking", "storage", "security", "platform"];
const HIGH_URGENCY_TERMS = ["outage", "notready", "crashloop", "oom", "critical", "certificate", "dns"];
const MEDIUM_URGENCY_TERMS = ["throttle", "latency", "error", "drift", "rollout", "restart"];

export type PlaybookUrgency = "high" | "medium" | "low";

export function classifyPlaybook(playbook: Playbook): PlaybookDomain {
  const key = `${playbook.id} ${playbook.title}`.toLowerCase();

  if (matchesAny(key, ["node", "kubelet", "eviction", "disk-pressure", "time-skew"])) {
    return "nodes";
  }
  if (matchesAny(key, ["dns", "ingress", "service", "networkpolicy"])) {
    return "networking";
  }
  if (matchesAny(key, ["pvc", "volume", "storage"])) {
    return "storage";
  }
  if (matchesAny(key, ["secret", "cert", "rbac", "webhook"])) {
    return "security";
  }
  if (matchesAny(key, ["api-throttling", "control-plane", "alert-fatigue"])) {
    return "platform";
  }
  return "workloads";
}

export function domainLabel(domain: PlaybookDomain): string {
  return domain === "nodes"
    ? "Nodes"
    : domain === "workloads"
      ? "Workloads"
      : domain === "networking"
        ? "Networking"
        : domain === "storage"
          ? "Storage"
          : domain === "security"
            ? "Security"
            : "Platform";
}

export function sortedDomains(items: Playbook[]): PlaybookDomain[] {
  const present = new Set<PlaybookDomain>();
  for (const item of items) {
    present.add(classifyPlaybook(item));
  }
  return DOMAIN_ORDER.filter((domain) => present.has(domain));
}

export function matchesPlaybookQuery(playbook: Playbook, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return true;
  }
  const haystack =
    `${playbook.title} ${playbook.whenToUse} ${playbook.primaryGoal} ${playbook.commands.join(" ")} ${playbook.steps.join(" ")} ${playbook.verify.join(" ")}`.toLowerCase();
  return haystack.includes(needle);
}

export function playbookUrgency(playbook: Playbook): PlaybookUrgency {
  const key = `${playbook.id} ${playbook.title} ${playbook.whenToUse}`.toLowerCase();
  if (matchesAny(key, HIGH_URGENCY_TERMS)) {
    return "high";
  }
  if (matchesAny(key, MEDIUM_URGENCY_TERMS)) {
    return "medium";
  }
  return "low";
}

export function urgencyLabel(urgency: PlaybookUrgency): string {
  return urgency === "high" ? "High urgency" : urgency === "medium" ? "Medium urgency" : "Low urgency";
}

function matchesAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}
