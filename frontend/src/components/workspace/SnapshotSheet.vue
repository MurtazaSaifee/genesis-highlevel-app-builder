<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { useSnapshotsStore } from "@/stores/snapshots";
import { useProjectsStore } from "@/stores/projects";
import { useWorkspaceStore } from "@/stores/workspace";
import type { ProjectSnapshot } from "@/types/snapshot";
import {
  History,
  X,
  Plus,
  Sparkles,
  Bookmark,
  ShieldCheck,
  Clock,
  RotateCcw,
  FileCode,
  Check,
  ChevronRight,
  ChevronDown,
  Loader2,
  Eye,
} from "lucide-vue-next";

const snapshotsStore = useSnapshotsStore();
const projectsStore = useProjectsStore();
const workspaceStore = useWorkspaceStore();

const isCreatingManual = ref(false);
const manualNote = ref("");
const expandedSnapshotId = ref<string | null>(null);
const previewingFile = ref<{ snapshotId: string; filename: string } | null>(null);
const confirmingRestoreId = ref<string | null>(null);
const restoreSuccess = ref(false);

// Close on Escape key
function handleKeyDown(e: KeyboardEvent) {
  if (e.key === "Escape" && snapshotsStore.isSheetOpen) {
    snapshotsStore.closeSheet();
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeyDown);
});

// Reset states on open/close
watch(
  () => snapshotsStore.isSheetOpen,
  (open) => {
    if (!open) {
      isCreatingManual.value = false;
      manualNote.value = "";
      confirmingRestoreId.value = null;
      restoreSuccess.value = false;
    }
  }
);

async function handleCreateManual() {
  const note = manualNote.value.trim() || "Manual Checkpoint";
  const activeProjId = projectsStore.activeProjectId;
  if (!activeProjId) return;

  await snapshotsStore.takeManualSnapshot(activeProjId, note);
  manualNote.value = "";
  isCreatingManual.value = false;
}

function toggleExpand(snapshotId: string) {
  if (expandedSnapshotId.value === snapshotId) {
    expandedSnapshotId.value = null;
    previewingFile.value = null;
  } else {
    expandedSnapshotId.value = snapshotId;
    const snap = snapshotsStore.snapshots.find((s) => s.id === snapshotId);
    if (snap && Object.keys(snap.files).length > 0) {
      const firstFile = Object.keys(snap.files)[0];
      previewingFile.value = { snapshotId, filename: firstFile };
    }
  }
}

function handleSelectFilePreview(snapshotId: string, filename: string) {
  previewingFile.value = { snapshotId, filename };
}

function getPreviewContent(): string {
  if (!previewingFile.value) return "";
  const snap = snapshotsStore.snapshots.find(
    (s) => s.id === previewingFile.value?.snapshotId
  );
  if (!snap || !snap.files) return "";
  return snap.files[previewingFile.value.filename] || "";
}

function requestRestore(snapshot: ProjectSnapshot) {
  confirmingRestoreId.value = snapshot.id;
}

function cancelRestore() {
  confirmingRestoreId.value = null;
}

async function executeRestore(snapshot: ProjectSnapshot) {
  const success = await snapshotsStore.restoreSnapshot(snapshot);
  confirmingRestoreId.value = null;
  if (success) {
    restoreSuccess.value = true;
    setTimeout(() => {
      restoreSuccess.value = false;
    }, 3000);
  }
}

