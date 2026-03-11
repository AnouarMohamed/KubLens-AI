import type { View } from "../../types";

export const SCALEABLE_VIEWS = new Set<View>(["deployments", "statefulsets", "jobs"]);
export const RESTARTABLE_VIEWS = new Set<View>(["deployments", "statefulsets", "jobs"]);
export const ROLLBACK_VIEWS = new Set<View>(["deployments"]);
