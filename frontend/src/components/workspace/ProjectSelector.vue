<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useProjectsStore } from "@/stores/projects";
import { useWorkspaceStore } from "@/stores/workspace";
import type { Project } from "@/types/project";
import {
  FolderGit2,
  ChevronDown,
  Plus,
  Settings2,
  Trash2,
  Check,
  Clock,
  Loader2,
  AlertCircle,
} from "lucide-vue-next";

const projectsStore = useProjectsStore();
const workspaceStore = useWorkspaceStore();

const isOpen = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);

function toggleDropdown() {
  isOpen.value = !isOpen.value;
}

function closeDropdown() {
  isOpen.value = false;
}

async function handleSelectProject(proj: Project) {
  if (projectsStore.activeProjectId === proj.id) {
    closeDropdown();
    return;
  }
  workspaceStore.clearChat();
  await projectsStore.selectProject(proj.id);
  workspaceStore.loadProjectFiles(proj.files, proj.lastActiveFilename);
  closeDropdown();
}

function handleOpenCreate() {
  closeDropdown();
  projectsStore.openCreateModal();
}

function handleOpenEdit(proj: Project, e: Event) {
  e.stopPropagation();
  closeDropdown();
  projectsStore.openEditModal(proj);
}

async function handleDeleteProject(proj: Project, e: Event) {
  e.stopPropagation();
  if (confirm(`Are you sure you want to delete "${proj.name}"?`)) {
    const wasActive = projectsStore.activeProjectId === proj.id;
    await projectsStore.deleteProject(proj.id);
    if (wasActive && projectsStore.activeProject) {
      workspaceStore.loadProjectFiles(
        projectsStore.activeProject.files,
        projectsStore.activeProject.lastActiveFilename
      );
    }
  }
}

// Click outside listener
function handleClickOutside(event: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    closeDropdown();
  }
}

onMounted(() => {
  document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});

function formatTime(timestamp: number): string {
  if (!timestamp) return "";
  const diff = Date.now() - timestamp;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
</script>

<template>
  <div class="relative" ref="dropdownRef">
    <!-- Trigger Button -->
    <button
      type="button"
      @click="toggleDropdown"
      class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border bg-card/80 hover:bg-muted/80 text-foreground transition-all cursor-pointer shadow-2xs max-w-[200px] sm:max-w-[240px]"
      :title="projectsStore.activeProject?.name || 'Select Project'"
    >
      <FolderGit2 class="h-4 w-4 text-primary shrink-0" />
      
      <div class="flex flex-col text-left truncate leading-tight">
        <span class="text-xs font-semibold truncate text-foreground">
          {{ projectsStore.activeProject?.name || "No Project" }}
        </span>
        <div class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <!-- Save Status Indicator -->
          <span
            v-if="workspaceStore.saveStatus === 'saving'"
            class="flex items-center gap-1 text-amber-500"
            title="Saving changes to Firestore..."
          >
            <Loader2 class="h-2.5 w-2.5 animate-spin" />
            <span class="font-mono">Saving</span>
          </span>
          <span
            v-else-if="workspaceStore.saveStatus === 'unsaved'"
            class="flex items-center gap-1 text-amber-500 font-mono"
            title="Unsaved changes pending auto-save"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            <span>Unsaved</span>
          </span>
          <span
            v-else-if="workspaceStore.saveStatus === 'error'"
            class="flex items-center gap-1 text-destructive font-mono"
            title="Failed to save changes"
          >
            <AlertCircle class="h-2.5 w-2.5" />
            <span>Save error</span>
          </span>
          <span
            v-else
            class="flex items-center gap-1 text-emerald-500 dark:text-emerald-400 font-mono"
            title="All changes saved to Firestore"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            <span>Saved</span>
          </span>
        </div>
      </div>

      <ChevronDown class="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-auto" />
    </button>

    <!-- Dropdown Menu -->
    <div
      v-if="isOpen"
      class="absolute left-0 top-full mt-1.5 w-72 sm:w-80 rounded-xl border border-border bg-popover p-1 shadow-xl z-50 animate-in fade-in-0 zoom-in-95"
    >
      <!-- Dropdown Header -->
      <div class="px-3 py-2 border-b border-border flex items-center justify-between">
        <div class="flex items-center gap-1.5">
          <span class="text-xs font-semibold text-foreground">Projects</span>
          <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-muted font-mono text-muted-foreground">
            {{ projectsStore.activeProjectsList.length }}
          </span>
        </div>
        <button
          type="button"
          @click="handleOpenCreate"
          class="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline cursor-pointer"
        >
          <Plus class="h-3 w-3" />
          <span>New Project</span>
        </button>
      </div>

      <!-- Project List -->
      <div class="max-h-64 overflow-y-auto py-1 space-y-0.5">
        <div
          v-if="projectsStore.activeProjectsList.length === 0"
          class="p-4 text-center text-xs text-muted-foreground"
        >
          No active projects found.
        </div>

        <div
          v-for="proj in projectsStore.activeProjectsList"
          :key="proj.id"
          @click="handleSelectProject(proj)"
          :class="[
            'group px-2.5 py-2 rounded-lg flex items-center justify-between text-left cursor-pointer transition-colors text-xs',
            projectsStore.activeProjectId === proj.id
              ? 'bg-primary/10 text-primary font-medium'
              : 'hover:bg-muted text-foreground',
          ]"
        >
          <div class="truncate flex-1 min-w-0 pr-2">
            <div class="flex items-center gap-1.5 truncate">
              <Check
                v-if="projectsStore.activeProjectId === proj.id"
                class="h-3.5 w-3.5 text-primary shrink-0"
              />
              <span class="truncate font-medium">{{ proj.name }}</span>
            </div>
            <div class="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
              <span class="flex items-center gap-1">
                <Clock class="h-2.5 w-2.5" />
                {{ formatTime(proj.updatedAt) }}
              </span>
              <span>•</span>
              <span>{{ Object.keys(proj.files || {}).length }} files</span>
              <span v-if="proj.locationId" class="truncate max-w-[80px] font-mono text-[9px] px-1 bg-muted rounded">
                {{ proj.locationId }}
              </span>
            </div>
          </div>

          <!-- Item Actions -->
          <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              @click="handleOpenEdit(proj, $event)"
              title="Project Settings"
              class="p-1 rounded hover:bg-background/80 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <Settings2 class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              @click="handleDeleteProject(proj, $event)"
              title="Delete Project"
              class="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive cursor-pointer"
            >
              <Trash2 class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <!-- Dropdown Footer -->
      <div class="p-1.5 border-t border-border mt-1">
        <button
          type="button"
          @click="handleOpenCreate"
          class="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors cursor-pointer"
        >
          <Plus class="h-3.5 w-3.5" />
          <span>Create New Project</span>
        </button>
      </div>
    </div>
  </div>
</template>