function isCurrentWorkspaceMatch(snapshot: ProjectSnapshot): boolean {
  if (!snapshot.files) return false;
  const currentFiles = workspaceStore.files;
  const snapFiles = snapshot.files;

  const currentKeys = Object.keys(currentFiles);
  const snapKeys = Object.keys(snapFiles);
  if (currentKeys.length !== snapKeys.length) return false;

  for (const k of currentKeys) {
    if (currentFiles[k] !== snapFiles[k]) return false;
  }
  return true;
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return "";
  const diff = Date.now() - timestamp;
  if (diff < 30000) return "just now";
  if (diff < 60000) return "1m ago";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFullTime(timestamp: number): string {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
</script>

<template>
  <!-- Backdrop -->
  <Transition
    enter-active-class="transition-opacity ease-out duration-200"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity ease-in duration-150"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="snapshotsStore.isSheetOpen"
      class="fixed inset-0 bg-background/80 backdrop-blur-xs z-50 transition-all"
      @click="snapshotsStore.closeSheet"
    />
  </Transition>

  <!-- Slide-Over Sheet -->
  <Transition
    enter-active-class="transform transition ease-in-out duration-300 sm:duration-300"
    enter-from-class="translate-x-full"
    enter-to-class="translate-x-0"
    leave-active-class="transform transition ease-in-out duration-200"
    leave-from-class="translate-x-0"
    leave-to-class="translate-x-full"
  >
    <div
      v-if="snapshotsStore.isSheetOpen"
      class="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-card border-l border-border shadow-2xl flex flex-col overflow-hidden select-none"
    >
      <!-- Sheet Header -->
      <div class="px-5 py-4 border-b border-border flex items-center justify-between bg-muted/40 shrink-0">
        <div class="flex items-center gap-2.5">
          <div class="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <History class="h-4 w-4" />
          </div>
          <div>
            <h2 class="text-sm font-semibold text-foreground flex items-center gap-2">
              Version History & Snapshots
              <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-secondary text-secondary-foreground border border-border">
                {{ snapshotsStore.snapshotCount }}
              </span>
            </h2>
            <p class="text-xs text-muted-foreground truncate max-w-xs">
              {{ projectsStore.activeProject?.name || "Active Project" }}
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <!-- Create Manual Checkpoint Trigger -->
          <button
            type="button"
            @click="isCreatingManual = !isCreatingManual"
            class="h-8 px-2.5 rounded-md text-xs font-medium border border-border bg-card hover:bg-muted text-foreground flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Create manual point-in-time checkpoint"
          >
            <Plus class="h-3.5 w-3.5" />
            <span class="hidden sm:inline">Checkpoint</span>
          </button>

          <!-- Close Sheet Button -->
          <button
            type="button"
            @click="snapshotsStore.closeSheet"
            class="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            title="Close version history (Esc)"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
      </div>

      <!-- Success Notification Banner -->
      <div
        v-if="restoreSuccess"
        class="px-5 py-2.5 bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium flex items-center gap-2 animate-fadeIn"
      >
        <Check class="h-3.5 w-3.5 shrink-0" />
        <span>Project files successfully restored! Live preview and editor reloaded.</span>
      </div>

      <!-- Manual Checkpoint Creator Form -->
      <div
        v-if="isCreatingManual"
        class="p-4 border-b border-border bg-secondary/30 space-y-2 animate-fadeIn"
      >
        <div class="flex items-center justify-between">
          <label class="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Bookmark class="h-3.5 w-3.5 text-emerald-500" />
            <span>Create Manual Checkpoint</span>
          </label>
          <span class="text-[11px] text-muted-foreground">Snapshot all current workspace files</span>
        </div>
        <div class="flex items-center gap-2">
          <input
            type="text"
            v-model="manualNote"
            placeholder="Checkpoint note (e.g., Before redesigning cards)"
            class="flex-1 px-3 py-1.5 text-xs rounded-md bg-background border border-border focus:outline-hidden focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
            @keydown.enter.prevent="handleCreateManual"
          />
          <button
            type="button"
            @click="handleCreateManual"
            class="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer shrink-0"
          >
            Save Checkpoint
          </button>
        </div>
      </div>

      <!-- Snapshots List Area -->
      <div class="flex-1 overflow-y-auto p-4 space-y-3">
        <!-- Loading State -->
        <div
          v-if="snapshotsStore.loading && snapshotsStore.snapshots.length === 0"
          class="py-12 flex flex-col items-center justify-center text-muted-foreground gap-2"
        >
          <Loader2 class="h-6 w-6 animate-spin text-primary" />
          <span class="text-xs">Loading version snapshots...</span>
        </div>

        <!-- Empty State -->
        <div
          v-else-if="snapshotsStore.snapshots.length === 0"
          class="py-12 px-6 flex flex-col items-center justify-center text-center text-muted-foreground space-y-3"
        >
          <div class="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
            <History class="h-6 w-6 opacity-60" />
          </div>
          <div>
            <h3 class="text-sm font-semibold text-foreground">No Snapshots Yet</h3>
            <p class="text-xs text-muted-foreground mt-1 max-w-xs">
              Every generation automatically records a point-in-time snapshot here. You can also create manual checkpoints anytime.
            </p>
          </div>
          <button
            type="button"
            @click="handleCreateManual"
            class="px-3.5 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
          >
            Create First Checkpoint
          </button>
        </div>

        <!-- Snapshot Cards Timeline -->
        <div v-else class="space-y-3">
          <div
            v-for="snapshot in snapshotsStore.snapshots"
            :key="snapshot.id"
            :class="[
              'rounded-xl border transition-all p-3.5 bg-card',
              isCurrentWorkspaceMatch(snapshot)
                ? 'border-emerald-500/40 shadow-xs'
                : 'border-border hover:border-border/80 hover:shadow-2xs',
            ]"
          >
            <!-- Card Header: Badge, Timestamp, & Match State -->
            <div class="flex items-center justify-between gap-2 mb-2">
              <div class="flex items-center gap-2">
                <!-- Trigger Badge -->
                <span
                  v-if="snapshot.trigger === 'generation'"
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                >
                  <Sparkles class="h-3 w-3" />
                  <span>Generation</span>
                </span>
                <span
                  v-else-if="snapshot.trigger === 'pre-restore'"
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                >
                  <ShieldCheck class="h-3 w-3" />
                  <span>Safety Backup</span>
                </span>
                <span
                  v-else
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                >
                  <Bookmark class="h-3 w-3" />
                  <span>Manual Checkpoint</span>
                </span>

                <!-- Active workspace match tag -->
                <span
                  v-if="isCurrentWorkspaceMatch(snapshot)"
                  class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  title="Current workspace matches this snapshot exactly"
                >
                  <Check class="h-2.5 w-2.5" />
                  <span>Current</span>
                </span>
              </div>

              <!-- Timestamp -->
              <span
                class="text-[11px] text-muted-foreground font-mono flex items-center gap-1"
                :title="formatFullTime(snapshot.createdAt)"
              >
                <Clock class="h-3 w-3 opacity-70" />
                <span>{{ formatRelativeTime(snapshot.createdAt) }}</span>
              </span>
            </div>

            <!-- Description / Prompt -->
            <p class="text-xs font-medium text-foreground mb-2 line-clamp-2 leading-relaxed">
              {{ snapshot.description }}
            </p>

            <!-- Files list chips -->
            <div class="flex flex-wrap items-center gap-1.5 mb-3">
              <span class="text-[10px] text-muted-foreground uppercase font-mono tracking-wider mr-1">
                {{ snapshot.filesCount }} files:
              </span>
              <span
                v-for="filename in Object.keys(snapshot.files || {})"
                :key="filename"
                class="px-1.5 py-0.5 rounded-md text-[10px] font-mono bg-secondary/80 text-secondary-foreground border border-border/60"
              >
                {{ filename }}
              </span>
            </div>

            <!-- Actions Bar: Restore & Preview Toggle -->
            <div class="flex items-center justify-between pt-2 border-t border-border/60">
              <!-- Preview File Accordion Button -->
              <button
                type="button"
                @click="toggleExpand(snapshot.id)"
                class="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Eye class="h-3.5 w-3.5" />
                <span>{{ expandedSnapshotId === snapshot.id ? "Hide Code" : "Inspect Files" }}</span>
                <ChevronDown
                  v-if="expandedSnapshotId === snapshot.id"
                  class="h-3 w-3"
                />
                <ChevronRight v-else class="h-3 w-3" />
              </button>

              <!-- Restore Controls -->
              <div>
                <!-- Confirming Restore State -->
                <div
                  v-if="confirmingRestoreId === snapshot.id"
                  class="flex items-center gap-1.5 animate-fadeIn"
                >
                  <button
                    type="button"
                    @click="executeRestore(snapshot)"
                    :disabled="snapshotsStore.restoring"
                    class="px-2.5 py-1 text-xs font-medium rounded-md bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                  >
                    <Loader2 v-if="snapshotsStore.restoring" class="h-3 w-3 animate-spin" />
                    <RotateCcw v-else class="h-3 w-3" />
                    <span>Confirm Restore</span>
                  </button>
                  <button
                    type="button"
                    @click="cancelRestore"
                    :disabled="snapshotsStore.restoring"
                    class="px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded-md border border-border hover:bg-muted transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>

                <!-- Normal Restore Button -->
                <button
                  v-else
                  type="button"
                  @click="requestRestore(snapshot)"
                  :disabled="snapshotsStore.restoring"
                  class="h-7 px-2.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-muted text-foreground flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  title="Revert workspace files to this snapshot"
                >
                  <RotateCcw class="h-3 w-3 text-muted-foreground" />
                  <span>Restore</span>
                </button>
              </div>
            </div>

            <!-- Expandable Code Preview Drawer -->
            <div
              v-if="expandedSnapshotId === snapshot.id"
              class="mt-3 pt-3 border-t border-border bg-background rounded-lg p-2.5 animate-fadeIn"
            >
              <!-- File Tabs within snapshot -->
              <div class="flex items-center gap-1.5 mb-2 overflow-x-auto no-scrollbar pb-1 border-b border-border">
                <button
                  v-for="fn in Object.keys(snapshot.files || {})"
                  :key="fn"
                  type="button"
                  @click="handleSelectFilePreview(snapshot.id, fn)"
                  :class="[
                    'px-2 py-0.5 rounded text-[11px] font-mono flex items-center gap-1 transition-colors cursor-pointer',
                    previewingFile?.filename === fn
                      ? 'bg-primary/10 text-primary font-medium border border-primary/20'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                  ]"
                >
                  <FileCode class="h-3 w-3" />
                  <span>{{ fn }}</span>
                </button>
              </div>

              <!-- Code Content Box -->
              <div class="relative max-h-52 overflow-auto rounded bg-[#1e1e1e] p-2.5 font-mono text-[11px] text-slate-200 leading-relaxed">
                <pre><code>{{ getPreviewContent() }}</code></pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Sheet Footer Info -->
      <div class="px-5 py-3 border-t border-border bg-muted/40 text-[11px] text-muted-foreground flex items-center justify-between shrink-0 font-mono">
        <span class="flex items-center gap-1.5">
          <ShieldCheck class="h-3.5 w-3.5 text-emerald-500" />
          <span>Non-destructive: Pre-restore safety backup is created automatically on every revert.</span>
        </span>
      </div>
    </div>
  </Transition>
</template>
