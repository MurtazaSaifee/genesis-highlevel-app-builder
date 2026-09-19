import { defineStore } from "pinia";
import { ref, computed } from "vue";
import {
  collection,
  getDocs,
  addDoc,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "../lib/firebase.ts";
import { useAuthStore } from "./auth.ts";
import { useProjectsStore } from "./projects.ts";
import { useWorkspaceStore } from "./workspace.ts";
import type {
  ProjectSnapshot,
  CreateSnapshotPayload,
} from "../types/snapshot.ts";

export const useSnapshotsStore = defineStore("snapshots", () => {
  const authStore = useAuthStore();
  const projectsStore = useProjectsStore();
  const workspaceStore = useWorkspaceStore();

  const snapshots = ref<ProjectSnapshot[]>([]);
  const loading = ref<boolean>(false);
  const restoring = ref<boolean>(false);
  const error = ref<string | null>(null);

  // UI Drawer/Sheet state
  const isSheetOpen = ref<boolean>(false);
  const selectedSnapshotId = ref<string | null>(null);

  const snapshotCount = computed(() => snapshots.value.length);

  const selectedSnapshot = computed<ProjectSnapshot | null>(() => {
    if (!selectedSnapshotId.value) return snapshots.value[0] || null;
    return snapshots.value.find((s) => s.id === selectedSnapshotId.value) || null;
  });

  function openSheet() {
    isSheetOpen.value = true;
    if (projectsStore.activeProjectId) {
      fetchSnapshots(projectsStore.activeProjectId);
    }
  }

  function closeSheet() {
    isSheetOpen.value = false;
  }

  function toggleSheet() {
    if (isSheetOpen.value) {
      closeSheet();
    } else {
      openSheet();
    }
  }

  function selectSnapshot(id: string) {
    selectedSnapshotId.value = id;
  }

  /**
   * Fetch all snapshots for a project from Firestore subcollection
   */
  async function fetchSnapshots(projectId: string): Promise<ProjectSnapshot[]> {
    if (!projectId) {
      snapshots.value = [];
      return [];
    }

    loading.value = true;
    error.value = null;

    try {
      const snapshotsColRef = collection(db, "projects", projectId, "snapshots");
      let snapshotDocs;
      try {
        const q = query(snapshotsColRef, orderBy("createdAt", "desc"), limit(50));
        snapshotDocs = await getDocs(q);
      } catch (orderErr) {
        // Fallback in case composite index is not initialized in local emulator
        console.warn("[SnapshotsStore] Fallback to client-side sort:", orderErr);
        snapshotDocs = await getDocs(snapshotsColRef);
      }

      const loaded: ProjectSnapshot[] = [];
      snapshotDocs.forEach((docSnap) => {
        const data = docSnap.data();
        loaded.push({
          id: docSnap.id,
          projectId,
          userId: data.userId || authStore.userId || "",
          createdAt: Number(data.createdAt) || Date.now(),
          trigger: data.trigger || "manual",
          description: data.description || "Snapshot",
          prompt: data.prompt || undefined,
          files: data.files || {},
          filesCount: typeof data.filesCount === "number" ? data.filesCount : Object.keys(data.files || {}).length,
          messageId: data.messageId || undefined,
        });
      });

      // Sort descending by createdAt
      loaded.sort((a, b) => b.createdAt - a.createdAt);
      snapshots.value = loaded;

      if (!selectedSnapshotId.value && loaded.length > 0) {
        selectedSnapshotId.value = loaded[0].id;
      }

      return loaded;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[SnapshotsStore] Error fetching snapshots:", err);
      error.value = msg;
      return [];
    } finally {
      loading.value = false;
    }
  }

  /**
   * Create an immutable snapshot in Firestore subcollection
   */
  async function createSnapshot(
    projectId: string,
    payload: CreateSnapshotPayload
  ): Promise<ProjectSnapshot | null> {
    const uid = authStore.userId;
    if (!projectId || !uid) {
      console.warn("[SnapshotsStore] Cannot create snapshot without projectId and userId");
      return null;
    }

    const now = payload.createdAt || Date.now();
    const filesCount = Object.keys(payload.files).length;
    const docData = {
      projectId,
      userId: uid,
      createdAt: now,
      trigger: payload.trigger,
      description: payload.description.trim() || "Snapshot Checkpoint",
      prompt: payload.prompt?.trim() || null,
      files: { ...payload.files },
      filesCount,
      messageId: payload.messageId || null,
    };

    try {
      const snapshotsColRef = collection(db, "projects", projectId, "snapshots");
      const docRef = await addDoc(snapshotsColRef, docData);

      const created: ProjectSnapshot = {
        id: docRef.id,
        projectId,
        userId: uid,
        createdAt: now,
        trigger: payload.trigger,
        description: payload.description.trim() || "Snapshot Checkpoint",
        prompt: payload.prompt?.trim() || undefined,
        files: { ...payload.files },
        filesCount,
        messageId: payload.messageId || undefined,
      };

      // Prepend to local reactive list
      snapshots.value.unshift(created);
      selectedSnapshotId.value = created.id;

      return created;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[SnapshotsStore] Error creating snapshot:", err);
      error.value = msg;
      return null;
    }
  }

  /**
   * Manually record a user-triggered checkpoint
   */
  async function takeManualSnapshot(
    projectId: string,
    description: string = "Manual Checkpoint"
  ): Promise<ProjectSnapshot | null> {
    const filesToSave = { ...workspaceStore.files };
    return await createSnapshot(projectId, {
      trigger: "manual",
      description: description.trim() || "Manual Checkpoint",
      files: filesToSave,
    });
  }

  /**
   * Restore a historical snapshot to the workspace and Firestore
   */
  async function restoreSnapshot(
    snapshot: ProjectSnapshot
  ): Promise<boolean> {
    if (!snapshot || !snapshot.projectId || restoring.value) return false;

    restoring.value = true;
    error.value = null;

    try {
      // 1. Safety Checkpoint: Snapshot the CURRENT state before restoring
      const currentFiles = { ...workspaceStore.files };
      await createSnapshot(snapshot.projectId, {
        trigger: "pre-restore",
        description: `Safety backup before restoring "${snapshot.description}"`,
        files: currentFiles,
      });

      // 2. Load restored files into workspaceStore
      workspaceStore.loadProjectFiles(snapshot.files);

      // 3. Persist the restored files to Firestore project document
      await projectsStore.saveProjectFiles(
        snapshot.projectId,
        snapshot.files,
        workspaceStore.activeFilename
      );

      // 4. Trigger live preview reload
      workspaceStore.triggerPreviewReload();

      // 5. Append system notification to chat messages
      workspaceStore.addMessage({
        id: `sys-${Date.now()}`,
        role: "system",
        content: `Restored project to snapshot from ${new Date(
          snapshot.createdAt
        ).toLocaleTimeString()}: "${snapshot.description}"`,
        timestamp: Date.now(),
      });

      selectedSnapshotId.value = snapshot.id;
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[SnapshotsStore] Error restoring snapshot:", err);
      error.value = msg;
      return false;
    } finally {
      restoring.value = false;
    }
  }

  return {
    snapshots,
    loading,
    restoring,
    error,
    isSheetOpen,
    selectedSnapshotId,
    selectedSnapshot,
    snapshotCount,
    openSheet,
    closeSheet,
    toggleSheet,
    selectSnapshot,
    fetchSnapshots,
    createSnapshot,
    takeManualSnapshot,
    restoreSnapshot,
  };
});
