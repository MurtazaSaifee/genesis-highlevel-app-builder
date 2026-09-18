export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string;
  locationId: string | null;
  files: Record<string, string>;
  isDeleted: boolean;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
  lastActiveFilename?: string;
}

export interface ProjectDraft {
  name: string;
  description?: string;
  locationId?: string | null;
}

export type SaveStatus = "saved" | "saving" | "unsaved" | "error";
