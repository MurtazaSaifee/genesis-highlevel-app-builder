<script setup lang="ts">
import { ref, computed, shallowRef } from "vue";
import { VueMonacoDiffEditor } from "@guolao/vue-monaco-editor";
import type * as monacoEditor from "monaco-editor";
import { useWorkspaceStore } from "@/stores/workspace";
import { useSnapshotsStore } from "@/stores/snapshots";
import { useProjectsStore } from "@/stores/projects";
import {
  GitCompare,
  Columns,
  Rows,
  History,
  AlertCircle,
  FileCheck,
  FilePlus,
  Loader2,
} from "lucide-vue-next";

const workspaceStore = useWorkspaceStore();
const snapshotsStore = useSnapshotsStore();
const projectsStore = useProjectsStore();

// UI Configuration
const renderSideBySide = ref(true);
const selectedBaselineId = ref<string | null>(null);
const diffEditorInstance = shallowRef<monacoEditor.editor.IStandaloneDiffEditor | null>(null);

// Available baseline snapshots from store
const snapshots = computed(() => snapshotsStore.snapshots);

// Resolve baseline snapshot to compare against
const baselineSnapshot = computed(() => {
  if (snapshots.value.length === 0) return null;
  if (selectedBaselineId.value) {
    const found = snapshots.value.find((s) => s.id === selectedBaselineId.value);
    if (found) return found;
  }
  return snapshots.value[0] || null;
});

// Original text (from chosen baseline snapshot)
const originalCode = computed(() => {
  if (!baselineSnapshot.value) return "";
  return baselineSnapshot.value.files[workspaceStore.activeFilename] ?? "";
});

// Current modified text (from workspace active file)
const modifiedCode = computed(() => {
  return workspaceStore.files[workspaceStore.activeFilename] ?? "";
});

// Diff Status Analysis
const isIdentical = computed(() => originalCode.value === modifiedCode.value);
const isNewFile = computed(() => !originalCode.value && modifiedCode.value.length > 0);
const isDeletedFile = computed(() => originalCode.value.length > 0 && !modifiedCode.value);

const diffOptions = computed<monacoEditor.editor.IStandaloneDiffEditorConstructionOptions>(() => ({
  automaticLayout: true,
  readOnly: true,
  originalEditable: false,
  renderSideBySide: renderSideBySide.value,
  minimap: { enabled: false },
  fontSize: 13,
  lineNumbers: "on",
  scrollBeyondLastLine: false,
  wordWrap: "on",
  tabSize: 2,
  fontFamily: "JetBrains Mono, Menlo, Monaco, 'Courier New', monospace",
  smoothScrolling: true,
  contextmenu: true,
  enableSplitViewResizing: true,
}));

function handleMount(editor: monacoEditor.editor.IStandaloneDiffEditor) {
  diffEditorInstance.value = editor;
}

function formatSnapshotTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}
</script>

