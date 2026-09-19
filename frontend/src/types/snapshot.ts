export type SnapshotTrigger = "generation" | "manual" | "pre-restore";

export interface ProjectSnapshot {
  id: string;
  projectId: string;
  userId: string;
  createdAt: number;
  trigger: SnapshotTrigger;
  description: string;
  prompt?: string;
  files: Record<string, string>;
  filesCount: number;
  messageId?: string;
}

export interface CreateSnapshotPayload {
  trigger: SnapshotTrigger;
  description: string;
  prompt?: string;
  files: Record<string, string>;
  messageId?: string;
  createdAt?: number;
}
