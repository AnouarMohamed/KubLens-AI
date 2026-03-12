import type { K8sEvent, NodeDetail, NodeDrainPreview, Pod } from "../../../types";

interface NodeDrainOptions {
  force?: boolean;
  reason?: string;
}

export type NodeDetailTab = "conditions" | "pods" | "events" | "maintenance";

export interface NodeDetailModalProps {
  selectedNode: NodeDetail | null;
  nodePods: Pod[];
  nodeEvents: K8sEvent[];
  lastDrainPreview: NodeDrainPreview | null;
  isBusy: boolean;
  onCordon: (name: string) => Promise<void>;
  onUncordon: (name: string) => Promise<void>;
  onPreviewDrain: (name: string) => Promise<void>;
  onDrain: (name: string, options?: NodeDrainOptions) => Promise<void>;
  onClose: () => void;
}

export interface PodInspectorState {
  title: string;
  content: string;
}
