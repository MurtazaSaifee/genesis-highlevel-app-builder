import { defineStore } from "pinia";
import { ref, computed } from "vue";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase.ts";
import { useAuthStore } from "./auth.ts";
import { useHighLevelStore } from "./highlevel.ts";
import { STARTER_FILES } from "./workspace.ts";
import type { Project, ProjectDraft } from "../types/project.ts";

export const STORAGE_ACTIVE_PROJECT_KEY = "genesis_active_project_id";

export const useProjectsStore = defineStore("projects", () => {
  const authStore = useAuthStore();
  const hlStore = useHighLevelStore();

  const projects = ref<Project[]>([]);
  const activeProjectId = ref<string | null>(null);
  const loading = ref<boolean>(false);
  const error = ref<string | null>(null);

  // Modal UI state
  const isCreateModalOpen = ref<boolean>(false);
  const isEditModalOpen = ref<boolean>(false);
  const editingProject = ref<Project | null>(null);

  const activeProject = computed<Project | null>(() => {
    if (!activeProjectId.value) return null;
    return projects.value.find((p) => p.id === activeProjectId.value && !p.isDeleted) || null;
  });

  const activeProjectsList = computed<Project[]>(() => {
    return projects.value
      .filter((p) => !p.isDeleted)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  });

  /**
   * Fetch all active projects for the current user from Firestore
   */
  async function fetchProjects(targetUserId?: string): Promise<Project[]> {
    const uid = targetUserId || authStore.userId;
    if (!uid) {
      projects.value = [];
      activeProjectId.value = null;
      return [];
    }

    loading.value = true;
    error.value = null;

    try {
      const q = query(
        collection(db, "projects"),
        where("userId", "==", uid),
        where("isDeleted", "==", false)
      );

      const snapshot = await getDocs(q);
      const loadedProjects: Project[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        loadedProjects.push({
          id: docSnap.id,
          userId: data.userId,
          name: data.name || "Untitled Project",
          description: data.description || "",
          locationId: data.locationId || null,
          files: data.files || { ...STARTER_FILES },
          isDeleted: Boolean(data.isDeleted),
          deletedAt: data.deletedAt || null,
          createdAt: data.createdAt || Date.now(),
          updatedAt: data.updatedAt || Date.now(),
          lastActiveFilename: data.lastActiveFilename || "index.html",
        });
      });

      // Sort descending by updatedAt
      loadedProjects.sort((a, b) => b.updatedAt - a.updatedAt);
      projects.value = loadedProjects;

      // Handle active project resolution
      if (loadedProjects.length === 0) {
        // Automatically provision a default project
        const defaultProj = await createDefaultProject(uid);
        return [defaultProj];
      }

      // Check if previously stored activeProjectId exists
      let storedId: string | null = null;
      try {
        storedId = localStorage.getItem(STORAGE_ACTIVE_PROJECT_KEY);
      } catch {
        // In-memory or restricted environment
      }

      const matchingProject = loadedProjects.find((p) => p.id === storedId);
      if (matchingProject) {
        activeProjectId.value = matchingProject.id;
      } else if (!activeProjectId.value || !loadedProjects.some((p) => p.id === activeProjectId.value)) {
        activeProjectId.value = loadedProjects[0].id;
        try {
          localStorage.setItem(STORAGE_ACTIVE_PROJECT_KEY, loadedProjects[0].id);
        } catch {
          // ignore
        }
      }

      return loadedProjects;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[ProjectsStore] Error fetching projects:", err);
      error.value = msg;
      return [];
    } finally {
      loading.value = false;
    }
  }

  /**
   * Create a new project in Firestore and set it as active
   */
  async function createProject(
    draft: ProjectDraft,
    initialFiles?: Record<string, string>
  ): Promise<Project | null> {
    const uid = authStore.userId;
    if (!uid) {
      error.value = "User must be authenticated to create a project.";
      return null;
    }

    const trimmedName = draft.name.trim();
    if (!trimmedName) {
      error.value = "Project name cannot be empty.";
      return null;
    }

    loading.value = true;
    error.value = null;

    try {
      const newDocRef = doc(collection(db, "projects"));
      const now = Date.now();

      const newProject: Project = {
        id: newDocRef.id,
        userId: uid,
        name: trimmedName,
        description: draft.description?.trim() || "",
        locationId: draft.locationId ?? hlStore.locationId ?? null,
        files: initialFiles ? { ...initialFiles } : { ...STARTER_FILES },
        isDeleted: false,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
        lastActiveFilename: "index.html",
      };

      await setDoc(newDocRef, newProject);

      projects.value.unshift(newProject);
      activeProjectId.value = newProject.id;
      try {
        localStorage.setItem(STORAGE_ACTIVE_PROJECT_KEY, newProject.id);
      } catch {
        // ignore
      }

      return newProject;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[ProjectsStore] Error creating project:", err);
      error.value = msg;
      return null;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Create default initial project for fresh accounts
   */
  async function createDefaultProject(userId: string): Promise<Project> {
    const newDocRef = doc(collection(db, "projects"));
    const now = Date.now();

    const defaultProject: Project = {
      id: newDocRef.id,
      userId,
      name: "My First HighLevel App",
      description: "Starter CRM Dashboard integrating HighLevel Contacts & Calendars",
      locationId: hlStore.locationId || null,
      files: { ...STARTER_FILES },
      isDeleted: false,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
      lastActiveFilename: "index.html",
    };

    try {
      await setDoc(newDocRef, defaultProject);
    } catch (err) {
      console.warn("[ProjectsStore] Could not persist default project to Firestore:", err);
    }

    projects.value = [defaultProject];
    activeProjectId.value = defaultProject.id;
    try {
      localStorage.setItem(STORAGE_ACTIVE_PROJECT_KEY, defaultProject.id);
    } catch {
      // ignore
    }

    return defaultProject;
  }

  /**
   * Update project metadata (name, description, locationId)
   */
  async function updateProjectMetadata(
    projectId: string,
    updates: Partial<ProjectDraft>
  ): Promise<boolean> {
    const target = projects.value.find((p) => p.id === projectId);
    if (!target) return false;

    const now = Date.now();
    const cleanUpdates: Partial<Project> = {
      updatedAt: now,
    };

    if (updates.name !== undefined) {
      const trimmed = updates.name.trim();
      if (!trimmed) return false;
      cleanUpdates.name = trimmed;
    }
    if (updates.description !== undefined) {
      cleanUpdates.description = updates.description.trim();
    }
    if (updates.locationId !== undefined) {
      cleanUpdates.locationId = updates.locationId || null;
    }

    try {
      const docRef = doc(db, "projects", projectId);
      await updateDoc(docRef, cleanUpdates);

      Object.assign(target, cleanUpdates);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[ProjectsStore] Error updating project metadata:", err);
      error.value = msg;
      return false;
    }
  }

  /**
   * Soft-delete a project (mark isDeleted = true)
   */
  async function deleteProject(projectId: string): Promise<boolean> {
    const target = projects.value.find((p) => p.id === projectId);
    if (!target) return false;

    const now = Date.now();

    try {
      const docRef = doc(db, "projects", projectId);
      await updateDoc(docRef, {
        isDeleted: true,
        deletedAt: now,
        updatedAt: now,
      });

      target.isDeleted = true;
      target.deletedAt = now;
      target.updatedAt = now;

      // If active project was deleted, switch to another
      if (activeProjectId.value === projectId) {
        const remaining = activeProjectsList.value;
        if (remaining.length > 0) {
          await selectProject(remaining[0].id);
        } else if (authStore.userId) {
          await createDefaultProject(authStore.userId);
        } else {
          activeProjectId.value = null;
        }
      }

      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[ProjectsStore] Error soft-deleting project:", err);
      error.value = msg;
      return false;
    }
  }

  /**
   * Select active project and store preference in localStorage
   */
  async function selectProject(projectId: string): Promise<Project | null> {
    const target = projects.value.find((p) => p.id === projectId && !p.isDeleted);
    if (!target) return null;

    activeProjectId.value = target.id;
    try {
      localStorage.setItem(STORAGE_ACTIVE_PROJECT_KEY, target.id);
    } catch {
      // ignore
    }

    return target;
  }

  /**
   * Save files and active filename to Firestore for a project
   */
  async function saveProjectFiles(
    projectId: string,
    files: Record<string, string>,
    lastActiveFilename?: string
  ): Promise<boolean> {
    const target = projects.value.find((p) => p.id === projectId);
    if (!target) return false;

    const now = Date.now();
    const payload: Record<string, unknown> = {
      files,
      updatedAt: now,
    };
    if (lastActiveFilename) {
      payload.lastActiveFilename = lastActiveFilename;
    }

    try {
      const docRef = doc(db, "projects", projectId);
      await updateDoc(docRef, payload);

      target.files = { ...files };
      target.updatedAt = now;
      if (lastActiveFilename) {
        target.lastActiveFilename = lastActiveFilename;
      }
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[ProjectsStore] Error saving project files:", err);
      error.value = msg;
      return false;
    }
  }

  // Modal helpers
  function openCreateModal() {
    isCreateModalOpen.value = true;
  }

  function closeCreateModal() {
    isCreateModalOpen.value = false;
  }

  function openEditModal(proj: Project) {
    editingProject.value = { ...proj };
    isEditModalOpen.value = true;
  }

  function closeEditModal() {
    isEditModalOpen.value = false;
    editingProject.value = null;
  }

  return {
    projects,
    activeProjectId,
    loading,
    error,
    isCreateModalOpen,
    isEditModalOpen,
    editingProject,
    activeProject,
    activeProjectsList,
    fetchProjects,
    createProject,
    createDefaultProject,
    updateProjectMetadata,
    deleteProject,
    selectProject,
    saveProjectFiles,
    openCreateModal,
    closeCreateModal,
    openEditModal,
    closeEditModal,
  };
});
