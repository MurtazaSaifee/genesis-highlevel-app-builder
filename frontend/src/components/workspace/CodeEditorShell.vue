<script setup lang="ts">
import { ref } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";
import MonacoEditor from "./MonacoEditor.vue";
import FileTree from "./FileTree.vue";
import {
  FileCode,
  Copy,
  Check,
  FileText,
  Layers,
  Terminal,
  FileJson,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Loader2,
} from "lucide-vue-next";

const workspaceStore = useWorkspaceStore();

const copied = ref(false);

async function handleCopy() {
  const content = workspaceStore.files[workspaceStore.activeFilename] || "";
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(content);
    }
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 1500);
  } catch (err) {
    console.error("Failed to copy code:", err);
  }
}

function getFileIcon(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return FileCode;
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs") || lower.endsWith(".ts"))
    return Terminal;
  if (lower.endsWith(".css")) return Layers;
  if (lower.endsWith(".json")) return FileJson;
  return FileText;
}

function getFileIconColor(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text-amber-500";
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs") || lower.endsWith(".ts"))
    return "text-yellow-400";
  if (lower.endsWith(".css")) return "text-sky-400";
  if (lower.endsWith(".json")) return "text-emerald-400";
  return "text-slate-400";
}

function handleCloseTab(filename: string, event: MouseEvent) {
  event.stopPropagation();
  workspaceStore.closeTab(filename);
}
</script>

<template>
  <div class="h-full flex flex-col bg-card border-r border-border overflow-hidden">
    <!-- Header with File Tree Toggle & Multi-File Tabs -->
    <div class="h-10 px-2 border-b border-border flex items-center justify-between bg-muted/40 shrink-0 select-none">
      <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar min-w-0 flex-1">
        <!-- Toggle Explorer Button -->
        <button
          type="button"
          @click="workspaceStore.toggleFileTree()"
          :class="[
            'h-7 px-2 rounded-md text-xs flex items-center gap-1 transition-colors cursor-pointer shrink-0',
            workspaceStore.isFileTreeOpen
              ? 'bg-muted text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
          ]"
          :title="workspaceStore.isFileTreeOpen ? 'Collapse Explorer' : 'Expand Explorer'"
        >
          <PanelLeftClose v-if="workspaceStore.isFileTreeOpen" class="h-3.5 w-3.5" />
          <PanelLeftOpen v-else class="h-3.5 w-3.5" />
          <span class="hidden sm:inline text-[11px]">Files</span>
        </button>

        <div class="h-4 w-px bg-border shrink-0 mx-0.5"></div>

        <!-- Open File Tabs -->
        <div class="flex items-center gap-1 overflow-x-auto no-scrollbar">
          <div
            v-for="filename in workspaceStore.openFiles"
            :key="filename"
            @click="workspaceStore.setActiveFilename(filename)"
            :class="[
              'group h-7 px-2.5 rounded-md text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer shrink-0',
              workspaceStore.activeFilename === filename
                ? 'bg-background text-foreground font-semibold shadow-2xs border border-border/80'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
            ]"
          >
            <component :is="getFileIcon(filename)" :class="['h-3 w-3 shrink-0', getFileIconColor(filename)]" />
            <span class="text-[11px]">{{ filename }}</span>

            <!-- Streaming pulse dot on active streaming file tab -->
            <span
              v-if="workspaceStore.isStreaming && workspaceStore.streamingFilename === filename"
              class="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse ml-0.5 shrink-0"
              title="Streaming content"
            ></span>

            <!-- Tab Close Button (visible if > 1 open tab) -->
            <button
              v-if="workspaceStore.openFiles.length > 1"
              type="button"
              @click="handleCloseTab(filename, $event)"
              class="ml-1 -mr-1 h-4 w-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground transition-opacity cursor-pointer"
              title="Close tab"
            >
              <X class="h-2.5 w-2.5" />
            </button>
          </div>
        </div>
      </div>

      <!-- Right Actions in Editor Header -->
      <div class="flex items-center gap-1 shrink-0 ml-2">
        <button
          type="button"
          @click="handleCopy"
          class="h-7 px-2.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-1.5 transition-colors cursor-pointer"
          title="Copy active file content"
        >
          <Check v-if="copied" class="h-3 w-3 text-emerald-500" />
          <Copy v-else class="h-3 w-3" />
          <span class="hidden sm:inline text-[11px]">{{ copied ? "Copied" : "Copy" }}</span>
        </button>
      </div>
    </div>

    <!-- Main Workspace Area: File Tree + Monaco Editor Viewport -->
    <div class="flex-1 flex overflow-hidden relative">
      <!-- Collapsible File Tree Sidebar -->
      <div
        v-show="workspaceStore.isFileTreeOpen"
        class="w-44 sm:w-52 shrink-0 h-full border-r border-border overflow-hidden transition-all duration-150"
      >
        <FileTree />
      </div>

      <!-- Monaco Code Editor Viewport -->
      <div class="flex-1 h-full min-w-0 bg-[#1e1e1e] overflow-hidden relative">
        <slot name="editor">
          <MonacoEditor />
        </slot>
      </div>
    </div>

    <!-- Status Bar Footer -->
    <div class="h-6 px-3 border-t border-border bg-muted/50 flex items-center justify-between text-[11px] font-mono text-muted-foreground shrink-0 select-none">
      <div class="flex items-center gap-3">
        <!-- Status Indicator -->
        <span v-if="workspaceStore.isStreaming" class="flex items-center gap-1 text-amber-500 font-medium">
          <Loader2 class="h-3 w-3 animate-spin text-amber-500" />
          <span>Streaming {{ workspaceStore.streamingFilename || 'code' }}...</span>
        </span>
        <span v-else class="flex items-center gap-1.5 text-foreground">
          <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
          <span>Ready</span>
        </span>
        <span class="hidden sm:inline">UTF-8</span>
      </div>

      <div class="flex items-center gap-3">
        <span class="text-primary font-medium">{{ workspaceStore.activeFilename }}</span>
        <span class="uppercase text-[10px] px-1 py-0.2 rounded bg-muted font-sans font-semibold">
          {{ workspaceStore.activeLanguage }}
        </span>
        <span>Ln {{ workspaceStore.cursorPosition.line }}, Col {{ workspaceStore.cursorPosition.col }}</span>
      </div>
    </div>
  </div>
</template>
