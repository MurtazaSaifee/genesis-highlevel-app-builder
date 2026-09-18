<script setup lang="ts">
import { ref } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";
import {
  Code2,
  FileCode,
  Copy,
  Check,
  FileText,
  Layers,
  Terminal,
} from "lucide-vue-next";

const workspaceStore = useWorkspaceStore();

const copied = ref(false);

function handleCopy() {
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 1500);
}

function getFileIcon(filename: string) {
  if (filename.endsWith(".html")) return FileCode;
  if (filename.endsWith(".js") || filename.endsWith(".ts")) return Terminal;
  if (filename.endsWith(".css")) return Layers;
  return FileText;
}
</script>

<template>
  <div class="h-full flex flex-col bg-card border-r border-border overflow-hidden">
    <!-- Header with Multi-File Tabs -->
    <div class="h-10 px-2 border-b border-border flex items-center justify-between bg-muted/40 shrink-0">
      <div class="flex items-center gap-1 overflow-x-auto no-scrollbar">
        <button
          v-for="filename in workspaceStore.openFiles"
          :key="filename"
          type="button"
          @click="workspaceStore.setActiveFilename(filename)"
          :class="[
            'h-7 px-2.5 rounded-md text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer shrink-0',
            workspaceStore.activeFilename === filename
              ? 'bg-background text-foreground font-semibold shadow-xs border border-border/80'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
          ]"
        >
          <component :is="getFileIcon(filename)" class="h-3 w-3 text-primary" />
          <span>{{ filename }}</span>
        </button>
      </div>

      <!-- Right Actions in Editor Header -->
      <div class="flex items-center gap-1">
        <button
          type="button"
          @click="handleCopy"
          class="h-7 px-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-1 transition-colors cursor-pointer"
          title="Copy active file content"
        >
          <Check v-if="copied" class="h-3 w-3 text-emerald-500" />
          <Copy v-else class="h-3 w-3" />
          <span class="hidden sm:inline text-[11px]">{{ copied ? "Copied" : "Copy" }}</span>
        </button>
      </div>
    </div>

    <!-- Main Editor Canvas Area (Task 09 Monaco mounting slot) -->
    <div class="flex-1 bg-[#1e1e1e] text-[#d4d4d4] font-mono text-xs overflow-hidden relative">
      <slot name="editor">
        <!-- Monaco Editor Placeholder Shell -->
        <div class="h-full w-full flex flex-col items-center justify-center p-6 text-center text-muted-foreground/60 select-none">
          <Code2 class="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p class="font-medium text-xs text-muted-foreground">Monaco Code Editor Viewport</p>
          <p class="text-[11px] text-muted-foreground/60 max-w-sm mt-1">
            Active file: <span class="text-primary font-mono">{{ workspaceStore.activeFilename }}</span>
          </p>
          <span class="mt-3 px-2 py-0.5 rounded text-[10px] font-mono bg-white/5 border border-white/10 text-white/40">
            Mounting in Task 09 (@guolao/vue-monaco-editor)
          </span>
        </div>
      </slot>
    </div>

    <!-- Status Bar Footer -->
    <div class="h-6 px-3 border-t border-border bg-muted/50 flex items-center justify-between text-[11px] font-mono text-muted-foreground shrink-0 select-none">
      <div class="flex items-center gap-3">
        <span class="flex items-center gap-1 text-foreground">
          <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
          <span>Ready</span>
        </span>
        <span class="hidden sm:inline">UTF-8</span>
      </div>

      <div class="flex items-center gap-3">
        <span>{{ workspaceStore.activeFilename }}</span>
        <span>Ln 1, Col 1</span>
      </div>
    </div>
  </div>
</template>
