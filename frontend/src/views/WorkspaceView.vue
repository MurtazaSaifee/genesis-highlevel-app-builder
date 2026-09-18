<script setup lang="ts">
import { onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useHighLevelStore } from "@/stores/highlevel";
import { useProjectsStore } from "@/stores/projects";
import { useWorkspaceStore } from "@/stores/workspace";
import AppHeader from "@/components/layout/AppHeader.vue";
import SettingsDialog from "@/components/layout/SettingsDialog.vue";
import HighLevelConnectModal from "@/components/layout/HighLevelConnectModal.vue";
import ProjectModal from "@/components/workspace/ProjectModal.vue";
import WorkspaceLayout from "@/components/workspace/WorkspaceLayout.vue";
import { CheckCircle2, AlertCircle, X } from "lucide-vue-next";

const router = useRouter();
const authStore = useAuthStore();
const hlStore = useHighLevelStore();
const projectsStore = useProjectsStore();
const workspaceStore = useWorkspaceStore();

onMounted(async () => {
  // Check for OAuth redirect callback query params (?hl_connected=true or ?hl_error=...)
  if (window.location.search) {
    hlStore.handleUrlCallback(new URLSearchParams(window.location.search));
  }

  if (authStore.userId) {
    hlStore.startListening(authStore.userId);
    await projectsStore.fetchProjects(authStore.userId);
    if (projectsStore.activeProject) {
      workspaceStore.loadProjectFiles(
        projectsStore.activeProject.files,
        projectsStore.activeProject.lastActiveFilename
      );
    }
  }
});

watch(
  () => authStore.userId,
  async (newUserId) => {
    if (newUserId) {
      hlStore.startListening(newUserId);
      await projectsStore.fetchProjects(newUserId);
      if (projectsStore.activeProject) {
        workspaceStore.loadProjectFiles(
          projectsStore.activeProject.files,
          projectsStore.activeProject.lastActiveFilename
        );
      }
    } else {
      hlStore.stopListening();
    }
  }
);

function handleProjectCreated(_id: string) {
  if (projectsStore.activeProject) {
    workspaceStore.loadProjectFiles(
      projectsStore.activeProject.files,
      projectsStore.activeProject.lastActiveFilename
    );
  }
}

onUnmounted(() => {
  hlStore.stopListening();
});

async function handleSignOut() {
  try {
    hlStore.stopListening();
    await authStore.signOut();
    router.push("/login");
  } catch (err) {
    console.error("Sign out error:", err);
  }
}

function handlePromptSelected(prompt: string) {
  console.log("Starter prompt selected:", prompt);
}

function handleRefreshPreview() {
  console.log("Refresh preview requested");
}

function handleOpenExternalPreview() {
  console.log("Open external preview requested");
}
</script>

<template>
  <div class="h-screen w-screen flex flex-col overflow-hidden bg-background">
    <!-- Top Navigation Header -->
    <AppHeader @signOut="handleSignOut" />

    <!-- Toast Notification Banner for HighLevel OAuth / Errors -->
    <div
      v-if="hlStore.successNotification"
      class="fixed bottom-4 right-4 z-50 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2 shadow-lg animate-in slide-in-from-bottom-2"
    >
      <CheckCircle2 class="h-4 w-4 shrink-0 text-emerald-500" />
      <span>{{ hlStore.successNotification }}</span>
      <button @click="hlStore.clearNotifications" class="ml-2 text-muted-foreground hover:text-foreground">
        <X class="h-3.5 w-3.5" />
      </button>
    </div>

    <div
      v-if="hlStore.error"
      class="fixed bottom-4 right-4 z-50 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2 shadow-lg animate-in slide-in-from-bottom-2"
    >
      <AlertCircle class="h-4 w-4 shrink-0 text-destructive" />
      <span>{{ hlStore.error }}</span>
      <button @click="hlStore.clearNotifications" class="ml-2 text-muted-foreground hover:text-foreground">
        <X class="h-3.5 w-3.5" />
      </button>
    </div>

    <!-- Main 3-Panel Split Workspace Layout -->
    <WorkspaceLayout
      @promptSelected="handlePromptSelected"
      @refreshPreview="handleRefreshPreview"
      @openExternalPreview="handleOpenExternalPreview"
    />

    <!-- Settings Dialog (BYOK) -->
    <SettingsDialog />

    <!-- HighLevel Connection Modal -->
    <HighLevelConnectModal />

    <!-- Project Modals (Create & Edit) -->
    <ProjectModal
      :open="projectsStore.isCreateModalOpen"
      mode="create"
      @update:open="(val) => (projectsStore.isCreateModalOpen = val)"
      @success="handleProjectCreated"
    />
    <ProjectModal
      :open="projectsStore.isEditModalOpen"
      mode="edit"
      @update:open="(val) => (projectsStore.isEditModalOpen = val)"
    />
  </div>
</template>