<template>
  <div class="h-full w-full flex flex-col bg-[#1e1e1e] overflow-hidden select-none">
    <!-- Diff Sub-Header / Controls Bar -->
    <div class="h-9 px-3 border-b border-border/40 bg-muted/20 flex items-center justify-between text-xs shrink-0">
      <!-- Left: Baseline Snapshot Selection -->
      <div class="flex items-center gap-2 min-w-0">
        <GitCompare class="h-3.5 w-3.5 text-amber-500 shrink-0" />
        <span class="text-muted-foreground hidden sm:inline text-[11px]">Compare with:</span>

        <div v-if="snapshots.length > 0" class="relative">
          <select
            v-model="selectedBaselineId"
            class="h-6 px-2 pr-6 rounded bg-muted/60 border border-border/60 text-foreground text-[11px] font-mono focus:outline-hidden focus:ring-1 focus:ring-primary appearance-none cursor-pointer"
          >
            <option
              v-for="(snap, idx) in snapshots"
              :key="snap.id"
              :value="snap.id"
            >
              {{ idx === 0 ? "Latest Snapshot (" : "" }}{{ snap.description }} ({{ formatSnapshotTime(snap.createdAt) }}){{ idx === 0 ? ")" : "" }}
            </option>
          </select>
        </div>

        <span v-else class="text-[11px] text-muted-foreground/60 italic">
          No snapshots recorded yet
        </span>

        <!-- Diff Status Badges -->
        <span
          v-if="isIdentical && snapshots.length > 0"
          class="hidden md:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground"
        >
          <FileCheck class="h-3 w-3 text-emerald-500" />
          No changes
        </span>
        <span
          v-else-if="isNewFile"
          class="hidden md:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-emerald-950/60 border border-emerald-800/40 text-emerald-400"
        >
          <FilePlus class="h-3 w-3 text-emerald-400" />
          New file in current version
        </span>
        <span
          v-else-if="isDeletedFile"
          class="hidden md:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-destructive/20 border border-destructive/40 text-destructive"
        >
          <AlertCircle class="h-3 w-3 text-destructive" />
          File removed in current version
        </span>
        <span
          v-else-if="snapshots.length > 0"
          class="hidden md:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-950/50 border border-amber-800/40 text-amber-300 font-mono"
        >
          Modified
        </span>
      </div>

      <!-- Right: Diff Layout Controls (Side-by-Side vs Inline) -->
      <div class="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          @click="renderSideBySide = !renderSideBySide"
          class="h-6 px-2 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center gap-1 transition-colors cursor-pointer"
          :title="renderSideBySide ? 'Switch to Inline Diff' : 'Switch to Side-by-Side Diff'"
        >
          <Columns v-if="renderSideBySide" class="h-3 w-3 text-amber-500" />
          <Rows v-else class="h-3 w-3 text-amber-500" />
          <span class="hidden sm:inline">{{ renderSideBySide ? "Side-by-Side" : "Inline" }}</span>
        </button>

        <button
          type="button"
          @click="snapshotsStore.openSheet()"
          class="h-6 px-2 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center gap-1 transition-colors cursor-pointer"
          title="Open Snapshot History Drawer"
        >
          <History class="h-3 w-3" />
          <span class="hidden sm:inline">All Snapshots</span>
        </button>
      </div>
    </div>

    <!-- Main Diff Viewport -->
    <div class="flex-1 w-full relative overflow-hidden">
      <!-- Empty state when no snapshots exist -->
      <div
        v-if="snapshots.length === 0"
        class="h-full w-full flex flex-col items-center justify-center p-6 text-center text-muted-foreground select-none"
      >
        <GitCompare class="h-10 w-10 text-muted-foreground/30 mb-3" />
        <h4 class="font-medium text-foreground text-sm mb-1">No Prior Snapshots Available</h4>
        <p class="text-xs text-muted-foreground max-w-sm mb-4">
          Genesis automatically creates a point-in-time snapshot after every AI code generation. Prompt the AI or create a manual snapshot to begin comparing diffs.
        </p>
        <button
          type="button"
          @click="snapshotsStore.takeManualSnapshot(projectsStore.activeProjectId || 'default', 'Initial Baseline')"
          class="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
        >
          <History class="h-3.5 w-3.5" />
          <span>Create First Snapshot</span>
        </button>
      </div>

      <!-- Monaco Diff Editor Instance -->
      <VueMonacoDiffEditor
        v-else
        :original="originalCode"
        :modified="modifiedCode"
        :language="workspaceStore.activeLanguage"
        theme="vs-dark"
        :options="diffOptions"
        @mount="handleMount"
        class="h-full w-full"
      >
        <template #loading>
          <div class="h-full w-full flex flex-col items-center justify-center p-6 text-center text-muted-foreground/60 select-none bg-[#1e1e1e]">
            <Loader2 class="h-8 w-8 text-primary animate-spin mb-3" />
            <p class="font-mono text-xs text-muted-foreground">Calculating Monaco Diff...</p>
          </div>
        </template>
      </VueMonacoDiffEditor>
    </div>
  </div>
</template>
