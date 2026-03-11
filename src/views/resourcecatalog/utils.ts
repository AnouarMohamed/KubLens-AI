export function extractReplicas(status: string): number {
  const readyMatch = status.match(/^(\d+)\/(\d+)\s+Ready$/i);
  if (readyMatch) {
    return Number.parseInt(readyMatch[2], 10);
  }

  const parallelismMatch = status.match(/parallelism:\s*(\d+)/i);
  if (parallelismMatch) {
    return Number.parseInt(parallelismMatch[1], 10);
  }

  return 1;
}
